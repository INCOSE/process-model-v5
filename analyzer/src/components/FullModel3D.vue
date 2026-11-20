<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';

import { store, graphData } from '../store/graphStore.js';
import { getProcessGroup, groupLayerY, groupColors } from '../core/iso15288Groups.js';

const wrapperRef = ref(null);
const threeDiv = ref(null);

const searchQuery = ref('');
const searchFocusIdx = ref(0);
const selectedNodeInfo = ref(null);

// Full-model specific local toggles (Process Groups on by default for clarity, Labels off by default to avoid clutter)
const showLabels = ref(false);
const showProcessGroups = ref(true);

const stats = ref({ processes: 0, objects: 0, links: 0 });
const renderedNodeIds = ref([]);

let threeGraphInstance = null;
let threeLayerPlanesGroup = null;
let resizeObserver = null;
let resizeRaf = null;
let currentPlaneSize = 680;

// Matching node IDs for in-canvas text search
const searchMatchList = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q || renderedNodeIds.value.length === 0) return [];
    const gActive = graphData.gActive();
    if (!gActive) return [];

    const matches = [];
    renderedNodeIds.value.forEach((id) => {
        if (!gActive.hasNode(id)) return;
        const name = (gActive.getNodeAttribute(id, 'name') || '').toLowerCase();
        if (name.includes(q)) matches.push(id);
    });
    return matches;
});

const searchMatchSet = computed(() => {
    if (!searchQuery.value.trim()) return null;
    return new Set(searchMatchList.value);
});

const getInternalActivities = (nodeId) => {
    const gFull = graphData.gFull;
    if (!gFull || !gFull.hasNode(nodeId)) return [];
    const list = [];
    gFull.forEachOutEdge(nodeId, (edge, attr, u, v) => {
        const t = gFull.getNodeAttribute(v, 'type') || '';
        if (attr.type?.includes('Composition') && t.includes('BusinessProcess')) {
            list.push(gFull.getNodeAttribute(v, 'name') || v);
        }
    });
    return list;
};

const showNodeInfo = (nodeId) => {
    const gActive = graphData.gActive();
    if (gActive && gActive.hasNode(nodeId)) {
        const name = gActive.getNodeAttribute(nodeId, 'name') || 'Unknown';
        const type = gActive.getNodeAttribute(nodeId, 'type') || '';
        const isProc = type.includes('BusinessFunction') || type.includes('BusinessProcess');
        const group = isProc ? getProcessGroup(name) : 'Business Object';

        selectedNodeInfo.value = {
            name,
            group,
            doc: gActive.getNodeAttribute(nodeId, 'doc') || 'Description is missing in the model.',
            activities: isProc ? getInternalActivities(nodeId) : []
        };
    } else {
        selectedNodeInfo.value = null;
    }
};

// --- CLEANUP ---
const clearLayerPlanes = () => {
    if (threeLayerPlanesGroup && threeGraphInstance) {
        threeGraphInstance.scene().remove(threeLayerPlanesGroup);
        threeLayerPlanesGroup.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        });
    }
    threeLayerPlanesGroup = null;
};

const destroyGraph = () => {
    clearLayerPlanes();
    if (threeGraphInstance) {
        if (typeof threeGraphInstance._destructor === 'function') {
            threeGraphInstance._destructor();
        }
        threeGraphInstance = null;
    }
};

