<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';

import { store, graphData } from '../store/graphStore.js';
import { getProcessGroup, groupLayerY, groupColors } from '../core/iso15288Groups.js';
import { buildFlowSteps } from '../core/flowStepper.js';

const wrapperRef = ref(null);
const threeDiv = ref(null);

const searchQuery = ref('');
const searchFocusIdx = ref(0);
const selectedNodeInfo = ref(null);

// Collapsible Report Drawer & zero-redraw pinned nodes
const showSummaryDrawer = ref(false);
const isSummaryCollapsed = ref(false);
const pinnedNodeIds = ref(new Set());

// Step-by-step Flow Player state (available in Slice Only and In Context)
const stepperActive = ref(false);
const flowSteps = ref([]);
const currentStepIdx = ref(0);
const isPlaying = ref(false);
let playTimer = null;

const stats = ref({ processes: 0, objects: 0, links: 0 });
const renderedNodeIds = ref([]);

let threeGraphInstance = null;
let threeLayerPlanesGroup = null;
let resizeObserver = null;
let resizeRaf = null;
let currentPlaneSize = 680;

const hasSlice = computed(() => store.renderPayload && store.renderPayload.nodes.size > 0);
const effectiveScope = computed(() => {
    if (!hasSlice.value) return 'full';
    return store.threeOptions.scope || 'context';
});

const currentStepState = computed(() => {
    if (!stepperActive.value || flowSteps.value.length === 0) return null;
    return flowSteps.value[currentStepIdx.value] || null;
});

const sliceEdgeKeySet = computed(() => {
    const s = new Set();
    (store.renderPayload.edges || []).forEach((e) => s.add(`${e.u}___${e.v}`));
    return s;
});

// Matching node IDs for in-canvas text search
const searchMatchList = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q || renderedNodeIds.value.length === 0) return [];
    const gActive = graphData.gActive();
    if (!gActive) return [];

    const matches = [];
    renderedNodeIds.value.forEach((id) => {
        if (!gActive.hasNode(id)) return;
        const name = (store.renderPayload.customLabels?.[id] || gActive.getNodeAttribute(id, 'name') || '').toLowerCase();
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
        const name = store.renderPayload.customLabels?.[nodeId] || gActive.getNodeAttribute(nodeId, 'name') || 'Unknown';
        const type = gActive.getNodeAttribute(nodeId, 'type') || '';
        const isProc = type.includes('BusinessFunction') || type.includes('BusinessProcess');
        const group = isProc ? getProcessGroup(name) : 'Business Object';

        showSummaryDrawer.value = false;
        selectedNodeInfo.value = {
            name,
            group,
            doc: gActive.getNodeAttribute(nodeId, 'doc') || 'Description is missing in the model.',
            activities: type.includes('BusinessFunction') ? getInternalActivities(nodeId) : []
        };
    } else {
        selectedNodeInfo.value = null;
    }
};

// --- REPORT PIN & ZOOM ---
const isNodeInRendered = (nodeId) => Boolean(nodeId && renderedNodeIds.value.includes(nodeId));

const togglePinNode = (nodeId) => {
    if (!isNodeInRendered(nodeId)) return;
    const next = new Set(pinnedNodeIds.value);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    pinnedNodeIds.value = next;
    applyVisualState();
};

const clearPinnedNodes = () => {
    pinnedNodeIds.value = new Set();
    applyVisualState();
};

const zoomToNode = (nodeId) => {
    if (!threeGraphInstance || !nodeId) return;
    const nodes = threeGraphInstance.graphData().nodes || [];
    const node = nodes.find((n) => n.id === nodeId);
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

const toggleSummaryDrawer = () => {
    showSummaryDrawer.value = !showSummaryDrawer.value;
    if (showSummaryDrawer.value) {
        selectedNodeInfo.value = null;
        isSummaryCollapsed.value = false;
    }
};

// --- STEPPER CONTROLS ---
const stopAutoPlay = () => {
    isPlaying.value = false;
    if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
    }
};