// --- 3D SPRITE BUILDERS ---
const createTextSprite = (node) => {
    const maxChars = 24;
    const words = (node.name || '').split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        if (!current) current = word;
        else if ((current + ' ' + word).length <= maxChars) current += ' ' + word;
        else {
            lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);

    const fontSize = node.isProc ? 18 : 15;
    const lineHeight = fontSize * 1.25;
    const padX = 12;
    const padY = 6;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontStr = `${node.isProc ? '600 ' : '500 '}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.font = fontStr;

    const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width), 36);
    canvas.width = Math.ceil(maxLineWidth + padX * 2);
    canvas.height = Math.ceil(lines.length * lineHeight + padY * 2);

    const r = 7;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = node.isProc ? '#D6B656' : '#82B366';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(r, 1);
    ctx.lineTo(w - r, 1);
    ctx.quadraticCurveTo(w - 1, 1, w - 1, r);
    ctx.lineTo(w - 1, h - r);
    ctx.quadraticCurveTo(w - 1, h - 1, w - r, h - 1);
    ctx.lineTo(r, h - 1);
    ctx.quadraticCurveTo(1, h - 1, 1, h - r);
    ctx.lineTo(1, r);
    ctx.quadraticCurveTo(1, 1, r, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = fontStr;
    ctx.fillStyle = '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, idx) => {
        ctx.fillText(line, w / 2, padY + lineHeight * (idx + 0.5));
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);

    const scale = 0.13;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.position.set(0, (node.isProc ? 9 : 6) + lines.length * 1.4, 0);
    return sprite;
};

const createLayerLabelSprite = (text, colorHex) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontStr = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.font = fontStr;
    const textW = ctx.measureText(text).width;
    canvas.width = Math.ceil(textW + 32);
    canvas.height = 46;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 3;
    ctx.fillRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    ctx.font = fontStr;
    ctx.fillStyle = colorHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(canvas.width * 0.3, canvas.height * 0.3, 1);
    return sprite;
};

const addLayerPlanes = (nodes, planeSize) => {
    if (!threeGraphInstance || !showProcessGroups.value) return;
    clearLayerPlanes();

    const activeGroups = new Set();
    nodes.forEach((n) => {
        if (n.isProc && n.group && groupLayerY[n.group] !== undefined) {
            activeGroups.add(n.group);
        }
    });
    if (activeGroups.size === 0) return;

    const groupObj = new THREE.Group();
    const half = planeSize / 2;

    activeGroups.forEach((groupName) => {
        const y = groupLayerY[groupName];
        const colorHex = groupColors[groupName] || '#546e7a';
        const threeColor = new THREE.Color(colorHex);

        const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize);
        const planeMat = new THREE.MeshBasicMaterial({
            color: threeColor,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const planeMesh = new THREE.Mesh(planeGeo, planeMat);
        planeMesh.rotation.x = -Math.PI / 2;
        planeMesh.position.y = y;
        groupObj.add(planeMesh);

        const borderPoints = [
            new THREE.Vector3(-half, y, -half),
            new THREE.Vector3(half, y, -half),
            new THREE.Vector3(half, y, half),
            new THREE.Vector3(-half, y, half)
        ];
        const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
        const borderMat = new THREE.LineBasicMaterial({ color: threeColor, transparent: true, opacity: 0.42 });
        groupObj.add(new THREE.LineLoop(borderGeo, borderMat));

        const labelSprite = createLayerLabelSprite(groupName, colorHex);
        labelSprite.position.set(-half + 85, y + 10, half - 24);
        groupObj.add(labelSprite);
    });

    threeLayerPlanesGroup = groupObj;
    threeGraphInstance.scene().add(groupObj);
};

// --- APPLY SEARCH HIGHLIGHT IN-PLACE ---
const applySearchHighlight = () => {
    if (!threeGraphInstance) return;
    const matches = searchMatchSet.value;

    threeGraphInstance
        .nodeColor((node) => {
            if (matches !== null) {
                return matches.has(node.id) ? '#E65100' : '#dde1e6';
            }
            return node.color;
        })
        .nodeVal((node) => {
            if (matches !== null && matches.has(node.id)) return Math.max(node.val * 2.2, 16);
            return node.val;
        })
        .linkColor((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            if (matches !== null) {
                return (matches.has(u) || matches.has(v)) ? '#E65100' : '#eaedf1';
            }
            return link.isSystemic ? '#c5ccd4' : '#94a3b8';
        })
        .linkWidth((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            if (matches !== null) {
                return (matches.has(u) || matches.has(v)) ? 2.2 : 0.25;
            }
            return link.isSystemic ? 0.5 : 0.9;
        })
        .linkDirectionalParticles((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            if (matches !== null) return (matches.has(u) || matches.has(v)) ? 2 : 0;
            return 0;
        })
        .linkDirectionalParticleColor(() => '#E65100');
};

// --- BUILD FULL MODEL 3D GRAPH ---
const renderFullModel = () => {
    destroyGraph();
    if (!threeDiv.value || !store.isLoaded) return;
    const gActive = graphData.gActive();
    if (!gActive) return;

    threeDiv.value.innerHTML = '';
    const layered = showProcessGroups.value;

    // Collect all BusinessFunctions and BusinessObjects (exclude internal BusinessProcess activities)
    const nodes = [];
    const includedIds = new Set();
    let procCount = 0;
    let objCount = 0;

    gActive.forEachNode((id, attr) => {
        const type = attr.type || '';
        if (type.includes('BusinessProcess')) return;

        const isProc = type.includes('BusinessFunction');
        const name = attr.name || 'Unknown';
        const group = isProc ? getProcessGroup(name) : 'Business Objects';

        if (isProc) procCount++;
        else objCount++;

        const nodeObj = {
            id,
            name,
            group,
            isProc,
            val: isProc ? 7 : 2.6,
            color: isProc ? (groupColors[group] || '#D6B656') : '#82B366'
        };

        if (layered && isProc) {
            nodeObj.fy = groupLayerY[group] ?? -170;
        }

        nodes.push(nodeObj);
        includedIds.add(id);
    });

    const links = [];
    const seenLinks = new Set();

    gActive.forEachEdge((edge, attr, source, target) => {
        if (!includedIds.has(source) || !includedIds.has(target)) return;
        if (attr.access === 'hierarchy_reverse') return;
        if (attr.type?.includes('Composition')) return;

        const key = `${source}___${target}`;
        if (seenLinks.has(key)) return;
        seenLinks.add(key);

        const type = attr.type || '';
        const subclass = attr.subclass || '';
        const access = (attr.access || '').toLowerCase();
        const isSystemic = ['Controls', 'Enables', 'Situational'].includes(subclass) || type.includes('Specialization');

        let label = '';
        if (type.includes('Access')) {
            if (subclass === 'Controls') label = 'Controls';
            else if (subclass === 'Enables') label = 'Enables';
            else if (subclass === 'Situational') label = access === 'read' ? 'Situational Input' : 'Situational Output';
            else if (access === 'read') label = 'Input';
            else if (access === 'write') label = 'Output';
        } else {
            label = type.replace('Relationship', '').replace('archimate:', '');
        }

        links.push({ source, target, name: label, isSystemic });
    });

    // Deterministic vertical placement for artefacts between their connected process layers
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    if (layered) {
        const neighbourProcessYs = new Map();
        links.forEach((l) => {
            const nU = nodeById.get(l.source);
            const nV = nodeById.get(l.target);
            if (!nU || !nV) return;
            if (nU.isProc && !nV.isProc) {
                if (!neighbourProcessYs.has(nV.id)) neighbourProcessYs.set(nV.id, []);
                neighbourProcessYs.get(nV.id).push(nU.fy);
            } else if (!nU.isProc && nV.isProc) {
                if (!neighbourProcessYs.has(nU.id)) neighbourProcessYs.set(nU.id, []);
                neighbourProcessYs.get(nU.id).push(nV.fy);
            }
        });

        let artIdx = 0;
        nodes.forEach((n) => {
            if (n.isProc) return;
            const ys = neighbourProcessYs.get(n.id);
            if (ys && ys.length > 0) {
                const uniqueYs = Array.from(new Set(ys));
                const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
                if (uniqueYs.length === 1) {
                    const offset = uniqueYs[0] >= 180 ? -30 : 30;
                    n.fy = uniqueYs[0] + offset;
                } else {
                    const stagger = ((artIdx % 3) - 1) * 7;
                    n.fy = avgY + stagger;
                }
            }
            artIdx++;
        });
    }

    renderedNodeIds.value = Array.from(includedIds);
    stats.value = { processes: procCount, objects: objCount, links: links.length };

    const planeSize = 720;
    currentPlaneSize = planeSize;
    let hasFitted = false;

    threeGraphInstance = ForceGraph3D()(threeDiv.value)
        .width(threeDiv.value.clientWidth)
        .height(threeDiv.value.clientHeight)
        .graphData({ nodes, links })
        .backgroundColor('#f8f9fb')
        .nodeRelSize(3)
        .nodeColor('color')
        .nodeVal('val')
        .nodeLabel((node) => `${node.name} (${node.group})`)
        .nodeThreeObjectExtend(true)
        .nodeThreeObject((node) => (showLabels.value ? createTextSprite(node) : null))
        .linkLabel('name')
        .linkColor((link) => (link.isSystemic ? '#c5ccd4' : '#94a3b8'))
        .linkWidth((link) => (link.isSystemic ? 0.5 : 0.9))
        .linkOpacity(0.55)
        .linkDirectionalArrowLength(3.2)
        .linkDirectionalArrowRelPos(1)
        .onNodeClick((node) => showNodeInfo(node.id))
        .onBackgroundClick(() => { selectedNodeInfo.value = null; })
        .onEngineStop(() => {
            if (!hasFitted && threeGraphInstance) {
                hasFitted = true;
                fitView();
            }
        });

    const linkForce = threeGraphInstance.d3Force('link');
    if (linkForce) linkForce.distance(layered ? 95 : 105);
    const chargeForce = threeGraphInstance.d3Force('charge');
    if (chargeForce) chargeForce.strength(layered ? -220 : -280);

    if (layered) {
        const limit = planeSize / 2 - 30;
        threeGraphInstance.d3Force('planeBounds', () => {
            nodes.forEach((n) => {
                if (typeof n.x === 'number') {
                    if (n.x > limit) { n.x = limit; n.vx = 0; }
                    else if (n.x < -limit) { n.x = -limit; n.vx = 0; }
                }
                if (typeof n.z === 'number') {
                    if (n.z > limit) { n.z = limit; n.vz = 0; }
                    else if (n.z < -limit) { n.z = -limit; n.vz = 0; }
                }
            });
        });
        addLayerPlanes(nodes, planeSize);
    }

    if (searchMatchSet.value !== null) {
        applySearchHighlight();
    }
};

// --- CONTROLS ---
const fitView = () => {
    if (!threeGraphInstance) return;
    if (showProcessGroups.value) {
        const d = currentPlaneSize * 0.92;
        threeGraphInstance.cameraPosition({ x: d * 0.78, y: 240, z: d * 0.95 }, { x: 0, y: 0, z: 0 }, 650);
    } else {
        threeGraphInstance.zoomToFit(600, 60);
    }
};

const clearSearch = () => {
    searchQuery.value = '';
    searchFocusIdx.value = 0;
};

const focusNextSearchMatch = () => {
    if (!threeGraphInstance || searchMatchList.value.length === 0) return;
    const targetId = searchMatchList.value[searchFocusIdx.value % searchMatchList.value.length];
    searchFocusIdx.value = (searchFocusIdx.value + 1) % searchMatchList.value.length;

    const nodes = threeGraphInstance.graphData().nodes || [];
    const node = nodes.find((n) => n.id === targetId);
    if (node && typeof node.x === 'number') {
        const distance = 155;
        const len = Math.hypot(node.x || 1, node.y || 1, node.z || 1);
        const distRatio = 1 + distance / len;
        threeGraphInstance.cameraPosition(
            { x: node.x * distRatio, y: node.y + 40, z: node.z * distRatio },
            node,
            650
        );
    }
};

const exportImage = () => {
    if (!threeGraphInstance || !threeDiv.value) return;
    threeGraphInstance.renderer().render(threeGraphInstance.scene(), threeGraphInstance.camera());
    const canvas = threeDiv.value.querySelector('canvas');
    if (canvas) {
        const a = document.createElement('a');
        a.download = 'ISO15288_Full_Model_3D.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
    }
};

const syncSize = () => {
    if (threeGraphInstance && threeDiv.value) {
        threeGraphInstance.width(threeDiv.value.clientWidth);
        threeGraphInstance.height(threeDiv.value.clientHeight);
    }
};

const scheduleResize = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
        syncSize();
        resizeRaf = null;
    });
};

// Rebuild when model or global settings or 3D options change
watch(
    () => [
        store.isLoaded,
        store.modelName,
        store.settings.useHierarchy,
        store.settings.includeEnables,
        store.settings.includeControls,
        store.settings.includeSituational,
        showLabels.value,
        showProcessGroups.value
    ],
    async () => {
        if (!store.isLoaded) return;
        await nextTick();
        renderFullModel();
    }
);

watch(searchQuery, () => {
    searchFocusIdx.value = 0;
    applySearchHighlight();
});

onMounted(async () => {
    window.addEventListener('resize', scheduleResize);
    if (typeof ResizeObserver !== 'undefined' && wrapperRef.value) {
        resizeObserver = new ResizeObserver(scheduleResize);
        resizeObserver.observe(wrapperRef.value);
    }
    await nextTick();
    if (store.isLoaded) renderFullModel();
});

onUnmounted(() => {
    window.removeEventListener('resize', scheduleResize);
    if (resizeObserver) resizeObserver.disconnect();
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    destroyGraph();
});
</script>

<template>
  <div class="full3d-container" ref="wrapperRef">
    <div ref="threeDiv" class="full3d-canvas"></div>

    <!-- Top-Left Floating Controls -->
    <div class="canvas-toolbar">
      <button class="toolbar-btn" @click="fitView" title="Fit entire 3D model to viewport">🎯 Fit View</button>

      <!-- Highlight Node Search -->
      <div class="toolbar-search-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          v-model="searchQuery"
          class="toolbar-search-input"
          placeholder="Highlight node..."
          @keydown.enter="focusNextSearchMatch"
        />
        <span v-if="searchQuery.trim()" :class="['search-badge', { zero: searchMatchList.length === 0 }]">
          {{ searchMatchList.length }}
        </span>
        <button
          v-if="searchMatchList.length > 0"
          class="search-action-btn"
          @click="focusNextSearchMatch"
          title="Focus next matching node (Enter)"
        >
          ↳
        </button>
        <button
          v-if="searchQuery"
          class="search-clear-btn"
          @click="clearSearch"
          title="Clear search"
        >
          ×
        </button>
      </div>

      <label class="toolbar-toggle">
        <input type="checkbox" v-model="showLabels" />
        Labels
      </label>
      <label class="toolbar-toggle" title="Organise processes onto ISO 15288 Process Group planes">
        <input type="checkbox" v-model="showProcessGroups" />
        Process Groups
      </label>

      <span class="model-stats-pill">
        {{ stats.processes }} processes · {{ stats.objects }} artefacts · {{ stats.links }} links
      </span>
    </div>

    <!-- Node Info Panel -->
    <div v-if="selectedNodeInfo" class="info-panel">
      <button class="info-close-btn" @click="selectedNodeInfo = null" aria-label="Close">&times;</button>
      <span class="info-group-tag">{{ selectedNodeInfo.group }}</span>
      <h3>{{ selectedNodeInfo.name }}</h3>
      <p>{{ selectedNodeInfo.doc }}</p>

      <div v-if="selectedNodeInfo.activities && selectedNodeInfo.activities.length > 0" class="info-activities">
        <h4>Internal Activities ({{ selectedNodeInfo.activities.length }})</h4>
        <ul>
          <li v-for="(act, idx) in selectedNodeInfo.activities" :key="idx">{{ act }}</li>
        </ul>
      </div>
    </div>

    <!-- Bottom-Left Legend -->
    <div class="legend-panel">
      <h4>Full Model 3D</h4>
      <div class="legend-item"><span class="color-box" style="background:#2e7d32"></span> Technical</div>
      <div class="legend-item"><span class="color-box" style="background:#1565c0"></span> Technical Management</div>
      <div class="legend-item"><span class="color-box" style="background:#6a1b9a"></span> Organisational</div>
      <div class="legend-item"><span class="color-box" style="background:#c62828"></span> Agreement</div>
      <div class="legend-item"><span class="color-box" style="background:#82B366; border-radius:50%"></span> Business Object</div>
    </div>

    <!-- Export PNG -->
    <div class="export-image-container">
      <button class="export-btn" @click="exportImage">📸 Export PNG</button>
    </div>
  </div>
</template>

<style scoped>
.full3d-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #f8f9fb;
  overflow: hidden;
}
.full3d-canvas {
  width: 100%;
  height: 100%;
  outline: none;
}

.canvas-toolbar {
  position: absolute; top: 14px; left: 16px; z-index: 100;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  max-width: calc(100% - 32px);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #d0d7de; border-radius: 8px;
  padding: 6px 10px; box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(4px);
}
.toolbar-btn {
  background: #ffffff; border: 1px solid #ccc; border-radius: 6px;
  padding: 5px 10px; font-size: 12px; font-weight: 600; color: #333;
  cursor: pointer; transition: all 0.15s;
}
.toolbar-btn:hover { background: #f0f2f5; }
.toolbar-toggle {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 500; color: #333;
  cursor: pointer; user-select: none; padding-left: 4px;
}
.model-stats-pill {
  font-size: 11px; color: #64748b; font-weight: 600;
  padding: 3px 8px; border-radius: 10px; background: #f1f5f9;
}

.toolbar-search-box {
  display: flex; align-items: center; gap: 4px;
  background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px;
  padding: 2px 6px; transition: border-color 0.15s;
}
.toolbar-search-box:focus-within {
  border-color: #E65100;
  box-shadow: 0 0 0 2px rgba(230, 81, 0, 0.15);
}
.search-icon { font-size: 11px; opacity: 0.7; }
.toolbar-search-input {
  border: none; outline: none; font-size: 12px; width: 145px;
  padding: 3px 2px; color: #222; background: transparent;
}
.search-badge {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
  background: #FFF3CD; color: #BF360C; border: 1px solid #FFCC80;
}
.search-badge.zero {
  background: #f1f5f9; color: #94a3b8; border-color: #e2e8f0;
}
.search-action-btn, .search-clear-btn {
  border: none; background: none; cursor: pointer;
  font-size: 13px; color: #64748b; padding: 0 3px; line-height: 1;
}
.search-action-btn:hover, .search-clear-btn:hover { color: #111; }

.info-panel {
  position: absolute; top: 14px; right: 16px; width: 350px; max-height: calc(100% - 96px);
  background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); padding: 20px; overflow-y: auto; z-index: 1000;
}
.info-group-tag {
  display: inline-block; margin-bottom: 8px; padding: 2px 8px;
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;
  border-radius: 10px; background: #eef2f6; color: #475569;
}
.info-panel h3 { margin: 0 0 12px 0; padding-right: 28px; font-size: 18px; color: #333; }
.info-panel p { margin: 0; font-size: 14px; color: #555; line-height: 1.6; }
.info-activities {
  margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0;
}
.info-activities h4 {
  margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.4px; color: #475569;
}
.info-activities ul {
  margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;
  font-size: 13px; color: #334155;
}
.info-close-btn {
  position: absolute; top: 12px; right: 12px;
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 4px;
  cursor: pointer; font-size: 22px; color: #888;
  background: none; border: none; padding: 0; line-height: 1;
}
.info-close-btn:hover { background: #f0f0f0; color: #222; }

.legend-panel {
  position: absolute; bottom: 20px; left: 20px; background: rgba(255, 255, 255, 0.92);
  padding: 12px 14px; border-radius: 8px; border: 1px solid #ccc;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.08); z-index: 100;
}
.legend-panel h4 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #555; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 4px; color: #333; }
.color-box { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }

.export-image-container { position: absolute; bottom: 20px; right: 20px; z-index: 100; }
.export-btn {
  background: #ffffff; border: 1px solid #ccc; padding: 10px 16px; border-radius: 8px;
  cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
.export-btn:hover { background: #f0f0f0; }
</style>