const toggleStepper = () => {
    if (stepperActive.value) {
        stopAutoPlay();
        stepperActive.value = false;
    } else if (hasSlice.value) {
        flowSteps.value = buildFlowSteps(graphData.gActive(), store.renderPayload);
        if (flowSteps.value.length > 0) {
            currentStepIdx.value = 0;
            stepperActive.value = true;
        }
    }
};

const prevStep = () => {
    stopAutoPlay();
    if (currentStepIdx.value > 0) currentStepIdx.value--;
};

const nextStep = () => {
    if (currentStepIdx.value < flowSteps.value.length - 1) {
        currentStepIdx.value++;
    } else {
        stopAutoPlay();
    }
};

const resetStepper = () => {
    stopAutoPlay();
    currentStepIdx.value = 0;
};

const toggleAutoPlay = () => {
    if (isPlaying.value) {
        stopAutoPlay();
    } else {
        if (currentStepIdx.value >= flowSteps.value.length - 1) currentStepIdx.value = 0;
        isPlaying.value = true;
        playTimer = setInterval(() => {
            if (currentStepIdx.value < flowSteps.value.length - 1) currentStepIdx.value++;
            else stopAutoPlay();
        }, 1400);
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

    const fontSize = node.isHighlighted ? 21 : (node.isProc ? 18 : 15);
    const lineHeight = fontSize * 1.25;
    const padX = 12;
    const padY = 6;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontStr = `${node.isHighlighted ? 'bold ' : '600 '}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.font = fontStr;

    const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width), 36);
    canvas.width = Math.ceil(maxLineWidth + padX * 2);
    canvas.height = Math.ceil(lines.length * lineHeight + padY * 2);

    const r = 7;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = node.isHighlighted ? 'rgba(255, 243, 224, 0.94)' : 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = node.isHighlighted ? '#D79B00' : (node.isProc ? '#D6B656' : '#82B366');
    ctx.lineWidth = node.isHighlighted ? 3 : 2;

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
    ctx.fillStyle = node.isHighlighted ? '#8A5A00' : '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, idx) => {
        ctx.fillText(line, w / 2, padY + lineHeight * (idx + 0.5));
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);

    const scale = node.isHighlighted ? 0.16 : 0.135;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.position.set(0, (node.isHighlighted ? 11 : (node.isProc ? 9 : 6.5)) + lines.length * 1.4, 0);
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
    if (!threeGraphInstance || !store.threeOptions.isLayered) return;
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

// --- APPLY DYNAMIC VISUAL STATE IN-PLACE (PINS, SEARCH, STEPPER, IN-CONTEXT) ---
const applyVisualState = () => {
    if (!threeGraphInstance) return;
    const mode = effectiveScope.value;
    const stepState = currentStepState.value;
    const matches = searchMatchSet.value;
    const pinned = pinnedNodeIds.value;
    const hasPins = pinned.size > 0;

    threeGraphInstance
        .nodeColor((node) => {
            if (pinned.has(node.id)) return '#D81B60';
            if (matches !== null) {
                return matches.has(node.id) ? '#E65100' : '#e2e6ec';
            }
            if (stepState) {
                if (stepState.activeNodes.has(node.id)) return '#1565C0';
                if (stepState.visitedNodes.has(node.id)) return node.color;
                return '#e2e6ec';
            }
            if (hasPins) return node.inSlice ? '#cfd6de' : '#e6eaef';
            if (mode === 'context') {
                return node.inSlice ? node.color : '#dfe4ea';
            }
            return node.color;
        })
        .nodeVal((node) => {
            if (pinned.has(node.id)) return Math.max(node.val * 2.2, 16);
            if (matches !== null && matches.has(node.id)) return Math.max(node.val * 2.0, 14);
            if (mode === 'context' && !node.inSlice) return 1.4;
            return node.val;
        })
        .linkColor((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            const key = `${u}___${v}`;
            if (hasPins && (pinned.has(u) || pinned.has(v))) return '#D81B60';
            if (matches !== null) {
                return (matches.has(u) || matches.has(v)) ? '#E65100' : '#eceff3';
            }
            if (stepState) {
                if (stepState.activeEdges.has(key)) return '#1565C0';
                if (stepState.visitedEdges.has(key)) return '#64748b';
                return '#eceff3';
            }
            if (mode === 'context') {
                return link.inSlice ? (link.isSystemic ? '#8b95a5' : '#2e7d32') : '#eaedf1';
            }
            if (hasPins) return '#e5e7eb';
            return link.isSystemic ? '#b8c0ca' : '#7a869a';
        })
        .linkWidth((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            const key = `${u}___${v}`;
            if (hasPins && (pinned.has(u) || pinned.has(v))) return 2.8;
            if (matches !== null) {
                return (matches.has(u) || matches.has(v)) ? 2.2 : 0.25;
            }
            if (stepState) {
                if (stepState.activeEdges.has(key)) return 3.0;
                if (stepState.visitedEdges.has(key)) return 1.2;
                return 0.25;
            }
            if (mode === 'context') {
                return link.inSlice ? (link.isSystemic ? 1.2 : 2.1) : 0.25;
            }
            if (hasPins) return 0.4;
            return mode === 'full' ? (link.isSystemic ? 0.5 : 0.9) : (link.isSystemic ? 0.8 : 1.4);
        })
        .linkDirectionalParticles((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            const key = `${u}___${v}`;
            if (hasPins) return (pinned.has(u) || pinned.has(v)) ? 3 : 0;
            if (matches !== null) return (matches.has(u) || matches.has(v)) ? 2 : 0;
            if (stepState) return stepState.activeEdges.has(key) ? 4 : 0;
            if (mode === 'context') return link.inSlice ? (link.isSystemic ? 1 : 2) : 0;
            if (mode === 'slice') return link.isSystemic ? 1 : 2;
            return 0;
        })
        .linkDirectionalParticleColor((link) => {
            if (hasPins) return '#D81B60';
            if (matches !== null) return '#E65100';
            if (stepState) return '#1565C0';
            return link.isSystemic ? '#9aa5b1' : '#4CAF50';
        });
};

// --- BUILD 3D SCENE ---
const render3D = () => {
    destroyGraph();
    if (!threeDiv.value || !store.isLoaded) return;
    const gActive = graphData.gActive();
    if (!gActive) return;

    threeDiv.value.innerHTML = '';
    const mode = effectiveScope.value;
    const layered = store.threeOptions.isLayered;
    const payload = store.renderPayload;
    const sliceNodes = payload.nodes || new Set();
    const sliceEdges = sliceEdgeKeySet.value;

    const nodes = [];
    const includedIds = new Set();
    let procCount = 0;
    let objCount = 0;

    const addNode = (id) => {
        if (!gActive.hasNode(id) || includedIds.has(id)) return;
        const type = gActive.getNodeAttribute(id, 'type') || '';
        if (type.includes('BusinessProcess')) return;

        const isProc = type.includes('BusinessFunction');
        const inSlice = sliceNodes.has(id);
        const isHighlighted = mode !== 'full' && payload.highlightedNodes && payload.highlightedNodes.has(id);
        const name = (inSlice && payload.customLabels?.[id]) || gActive.getNodeAttribute(id, 'name') || 'Unknown';
        const group = isProc ? getProcessGroup(name) : 'Business Objects';

        if (isProc) procCount++;
        else objCount++;

        const procColor = mode === 'slice' ? '#D6B656' : (groupColors[group] || '#D6B656');
        const baseColor = isHighlighted ? '#D79B00' : (isProc ? procColor : '#82B366');
        const baseVal = isHighlighted
            ? 12
            : (mode === 'slice' ? (isProc ? 6 : 3) : (isProc ? (inSlice && mode === 'context' ? 9 : 7) : (inSlice && mode === 'context' ? 4.5 : 2.6)));

        const nodeObj = {
            id,
            name,
            group,
            isProc,
            inSlice,
            isHighlighted,
            val: baseVal,
            color: baseColor
        };

        if (layered && isProc) {
            nodeObj.fy = groupLayerY[group] ?? -170;
        }

        nodes.push(nodeObj);
        includedIds.add(id);
    };

    if (mode === 'slice') {
        Array.from(sliceNodes).forEach(addNode);
    } else {
        gActive.forEachNode((id) => addNode(id));
    }

    const links = [];
    const seenLinks = new Set();

    const pushLink = (source, target, attr) => {
        if (!includedIds.has(source) || !includedIds.has(target)) return;
        if (attr.access === 'hierarchy_reverse' || attr.type?.includes('Composition')) return;
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

        links.push({
            source,
            target,
            name: label,
            isSystemic,
            inSlice: sliceEdges.has(key)
        });
    };

    if (mode === 'slice') {
        (payload.edges || []).forEach((e) => pushLink(e.u, e.v, e.data || {}));
    } else {
        gActive.forEachEdge((edge, attr, source, target) => pushLink(source, target, attr));
    }

    // Deterministic vertical placement for artefacts between their connected Process Group planes
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

    const layerCounts = {};
    nodes.forEach((n) => {
        if (n.isProc) layerCounts[n.group] = (layerCounts[n.group] || 0) + 1;
    });
    const maxInLayer = Math.max(1, ...Object.values(layerCounts));
    const planeSize = mode === 'slice'
        ? Math.max(460, Math.min(720, 320 + maxInLayer * 34))
        : 720;
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
        .nodeThreeObject((node) => {
            if (!store.threeOptions.showLabels) return null;
            if (mode === 'context' && !node.inSlice) return null;
            return createTextSprite(node);
        })
        .linkLabel('name')
        .linkOpacity(mode === 'slice' ? 0.8 : 0.6)
        .linkDirectionalArrowLength(mode === 'slice' ? 4 : 3.2)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalParticleWidth(1.8)
        .linkDirectionalParticleSpeed(0.005)
        .onNodeClick((node) => showNodeInfo(node.id))
        .onBackgroundClick(() => { selectedNodeInfo.value = null; })
        .onEngineStop(() => {
            if (!hasFitted && threeGraphInstance) {
                hasFitted = true;
                fitView();
            }
        });

    const linkForce = threeGraphInstance.d3Force('link');
    if (linkForce) linkForce.distance(layered ? 95 : 108);
    const chargeForce = threeGraphInstance.d3Force('charge');
    if (chargeForce) chargeForce.strength(mode === 'slice' ? (layered ? -260 : -340) : (layered ? -220 : -280));

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

    applyVisualState();
};

// --- CONTROLS ---
const fitView = () => {
    if (!threeGraphInstance) return;
    if (store.threeOptions.isLayered) {
        const d = currentPlaneSize * 0.92;
        threeGraphInstance.cameraPosition({ x: d * 0.78, y: 230, z: d * 0.95 }, { x: 0, y: 0, z: 0 }, 650);
    } else {
        threeGraphInstance.zoomToFit(600, 60);
    }
};

const clearSearch = () => {
    searchQuery.value = '';
    searchFocusIdx.value = 0;
};

const focusNextSearchMatch = () => {
    if (searchMatchList.value.length === 0) return;
    const targetId = searchMatchList.value[searchFocusIdx.value % searchMatchList.value.length];
    searchFocusIdx.value = (searchFocusIdx.value + 1) % searchMatchList.value.length;
    zoomToNode(targetId);
};

const exportImage = () => {
    if (!threeGraphInstance || !threeDiv.value) return;
    threeGraphInstance.renderer().render(threeGraphInstance.scene(), threeGraphInstance.camera());
    const canvas = threeDiv.value.querySelector('canvas');
    if (canvas) {
        const a = document.createElement('a');
        a.download = `ISO15288_3D_${effectiveScope.value}.png`;
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

watch(
    () => [
        store.isLoaded,
        store.modelName,
        store.renderPayload,
        store.settings.useHierarchy,
        store.settings.includeEnables,
        store.settings.includeControls,
        store.settings.includeSituational,
        store.threeOptions.scope,
        store.threeOptions.showLabels,
        store.threeOptions.isLayered
    ],
    async () => {
        stopAutoPlay();
        stepperActive.value = false;
        flowSteps.value = [];
        pinnedNodeIds.value = new Set();
        showSummaryDrawer.value = effectiveScope.value !== 'full' && Boolean(store.renderPayload?.analysisSummary);
        isSummaryCollapsed.value = false;

        if (!store.isLoaded) return;
        await nextTick();
        render3D();
    },
    { deep: true }
);

watch([searchQuery, stepperActive, currentStepIdx], () => {
    searchFocusIdx.value = 0;
    applyVisualState();
});

onMounted(async () => {
    window.addEventListener('resize', scheduleResize);
    if (typeof ResizeObserver !== 'undefined' && wrapperRef.value) {
        resizeObserver = new ResizeObserver(scheduleResize);
        resizeObserver.observe(wrapperRef.value);
    }
    showSummaryDrawer.value = effectiveScope.value !== 'full' && Boolean(store.renderPayload?.analysisSummary);
    await nextTick();
    if (store.isLoaded) render3D();
});

onUnmounted(() => {
    window.removeEventListener('resize', scheduleResize);
    if (resizeObserver) resizeObserver.disconnect();
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    stopAutoPlay();
    destroyGraph();
});
</script>

<template>
  <div class="space3d-container" ref="wrapperRef">
    <div ref="threeDiv" class="space3d-canvas"></div>

    <!-- Top-Left Floating Controls -->
    <div class="canvas-toolbar">
      <!-- 3-Way Scope Switcher -->
      <div class="scope-switch" title="Choose whether to view the active slice alone, highlighted inside the full model, or the full model">
        <button
          :class="['scope-btn', { active: effectiveScope === 'slice' }]"
          :disabled="!hasSlice"
          @click="store.threeOptions.scope = 'slice'"
        >
          Slice Only
        </button>
        <button
          :class="['scope-btn', { active: effectiveScope === 'context' }]"
          :disabled="!hasSlice"
          @click="store.threeOptions.scope = 'context'"
        >
          In Context
        </button>
        <button
          :class="['scope-btn', { active: effectiveScope === 'full' }]"
          @click="store.threeOptions.scope = 'full'"
        >
          Full Model
        </button>
      </div>

      <button class="toolbar-btn" @click="fitView" title="Fit 3D view to viewport">🎯 Fit View</button>

      <button
        v-if="hasSlice && effectiveScope !== 'full' && store.renderPayload.edges.length > 0"
        :class="['toolbar-btn', { active: stepperActive }]"
        @click="toggleStepper"
        title="Step through active slice data flow wave by wave"
      >
        {{ stepperActive ? '⏹ Exit Stepper' : '▶ Step Flow' }}
      </button>

      <button
        v-if="hasSlice && effectiveScope !== 'full' && store.renderPayload.analysisSummary"
        :class="['toolbar-btn', { active: showSummaryDrawer }]"
        @click="toggleSummaryDrawer"
        title="Toggle audit / impact summary report"
      >
        📊 Report
      </button>

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
        <input type="checkbox" v-model="store.threeOptions.showLabels" />
        Labels
      </label>
      <label class="toolbar-toggle" title="Organise processes onto ISO 15288 Process Group planes">
        <input type="checkbox" v-model="store.threeOptions.isLayered" />
        Process Groups
      </label>

      <span class="model-stats-pill">
        {{ stats.processes }}p · {{ stats.objects }}a · {{ stats.links }}l
      </span>
    </div>

    <!-- Step-by-Step Flow Player Bar -->
    <div v-if="stepperActive && flowSteps.length > 0" class="stepper-bar">
      <div class="stepper-controls">
        <button class="step-btn" @click="resetStepper" title="Restart">⏮</button>
        <button class="step-btn" @click="prevStep" :disabled="currentStepIdx === 0" title="Previous step">◀</button>
        <button class="step-btn play-btn" @click="toggleAutoPlay" :title="isPlaying ? 'Pause' : 'Auto-play'">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="step-btn" @click="nextStep" :disabled="currentStepIdx >= flowSteps.length - 1" title="Next step">▶</button>
        <span class="step-counter">Step {{ currentStepIdx + 1 }} / {{ flowSteps.length }}</span>
      </div>
      <div class="step-summary" :title="currentStepState?.summary">
        {{ currentStepState?.summary }}
      </div>
    </div>

    <!-- Collapsible Report Drawer (Case 8 / Case 9) -->
    <div
      v-if="showSummaryDrawer && effectiveScope !== 'full' && store.renderPayload.analysisSummary && !selectedNodeInfo"
      :class="['summary-panel', { collapsed: isSummaryCollapsed }]"
    >
      <div class="summary-header" @click="isSummaryCollapsed = !isSummaryCollapsed">
        <div class="summary-header-title">
          <span class="summary-chevron">{{ isSummaryCollapsed ? '▼' : '▲' }}</span>
          <h3>{{ store.renderPayload.analysisSummary.title }}</h3>
          <span v-if="isSummaryCollapsed && pinnedNodeIds.size > 0" class="collapsed-pin-badge">
            {{ pinnedNodeIds.size }}
          </span>
        </div>
        <div class="summary-header-actions" @click.stop>
          <button
            class="summary-icon-btn"
            @click="isSummaryCollapsed = !isSummaryCollapsed"
            :title="isSummaryCollapsed ? 'Expand report' : 'Collapse report to header'"
          >
            {{ isSummaryCollapsed ? '＋' : '−' }}
          </button>
          <button class="summary-icon-btn" @click="showSummaryDrawer = false" title="Close report">&times;</button>
        </div>
      </div>

      <div v-show="!isSummaryCollapsed" class="summary-body">
        <p class="summary-sub">{{ store.renderPayload.analysisSummary.subtitle }}</p>

        <div class="summary-metrics">
          <div v-for="m in store.renderPayload.analysisSummary.metrics" :key="m.label" class="metric-box">
            <span class="metric-val">{{ m.value }}</span>
            <span class="metric-lbl">{{ m.label }}</span>
          </div>
        </div>

        <div :class="['pinned-bar', { empty: pinnedNodeIds.size === 0 }]">
          <span>{{ pinnedNodeIds.size > 0 ? `${pinnedNodeIds.size} node(s) highlighted` : '0 nodes highlighted' }}</span>
          <button class="clear-pins-btn" :disabled="pinnedNodeIds.size === 0" @click="clearPinnedNodes">Clear all</button>
        </div>

        <div v-for="sec in store.renderPayload.analysisSummary.sections" :key="sec.title" class="summary-section">
          <h4 :class="['sec-title', sec.tone]">{{ sec.title }}</h4>
          <div v-if="sec.items.length === 0" class="summary-empty">None</div>
          <ul v-else class="summary-list">
            <li
              v-for="(item, idx) in sec.items"
              :key="item.id || idx"
              :class="{ 'is-pinned': item.id && pinnedNodeIds.has(item.id) }"
            >
              <div class="sum-item-row">
                <input
                  v-if="item.id && isNodeInRendered(item.id)"
                  type="checkbox"
                  class="sum-pin-checkbox"
                  :checked="pinnedNodeIds.has(item.id)"
                  @change="togglePinNode(item.id)"
                  title="Highlight node on diagram"
                />
                <div class="sum-item-text">
                  <span class="sum-item-label">{{ item.label }}</span>
                  <span v-if="item.detail" class="sum-item-detail">{{ item.detail }}</span>
                </div>
                <button
                  v-if="item.id && isNodeInRendered(item.id)"
                  class="sum-zoom-btn"
                  @click="zoomToNode(item.id)"
                  title="Zoom to node"
                >
                  🎯
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
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
      <h4>3D Space · {{ effectiveScope === 'slice' ? 'Slice' : (effectiveScope === 'context' ? 'In Context' : 'Full Model') }}</h4>
      <template v-if="effectiveScope === 'slice'">
        <div class="legend-item"><span class="color-box" style="background:#D6B656"></span> Process / Function</div>
        <div class="legend-item"><span class="color-box" style="background:#82B366; border-radius:50%"></span> Business Object</div>
      </template>
      <template v-else>
        <div class="legend-item"><span class="color-box" style="background:#2e7d32"></span> Technical</div>
        <div class="legend-item"><span class="color-box" style="background:#1565c0"></span> Technical Management</div>
        <div class="legend-item"><span class="color-box" style="background:#6a1b9a"></span> Organisational</div>
        <div class="legend-item"><span class="color-box" style="background:#c62828"></span> Agreement</div>
        <div class="legend-item"><span class="color-box" style="background:#82B366; border-radius:50%"></span> Business Object</div>
      </template>
    </div>

    <!-- Export PNG -->
    <div class="export-image-container">
      <button class="export-btn" @click="exportImage">📸 Export PNG</button>
    </div>
  </div>
</template>

<style scoped>
.space3d-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #f8f9fb;
  overflow: hidden;
}
.space3d-canvas {
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

.scope-switch {
  display: inline-flex;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  overflow: hidden;
}
.scope-btn {
  border: none;
  background: #f8fafc;
  padding: 5px 9px;
  font-size: 11.5px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.scope-btn:not(:last-child) { border-right: 1px solid #e2e8f0; }
.scope-btn.active { background: #4CAF50; color: #ffffff; }
.scope-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.toolbar-btn {
  background: #ffffff; border: 1px solid #ccc; border-radius: 6px;
  padding: 5px 10px; font-size: 12px; font-weight: 600; color: #333;
  cursor: pointer; transition: all 0.15s;
}
.toolbar-btn:hover { background: #f0f2f5; }
.toolbar-btn.active { background: #1565C0; color: #ffffff; border-color: #1565C0; }
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
  border: none; outline: none; font-size: 12px; width: 135px;
  padding: 3px 2px; color: #222; background: transparent;
}
.search-badge {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
  background: #FFF3CD; color: #BF360C; border: 1px solid #FFCC80;
}
.search-badge.zero { background: #f1f5f9; color: #94a3b8; border-color: #e2e8f0; }
.search-action-btn, .search-clear-btn {
  border: none; background: none; cursor: pointer;
  font-size: 13px; color: #64748b; padding: 0 3px; line-height: 1;
}
.search-action-btn:hover, .search-clear-btn:hover { color: #111; }

/* Stepper Bar */
.stepper-bar {
  position: absolute; bottom: 25px; left: 50%; transform: translateX(-50%);
  z-index: 120; max-width: 520px; min-width: 320px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #1565C0; border-radius: 10px;
  box-shadow: 0 6px 20px rgba(21, 101, 192, 0.18);
  padding: 10px 16px; display: flex; flex-direction: column; gap: 6px;
}
.stepper-controls { display: flex; align-items: center; justify-content: center; gap: 8px; }
.step-btn {
  width: 30px; height: 28px; border-radius: 6px;
  border: 1px solid #cbd5e1; background: #f8fafc;
  cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;
}
.step-btn:hover:not(:disabled) { background: #e2e8f0; }
.step-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.step-btn.play-btn { background: #1565C0; color: #ffffff; border-color: #1565C0; }
.step-btn.play-btn:hover { background: #0D47A1; }
.step-counter { font-size: 12px; font-weight: 700; color: #1565C0; margin-left: 6px; }
.step-summary { font-size: 12px; color: #334155; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Report Drawer */
.summary-panel {
  position: absolute; top: 14px; right: 16px; width: 350px; max-height: calc(100% - 96px);
  background: rgba(255, 255, 255, 0.97); border: 1px solid #d0d7de; border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.14);
  display: flex; flex-direction: column; overflow: hidden; z-index: 950;
}
.summary-panel.collapsed { width: auto; min-width: 245px; max-width: 350px; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1); }
.summary-header {
  flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px;
  padding: 10px 12px 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
  cursor: pointer; user-select: none;
}
.summary-panel.collapsed .summary-header { border-bottom: none; }
.summary-header:hover { background: #f1f5f9; }
.summary-header-title { display: flex; align-items: center; gap: 7px; min-width: 0; }
.summary-chevron { font-size: 10px; color: #64748b; flex-shrink: 0; }
.summary-header h3 { margin: 0; font-size: 14px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.collapsed-pin-badge {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
  background: #FCE4EC; color: #AD1457; border: 1px solid #F48FB1; flex-shrink: 0;
}
.summary-header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.summary-icon-btn {
  width: 26px; height: 26px; border-radius: 5px; border: none; background: transparent;
  color: #64748b; font-size: 17px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.summary-icon-btn:hover { background: #e2e8f0; color: #0f172a; }
.summary-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px 16px 16px 16px; }
.summary-sub { margin: 0 0 12px 0; font-size: 12px; color: #64748b; }
.summary-metrics { display: flex; gap: 8px; margin-bottom: 12px; }
.metric-box { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; display: flex; flex-direction: column; }
.metric-val { font-size: 18px; font-weight: 700; color: #1e293b; }
.metric-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; }

.pinned-bar {
  display: flex; justify-content: space-between; align-items: center;
  background: #FCE4EC; border: 1px solid #F48FB1; color: #AD1457;
  padding: 5px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 600;
  margin-bottom: 12px; transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.pinned-bar.empty { background: #f8fafc; border-color: #e2e8f0; color: #94a3b8; }
.clear-pins-btn { border: none; background: #ffffff; color: #AD1457; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
.clear-pins-btn:hover:not(:disabled) { background: #F8BBD0; }
.clear-pins-btn:disabled { background: #eef2f6; color: #94a3b8; cursor: default; opacity: 0.7; }

.summary-section { margin-bottom: 12px; }
.sec-title { margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; }
.sec-title.danger { color: #c53030; }
.sec-title.warning { color: #c05621; }
.sec-title.ok { color: #2e7d32; }
.summary-empty { font-size: 12px; color: #94a3b8; font-style: italic; }
.summary-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 5px; }
.summary-list li { background: #f8fafc; border: 1px solid #edf2f7; border-radius: 5px; padding: 6px 8px; }
.summary-list li.is-pinned { background: #FCE4EC; border-color: #F48FB1; }
.sum-item-row { display: flex; align-items: flex-start; gap: 7px; }
.sum-pin-checkbox { margin-top: 2px; cursor: pointer; accent-color: #D81B60; flex-shrink: 0; }
.sum-item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sum-item-label { font-size: 12px; font-weight: 600; color: #1e293b; }
.sum-item-detail { font-size: 11px; color: #64748b; }
.sum-zoom-btn {
  flex-shrink: 0; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 4px;
  width: 24px; height: 22px; padding: 0; display: flex; align-items: center; justify-content: center;
  font-size: 11px; cursor: pointer;
}
.sum-zoom-btn:hover { background: #e2e8f0; border-color: #94a3b8; }

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
.info-activities { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
.info-activities h4 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: #475569; }
.info-activities ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #334155; }
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
