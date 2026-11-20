<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import mermaid from 'mermaid';
import svgPanZoom from 'svg-pan-zoom';
import { Network } from 'vis-network';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';

import { store, graphData, applyModelXml } from '../store/graphStore.js';
import { graphToMermaidAndData } from '../renderers/mermaidGenerator.js';
import { getProcessGroup, groupLayerY, groupColors } from '../core/iso15288Groups.js';
import { buildFlowSteps } from '../core/flowStepper.js';
import { buildShareUrl } from '../core/urlState.js';
import N2Matrix from './N2Matrix.vue';
import InsightsView from './InsightsView.vue';

const fileInput = ref(null);
const mermaidDiv = ref(null);
const visDiv = ref(null);
const threeDiv = ref(null);

const errorContent = ref('');
const selectedNodeInfo = ref(null);
const showSummaryDrawer = ref(false);
const shareStatus = ref('');

// In-canvas node search state
const searchQuery = ref('');
const searchFocusIdx = ref(0);

// Step-by-step Flow Player state
const stepperActive = ref(false);
const flowSteps = ref([]);
const currentStepIdx = ref(0);
const isPlaying = ref(false);
let playTimer = null;

const workspaceTabs = [
    { id: 'graph', label: '🕸️ Scenario Graph' },
    { id: 'n2', label: '🔢 N2 / DSM Matrix' },
    { id: 'checklist', label: '📋 Process Checklist' },
    { id: 'hotspots', label: '🔥 Hotspots' },
    { id: 'dictionary', label: '🔍 Dictionary' }
];

const currentStepState = computed(() => {
    if (!stepperActive.value || flowSteps.value.length === 0) return null;
    return flowSteps.value[currentStepIdx.value] || null;
});

// Matching node IDs for in-canvas search
const searchMatchList = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q || !store.renderPayload || store.renderPayload.nodes.size === 0) return [];
    const gActive = graphData.gActive();
    if (!gActive) return [];

    const matches = [];
    store.renderPayload.nodes.forEach((id) => {
        const label = (store.renderPayload.customLabels?.[id] || (gActive.hasNode(id) ? gActive.getNodeAttribute(id, 'name') : '') || '').toLowerCase();
        if (label.includes(q)) {
            matches.push(id);
        }
    });
    return matches;
});

const searchMatchSet = computed(() => {
    if (!searchQuery.value.trim()) return null;
    return new Set(searchMatchList.value);
});

let panZoomInstance = null;
let visNetworkInstance = null;
let visBaseNodes = [];
let visBaseEdges = [];
let threeGraphInstance = null;
let threeLayerPlanesGroup = null;

mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: {
        htmlLabels: true,
        padding: 15,
        wrappingWidth: 220
    },
    themeVariables: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '14px'
    }
});

// --- SHAREABLE LINK ---
const copyShareLink = async () => {
    const shareUrl = buildShareUrl(store);
    try {
        window.history.replaceState(null, '', shareUrl);
    } catch {
        // Ignore history restrictions in sandboxed environments
    }

    try {
        await navigator.clipboard.writeText(shareUrl);
        shareStatus.value = '✓ Link Copied!';
    } catch {
        // Fallback for browsers without clipboard permission
        window.prompt('Copy shareable link:', shareUrl);
        shareStatus.value = 'Link Ready';
    }
    setTimeout(() => { shareStatus.value = ''; }, 2400);
};

// --- UNIVERSAL NODE CLICK HANDLER ---
const showNodeInfo = (rawId) => {
    const originalId = rawId.replace(/_/g, '-');
    const gActive = graphData.gActive();

    if (gActive && gActive.hasNode(originalId)) {
        const name = store.renderPayload.customLabels[originalId] || gActive.getNodeAttribute(originalId, 'name') || 'Unknown';
        const type = gActive.getNodeAttribute(originalId, 'type') || '';
        const isProc = type.includes('BusinessFunction') || type.includes('BusinessProcess');
        const group = isProc ? getProcessGroup(name) : 'Business Object';

        showSummaryDrawer.value = false;
        selectedNodeInfo.value = {
            name,
            group,
            doc: gActive.getNodeAttribute(originalId, 'doc') || 'Description is missing in the model.'
        };
    } else {
        selectedNodeInfo.value = null;
    }
};

const handleMermaidBackgroundClick = (event) => {
    if (!event.target.closest('.node, .cluster')) {
        selectedNodeInfo.value = null;
    }
};

window.handleNodeClick = showNodeInfo;

// --- IN-CANVAS SEARCH FOCUS ---
const clearSearch = () => {
    searchQuery.value = '';
    searchFocusIdx.value = 0;
};

const focusNextSearchMatch = () => {
    if (searchMatchList.value.length === 0) return;
    const targetId = searchMatchList.value[searchFocusIdx.value % searchMatchList.value.length];
    searchFocusIdx.value = (searchFocusIdx.value + 1) % searchMatchList.value.length;

    if (store.activeEngine === 'visjs' && visNetworkInstance) {
        visNetworkInstance.focus(targetId, {
            scale: 1.25,
            animation: { duration: 450, easingFunction: 'easeInOutQuad' }
        });
        visNetworkInstance.selectNodes([targetId]);
    } else if (store.activeEngine === '3d' && threeGraphInstance) {
        const nodes = threeGraphInstance.graphData().nodes || [];
        const node = nodes.find((n) => n.id === targetId);
        if (node && typeof node.x === 'number') {
            const distance = 160;
            const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
            threeGraphInstance.cameraPosition(
                { x: node.x * distRatio, y: node.y + 40, z: node.z * distRatio },
                node,
                800
            );
        }
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
    } else {
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
        if (currentStepIdx.value >= flowSteps.value.length - 1) {
            currentStepIdx.value = 0;
        }
        isPlaying.value = true;
        playTimer = setInterval(() => {
            if (currentStepIdx.value < flowSteps.value.length - 1) {
                currentStepIdx.value++;
            } else {
                stopAutoPlay();
            }
        }, 1400);
    }
};

// --- CLEANUP HELPERS ---
const clear3DLayerPlanes = () => {
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

const destroyRenderers = () => {
    clear3DLayerPlanes();
    if (panZoomInstance) {
        panZoomInstance.destroy();
        panZoomInstance = null;
    }
    if (visNetworkInstance) {
        visNetworkInstance.destroy();
        visNetworkInstance = null;
    }
    if (threeGraphInstance) {
        if (typeof threeGraphInstance._destructor === 'function') {
            threeGraphInstance._destructor();
        }
        threeGraphInstance = null;
    }
};

// --- FILE UPLOAD ---
const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            applyModelXml(e.target.result, file.name);
            store.uiMessage = { text: `Model "${file.name}" loaded successfully!`, type: 'success' };
        } catch (err) { alert("Error parsing XML! " + err.message); }
    };
    reader.readAsText(file);
    event.target.value = '';
};

// --- 3D SPRITE LABEL BUILDER ---
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

    const fontSize = node.isHighlighted ? 22 : 18;
    const lineHeight = fontSize * 1.25;
    const padX = 14;
    const padY = 8;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontStr = `${node.isHighlighted ? 'bold ' : '600 '}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.font = fontStr;

    const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width), 40);
    canvas.width = Math.ceil(maxLineWidth + padX * 2);
    canvas.height = Math.ceil(lines.length * lineHeight + padY * 2);

    const r = 8;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = node.isHighlighted ? 'rgba(255, 243, 224, 0.92)' : 'rgba(255, 255, 255, 0.88)';
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
        const y = padY + lineHeight * (idx + 0.5);
        ctx.fillText(line, w / 2, y);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);

    const scale = node.isHighlighted ? 0.17 : 0.14;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    const yOffset = (node.isHighlighted ? 11 : (node.isProc ? 9 : 7)) + (lines.length * 1.5);
    sprite.position.set(0, yOffset, 0);
    return sprite;
};

// --- 3D ISO LAYER PLANES BUILDER ---
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
    sprite.scale.set(canvas.width * 0.28, canvas.height * 0.28, 1);
    return sprite;
};

const add3DLayerPlanes = (nodes, planeSize) => {
    if (!threeGraphInstance || !store.threeOptions.isLayered) return;
    clear3DLayerPlanes();

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
        const borderMat = new THREE.LineBasicMaterial({
            color: threeColor,
            transparent: true,
            opacity: 0.42
        });
        const borderLoop = new THREE.LineLoop(borderGeo, borderMat);
        groupObj.add(borderLoop);

        const labelSprite = createLayerLabelSprite(groupName, colorHex);
        labelSprite.position.set(-half + 75, y + 10, half - 22);
        groupObj.add(labelSprite);
    });

    threeLayerPlanesGroup = groupObj;
    threeGraphInstance.scene().add(groupObj);
};

// --- APPLY STEP / SEARCH VISUAL STATE TO VIS.JS & 3D IN-PLACE ---
const applyVisVisualState = () => {
    if (!visNetworkInstance) return;
    const nodesDS = visNetworkInstance.body.data.nodes;
    const edgesDS = visNetworkInstance.body.data.edges;
    const stepState = currentStepState.value;
    const matches = searchMatchSet.value;

    const updatedNodes = visBaseNodes.map((n) => {
        if (matches !== null) {
            if (matches.has(n.id)) {
                return {
                    ...n,
                    color: { background: '#FFF3CD', border: '#E65100' },
                    borderWidth: 4,
                    opacity: 1
                };
            }
            return {
                ...n,
                color: { background: '#f5f5f5', border: '#dcdcdc' },
                font: { ...n.font, color: '#a0a0a0' },
                opacity: 0.25
            };
        }
        if (stepState) {
            if (stepState.activeNodes.has(n.id)) {
                return {
                    ...n,
                    color: { background: '#E3F2FD', border: '#1565C0' },
                    borderWidth: 3.5,
                    opacity: 1
                };
            }
            if (stepState.visitedNodes.has(n.id)) {
                return { ...n, opacity: 1 };
            }
            return {
                ...n,
                color: { background: '#f3f4f6', border: '#d1d5db' },
                font: { ...n.font, color: '#9ca3af' },
                opacity: 0.3
            };
        }
        return n;
    });

    const updatedEdges = visBaseEdges.map((e) => {
        if (matches !== null) {
            const touched = matches.has(e.from) || matches.has(e.to);
            return touched
                ? { ...e, width: 2 }
                : { ...e, width: 1, color: { color: 'rgba(180,180,180,0.22)' }, font: { ...e.font, color: 'rgba(160,160,160,0.3)' } };
        }
        if (stepState) {
            const key = `${e.from}___${e.to}`;
            if (stepState.activeEdges.has(key)) {
                return {
                    ...e,
                    width: 3.5,
                    color: { color: '#1565C0', highlight: '#0D47A1' },
                    font: { ...e.font, color: '#1565C0' }
                };
            }
            if (stepState.visitedEdges.has(key)) {
                return { ...e, width: 1.5 };
            }
            return {
                ...e,
                width: 1,
                color: { color: 'rgba(180,180,180,0.28)' },
                font: { ...e.font, color: 'rgba(160,160,160,0.35)' }
            };
        }
        return e;
    });

    nodesDS.update(updatedNodes);
    edgesDS.update(updatedEdges);
};

const apply3DVisualState = () => {
    if (!threeGraphInstance) return;
    const stepState = currentStepState.value;
    const matches = searchMatchSet.value;

    threeGraphInstance
        .nodeColor((node) => {
            if (matches !== null) {
                return matches.has(node.id) ? '#E65100' : '#dde1e6';
            }
            if (stepState) {
                if (stepState.activeNodes.has(node.id)) return '#1565C0';
                if (stepState.visitedNodes.has(node.id)) return node.color;
                return '#d8dde3';
            }
            return node.color;
        })
        .nodeVal((node) => {
            if (matches !== null && matches.has(node.id)) return Math.max(node.val * 1.9, 14);
            return node.val;
        })
        .linkColor((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            const key = `${u}___${v}`;
            if (matches !== null) {
                return (matches.has(u) || matches.has(v)) ? '#E65100' : '#e5e7eb';
            }
            if (stepState) {
                if (stepState.activeEdges.has(key)) return '#1565C0';
                if (stepState.visitedEdges.has(key)) return '#7a869a';
                return '#e5e7eb';
            }
            return link.isSystemic ? '#b0b8c1' : '#7a869a';
        })
        .linkWidth((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            const key = `${u}___${v}`;
            if (matches !== null) {
                return (matches.has(u) || matches.has(v)) ? 2.4 : 0.4;
            }
            if (stepState) {
                if (stepState.activeEdges.has(key)) return 3;
                if (stepState.visitedEdges.has(key)) return 1.2;
                return 0.4;
            }
            return link.isSystemic ? 0.8 : 1.4;
        })
        .linkDirectionalParticles((link) => {
            const u = typeof link.source === 'object' ? link.source.id : link.source;
            const v = typeof link.target === 'object' ? link.target.id : link.target;
            const key = `${u}___${v}`;
            if (matches !== null) return (matches.has(u) || matches.has(v)) ? 2 : 0;
            if (stepState) return stepState.activeEdges.has(key) ? 4 : 0;
            return link.isSystemic ? 1 : 2;
        })
        .linkDirectionalParticleColor((link) => {
            if (matches !== null) return '#E65100';
            if (stepState) return '#1565C0';
            return link.isSystemic ? '#9aa5b1' : '#4CAF50';
        });
};

// --- RENDERERS ---
const renderMermaid = async (payload, preserveView = false) => {
    let savedZoom = null;
    let savedPan = null;
    if (preserveView && panZoomInstance) {
        savedZoom = panZoomInstance.getZoom();
        savedPan = panZoomInstance.getPan();
    }

    destroyRenderers();
    if (!mermaidDiv.value) return;
    mermaidDiv.value.innerHTML = '';

    const { mermaidCode } = graphToMermaidAndData(
        graphData.gActive(),
        payload.nodes,
        payload.edges,
        payload.renderSubgraphs,
        payload.customLabels,
        payload.highlightedNodes,
        currentStepState.value,
        searchMatchSet.value
    );
    if (!mermaidCode) return;

    try {
        const renderId = `mermaid-svg-${Date.now()}`;
        const { svg, bindFunctions } = await mermaid.render(renderId, mermaidCode);

        if (!mermaidDiv.value) return;
        mermaidDiv.value.innerHTML = svg;
        const svgElement = mermaidDiv.value.querySelector('svg');

        if (bindFunctions) {
            bindFunctions(mermaidDiv.value);
        }

        svgElement.removeAttribute('width');
        svgElement.removeAttribute('height');
        svgElement.style.maxWidth = 'none';
        svgElement.style.width = '100%';
        svgElement.style.height = '100%';
        svgElement.style.display = 'block';

        panZoomInstance = svgPanZoom(svgElement, {
            zoomEnabled: true,
            controlIconsEnabled: false,
            fit: true,
            center: true,
            preventMouseEventsDefault: false
        });

        panZoomInstance.resize();
        if (preserveView && savedZoom !== null && savedPan !== null) {
            panZoomInstance.zoom(savedZoom);
            panZoomInstance.pan(savedPan);
        } else {
            panZoomInstance.fit();
            panZoomInstance.center();
        }
    } catch (error) {
        errorContent.value = error.message;
    }
};

const renderVisJs = (payload) => {
    destroyRenderers();
    if (!visDiv.value) return;
    const gActive = graphData.gActive();

    visBaseNodes = Array.from(payload.nodes).map(id => {
        const type = gActive.getNodeAttribute(id, 'type') || '';
        const isProc = type.includes('BusinessFunction') || type.includes('BusinessProcess');
        const isHighlighted = payload.highlightedNodes && payload.highlightedNodes.has(id);

        return {
            id,
            label: payload.customLabels[id] || gActive.getNodeAttribute(id, 'name') || 'Unknown',
            shape: isProc ? 'box' : 'ellipse',
            color: isHighlighted
                ? { background: '#FFE6CC', border: '#D79B00', highlight: { background: '#FFD9B3', border: '#B37F00' } }
                : (isProc
                    ? { background: '#FFF2CC', border: '#D6B656', highlight: { background: '#FFE8A3', border: '#B89635' } }
                    : { background: '#D5E8D4', border: '#82B366', highlight: { background: '#C0DFBE', border: '#5E8E45' } }),
            font: { face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', size: isHighlighted ? 15 : 13, bold: isHighlighted, color: '#222222' },
            borderWidth: isHighlighted ? 3 : 1.5,
            margin: 10,
            opacity: 1
        };
    });

    visBaseEdges = payload.edges.map((e, idx) => {
        const type = e.data.type || "";
        const access = (e.data.access || "").toLowerCase();
        const subclass = e.data.subclass || "";
        let label = "", dashes = false;

        if (type.includes('Access')) {
            if (subclass === 'Controls') { label = "Controls"; dashes = true; }
            else if (subclass === 'Enables') { label = "Enables"; dashes = true; }
            else if (subclass === 'Situational') { label = access === 'read' ? "Situational Input" : "Situational Output"; dashes = true; }
            else if (access === 'read') label = "Input";
            else if (access === 'write') label = "Output";
        } else {
            label = type.replace("Relationship", "").replace("archimate:", "");
            if (label === 'Specialization') dashes = true;
        }

        return {
            id: `e_${idx}_${e.u}_${e.v}`,
            from: e.u,
            to: e.v,
            label,
            dashes,
            width: 1.5,
            arrows: 'to',
            font: { size: 11, align: 'middle', strokeWidth: 3, strokeColor: '#ffffff', color: '#444444' },
            color: { color: dashes ? '#999999' : '#666666', highlight: '#222222' }
        };
    });

    visNetworkInstance = new Network(visDiv.value, { nodes: [...visBaseNodes], edges: [...visBaseEdges] }, {
        nodes: {
            widthConstraint: { maximum: 180 }
        },
        edges: {
            smooth: { enabled: true, type: 'dynamic' }
        },
        interaction: {
            hover: true
        },
        physics: {
            enabled: true,
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
                gravitationalConstant: -90,
                centralGravity: 0.01,
                springLength: 165,
                springConstant: 0.06,
                avoidOverlap: 0.65
            },
            stabilization: {
                iterations: 200
            }
        },
        layout: {
            hierarchical: {
                enabled: payload.renderSubgraphs,
                direction: 'UD',
                sortMethod: 'directed',
                nodeSpacing: 190,
                levelSeparation: 140
            }
        }
    });

    visNetworkInstance.once('stabilizationIterationsDone', () => {
        visNetworkInstance?.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    });

    visNetworkInstance.on("click", function (params) {
        if (params.nodes.length > 0) showNodeInfo(params.nodes[0]);
        else selectedNodeInfo.value = null;
    });

    if (currentStepState.value || searchMatchSet.value !== null) {
        applyVisVisualState();
    }
};

const render3D = (payload) => {
    destroyRenderers();
    if (!threeDiv.value) return;
    threeDiv.value.innerHTML = '';
    const gActive = graphData.gActive();
    const layered = store.threeOptions.isLayered;

    const nodes = Array.from(payload.nodes).map(id => {
        const type = gActive.getNodeAttribute(id, 'type') || '';
        const isProc = type.includes('BusinessFunction') || type.includes('BusinessProcess');
        const isHighlighted = payload.highlightedNodes && payload.highlightedNodes.has(id);
        const name = payload.customLabels[id] || gActive.getNodeAttribute(id, 'name') || 'Unknown';
        const group = isProc ? getProcessGroup(name) : 'Business Objects';

        const nodeObj = {
            id,
            name,
            group,
            isProc,
            isHighlighted,
            val: isHighlighted ? 12 : (isProc ? 6 : 3),
            color: isHighlighted ? '#D79B00' : (isProc ? '#D6B656' : '#82B366')
        };

        if (layered && isProc) {
            nodeObj.fy = groupLayerY[group] ?? -170;
        }

        return nodeObj;
    });

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // Deterministic vertical placement for artefacts in ISO Layers mode:
    // Place each artefact midway between its connected process layers (or slightly above a single layer).
    if (layered) {
        const neighbourProcessYs = new Map();
        payload.edges.forEach((e) => {
            const nU = nodeById.get(e.u);
            const nV = nodeById.get(e.v);
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
                    // Single-layer artefact: hover neatly above the plane (or below if top External plane)
                    const offset = uniqueYs[0] >= 180 ? -30 : 30;
                    n.fy = uniqueYs[0] + offset;
                } else {
                    // Cross-layer artefact: sit midway between connected planes with tiny stagger to avoid overlap
                    const stagger = ((artIdx % 3) - 1) * 7;
                    n.fy = avgY + stagger;
                }
            }
            artIdx++;
        });
    }

    // Compute plane size dynamically based on densest process layer
    const layerCounts = {};
    nodes.forEach((n) => {
        if (n.isProc) layerCounts[n.group] = (layerCounts[n.group] || 0) + 1;
    });
    const maxInLayer = Math.max(1, ...Object.values(layerCounts));
    const planeSize = Math.max(460, Math.min(760, 320 + maxInLayer * 34));

    const links = payload.edges.map(e => {
        const type = e.data.type || '';
        const subclass = e.data.subclass || '';
        const access = (e.data.access || '').toLowerCase();
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

        return {
            source: e.u,
            target: e.v,
            name: label,
            isSystemic
        };
    });

    let hasFitted = false;

    threeGraphInstance = ForceGraph3D()(threeDiv.value)
        .width(threeDiv.value.clientWidth)
        .height(threeDiv.value.clientHeight)
        .graphData({ nodes, links })
        .backgroundColor('#f8f9fb')
        .nodeRelSize(3)
        .nodeColor('color')
        .nodeVal('val')
        .nodeLabel(node => `${node.name} (${node.group})`)
        .nodeThreeObjectExtend(true)
        .nodeThreeObject(node => (store.threeOptions.showLabels ? createTextSprite(node) : null))
        .linkLabel('name')
        .linkColor(link => (link.isSystemic ? '#b0b8c1' : '#7a869a'))
        .linkWidth(link => (link.isSystemic ? 0.8 : 1.4))
        .linkDirectionalArrowLength(4)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalParticles(link => (link.isSystemic ? 1 : 2))
        .linkDirectionalParticleWidth(1.8)
        .linkDirectionalParticleSpeed(0.005)
        .linkDirectionalParticleColor(link => (link.isSystemic ? '#9aa5b1' : '#4CAF50'))
        .onNodeClick(node => showNodeInfo(node.id))
        .onBackgroundClick(() => { selectedNodeInfo.value = null; })
        .onEngineStop(() => {
            if (!hasFitted && threeGraphInstance) {
                hasFitted = true;
                if (layered) {
                    const camDist = planeSize * 0.95;
                    threeGraphInstance.cameraPosition({ x: camDist * 0.72, y: 200, z: camDist * 0.9 }, { x: 0, y: 0, z: 0 }, 700);
                } else {
                    threeGraphInstance.zoomToFit(600, 60);
                }
            }
        });

    const linkForce = threeGraphInstance.d3Force('link');
    if (linkForce) linkForce.distance(layered ? 95 : 110);
    const chargeForce = threeGraphInstance.d3Force('charge');
    if (chargeForce) chargeForce.strength(layered ? -260 : -360);

    // Keep all nodes strictly within the horizontal bounds of the visual ISO planes
    if (layered) {
        const limit = planeSize / 2 - 28;
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
        add3DLayerPlanes(nodes, planeSize);
    }

    if (currentStepState.value || searchMatchSet.value !== null) {
        apply3DVisualState();
    }
};

// --- VIEW CONTROLS ---
const fitView = () => {
    if (store.activeEngine === 'mermaid' && panZoomInstance) {
        panZoomInstance.resize();
        panZoomInstance.fit();
        panZoomInstance.center();
    } else if (store.activeEngine === 'visjs' && visNetworkInstance) {
        visNetworkInstance.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    } else if (store.activeEngine === '3d' && threeGraphInstance) {
        if (store.threeOptions.isLayered) {
            threeGraphInstance.cameraPosition({ x: 380, y: 210, z: 480 }, { x: 0, y: 0, z: 0 }, 600);
        } else {
            threeGraphInstance.zoomToFit(500, 60);
        }
    }
};

const toggleSummaryDrawer = () => {
    showSummaryDrawer.value = !showSummaryDrawer.value;
    if (showSummaryDrawer.value) selectedNodeInfo.value = null;
};

// Re-render graph when payload, graph engine, or active workspace view changes
watch(
    () => [store.renderPayload, store.activeEngine, store.activeView],
    async ([newPayload, engine, view]) => {
        selectedNodeInfo.value = null;
        stopAutoPlay();
        stepperActive.value = false;
        flowSteps.value = [];
        searchQuery.value = '';
        searchFocusIdx.value = 0;
        showSummaryDrawer.value = Boolean(newPayload?.analysisSummary);

        if (view !== 'graph' || !newPayload || newPayload.nodes.size === 0) {
            destroyRenderers();
            return;
        }

        errorContent.value = '';
        await nextTick();
        if (engine === 'mermaid') await renderMermaid(newPayload, false);
        else if (engine === 'visjs') renderVisJs(newPayload);
        else if (engine === '3d') render3D(newPayload);
    },
    { deep: true }
);

// React to step or search changes without resetting layout
watch([stepperActive, currentStepIdx, searchQuery], async () => {
    searchFocusIdx.value = 0;
    if (store.activeView !== 'graph' || store.renderPayload.nodes.size === 0) return;
    if (store.activeEngine === 'mermaid') {
        await renderMermaid(store.renderPayload, true);
    } else if (store.activeEngine === 'visjs') {
        applyVisVisualState();
    } else if (store.activeEngine === '3d') {
        apply3DVisualState();
    }
});

// Re-render 3D when 3D view options change
watch(
    () => [store.threeOptions.showLabels, store.threeOptions.isLayered],
    async () => {
        if (store.activeView === 'graph' && store.activeEngine === '3d' && store.renderPayload.nodes.size > 0) {
            await nextTick();
            render3D(store.renderPayload);
        }
    }
);

// --- UNIVERSAL PNG EXPORT ---
const exportImage = () => {
    if (store.activeEngine === 'mermaid') {
        const svg = mermaidDiv.value?.querySelector('svg');
        if (!svg || !panZoomInstance) return;

        const oldZoom = panZoomInstance.getZoom();
        const oldPan = panZoomInstance.getPan();
        panZoomInstance.resetZoom();
        panZoomInstance.resetPan();

        setTimeout(() => {
            const canvas = document.createElement("canvas");
            const bbox = svg.getBoundingClientRect();
            canvas.width = bbox.width * 2;
            canvas.height = bbox.height * 2;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(2, 2);

            const svgData = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);

                ctx.font = "12px sans-serif";
                ctx.fillStyle = "#888888";
                const dateStr = new Date().toLocaleString('en-US');
                ctx.fillText(`Diagram generated on ${dateStr} by ISO15288 Analyzer.`, 15, bbox.height - 25);
                ctx.fillText(`Developed for INCOSE.`, 15, bbox.height - 10);

                const a = document.createElement("a");
                a.download = "Diagram_Mermaid.png";
                a.href = canvas.toDataURL("image/png");
                a.click();

                panZoomInstance.zoom(oldZoom);
                panZoomInstance.pan(oldPan);
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        }, 100);

    } else if (store.activeEngine === 'visjs') {
        const canvas = visDiv.value?.querySelector('canvas');
        if (canvas) {
            const a = document.createElement("a");
            a.download = "Diagram_Vis.png";
            a.href = canvas.toDataURL("image/png");
            a.click();
        }
    } else if (store.activeEngine === '3d') {
        if (threeGraphInstance) {
            threeGraphInstance.renderer().render(threeGraphInstance.scene(), threeGraphInstance.camera());
            const canvas = threeDiv.value?.querySelector('canvas');
            if (canvas) {
                const a = document.createElement("a");
                a.download = "Diagram_3D.png";
                a.href = canvas.toDataURL("image/png");
                a.click();
            }
        }
    }
};

const handleResize = () => {
    if (store.activeView !== 'graph') return;
    if (store.activeEngine === '3d' && threeGraphInstance && threeDiv.value) {
        threeGraphInstance.width(threeDiv.value.clientWidth);
        threeGraphInstance.height(threeDiv.value.clientHeight);
    } else if (store.activeEngine === 'mermaid' && panZoomInstance) {
        panZoomInstance.resize();
        panZoomInstance.fit();
        panZoomInstance.center();
    }
};

onMounted(() => window.addEventListener('resize', handleResize));
onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    stopAutoPlay();
    destroyRenderers();
});
</script>

<template>
  <div class="canvas-container">

    <!-- Permanent Top Workspace Navigation Bar -->
    <header class="workspace-nav">
      <nav class="workspace-tabs">
        <button
          v-for="tab in workspaceTabs"
          :key="tab.id"
          :class="['ws-tab', { active: store.activeView === tab.id }]"
          :disabled="!store.isLoaded && tab.id !== 'graph'"
          @click="store.activeView = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div class="workspace-actions">
        <button
          class="share-btn"
          :disabled="!store.isLoaded"
          @click="copyShareLink"
          title="Copy a direct link to this view, global settings, and current diagram"
        >
          {{ shareStatus || '🔗 Share Link' }}
        </button>
      </div>
    </header>

    <!-- Main Workspace Stage -->
    <div class="workspace-stage">
      <!-- Loading Overlay -->
      <div v-if="store.isLoading" class="status-overlay">
          <div class="spinner"></div>
          <h3>Loading ISO 15288 Model...</h3>
          <p>Parsing ArchiMate graph elements and relationships</p>
      </div>

      <!-- Fallback Upload Overlay -->
      <div v-else-if="!store.isLoaded" class="upload-overlay">
          <h3>Model Not Loaded</h3>
          <p v-if="store.loadError" class="overlay-error">{{ store.loadError }}</p>
          <p v-else>Please choose an ArchiMate Open Exchange XML file.</p>
          <input type="file" accept=".xml" ref="fileInput" @change="handleFileUpload" style="display: none" />
          <button class="upload-btn" @click="fileInput.click()">📁 Choose File</button>
      </div>

      <!-- Whole-Model Workspaces -->
      <N2Matrix v-else-if="store.activeView === 'n2'" />
      <InsightsView v-else-if="['checklist', 'hotspots', 'dictionary'].includes(store.activeView)" />

      <!-- Scenario Graph: Empty State -->
      <div v-else-if="store.renderPayload.nodes.size === 0" class="empty-state">
          <div class="empty-icon">📐</div>
          <h3>{{ store.modelName }} Ready</h3>
          <p>Configure a scenario in the left sidebar and click <strong>"Generate Diagram"</strong>, or explore the full model using the tabs above.</p>
          <div class="model-quick-stats">
            <span class="stat-pill">Processes: <strong>{{ Object.keys(store.processes).length }}</strong></span>
            <span class="stat-pill">Business Objects: <strong>{{ Object.keys(store.businessObjects).length }}</strong></span>
          </div>
      </div>

      <!-- Scenario Graph: Render Targets -->
      <template v-else>
        <div
          v-if="store.activeEngine === 'mermaid'"
          ref="mermaidDiv"
          class="render-div"
          @click="handleMermaidBackgroundClick"
        ></div>
        <div v-if="store.activeEngine === 'visjs'" ref="visDiv" class="render-div"></div>
        <div v-if="store.activeEngine === '3d'" ref="threeDiv" class="render-div"></div>

        <!-- Floating Canvas Controls + In-Canvas Search -->
        <div class="canvas-toolbar">
            <button class="toolbar-btn" @click="fitView" title="Fit diagram to viewport">🎯 Fit View</button>
            <button
              v-if="store.renderPayload.edges.length > 0"
              :class="['toolbar-btn', { active: stepperActive }]"
              @click="toggleStepper"
              title="Step through data flow wave by wave"
            >
              {{ stepperActive ? '⏹ Exit Stepper' : '▶ Step Flow' }}
            </button>
            <button
              v-if="store.renderPayload.analysisSummary"
              :class="['toolbar-btn', { active: showSummaryDrawer }]"
              @click="toggleSummaryDrawer"
              title="Toggle audit / impact summary report"
            >
              📊 Report
            </button>

            <!-- In-Canvas Text Search -->
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
                  v-if="searchMatchList.length > 0 && store.activeEngine !== 'mermaid'"
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

            <template v-if="store.activeEngine === '3d'">
                <label class="toolbar-toggle">
                    <input type="checkbox" v-model="store.threeOptions.showLabels" />
                    Labels
                </label>
                <label class="toolbar-toggle" title="Separate ISO 15288 process groups onto visual horizontal planes">
                    <input type="checkbox" v-model="store.threeOptions.isLayered" />
                    ISO Layers
                </label>
            </template>
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

        <!-- Analysis Summary Drawer -->
        <div v-if="showSummaryDrawer && store.renderPayload.analysisSummary && !selectedNodeInfo" class="summary-panel">
            <button class="info-close-btn" @click="showSummaryDrawer = false" aria-label="Close">&times;</button>
            <h3>{{ store.renderPayload.analysisSummary.title }}</h3>
            <p class="summary-sub">{{ store.renderPayload.analysisSummary.subtitle }}</p>

            <div class="summary-metrics">
                <div v-for="m in store.renderPayload.analysisSummary.metrics" :key="m.label" class="metric-box">
                    <span class="metric-val">{{ m.value }}</span>
                    <span class="metric-lbl">{{ m.label }}</span>
                </div>
            </div>

            <div v-for="sec in store.renderPayload.analysisSummary.sections" :key="sec.title" class="summary-section">
                <h4 :class="['sec-title', sec.tone]">{{ sec.title }}</h4>
                <div v-if="sec.items.length === 0" class="summary-empty">None</div>
                <ul v-else class="summary-list">
                    <li v-for="(item, idx) in sec.items" :key="idx">
                        <span class="sum-item-label">{{ item.label }}</span>
                        <span v-if="item.detail" class="sum-item-detail">{{ item.detail }}</span>
                    </li>
                </ul>
            </div>
        </div>

        <!-- Info Panel (Node details) -->
        <div v-if="selectedNodeInfo" class="info-panel">
            <button class="info-close-btn" @click="selectedNodeInfo = null" aria-label="Close">&times;</button>
            <span class="info-group-tag">{{ selectedNodeInfo.group }}</span>
            <h3>{{ selectedNodeInfo.name }}</h3>
            <p>{{ selectedNodeInfo.doc }}</p>
        </div>

        <!-- Universal Legend -->
        <div class="legend-panel">
            <h4>Legend</h4>
            <div class="legend-item"><span class="color-box process"></span> Process / Function</div>
            <div class="legend-item"><span class="color-box object"></span> Object / Artifact</div>
            <div class="legend-item"><span class="line solid"></span> Standard Flow</div>
            <div class="legend-item"><span class="line dashed"></span> Systemic (Enables/Controls/Situational)</div>
        </div>

        <div v-if="errorContent" class="error-panel">
          <h4>❌ Diagram Rendering Error</h4>
          <pre>{{ errorContent }}</pre>
        </div>

        <!-- Export Image Button -->
        <div class="export-image-container">
          <button class="export-btn" @click="exportImage">📸 Export PNG</button>
        </div>
      </template>
    </div>

  </div>
</template>

<style scoped>
.canvas-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #ffffff;
    overflow: hidden;
}

/* Top Workspace Navigation Bar */
.workspace-nav {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: #ffffff;
    border-bottom: 1px solid #e0e4e8;
    z-index: 110;
}
.workspace-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.ws-tab {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #d0d7de;
    background: #f6f8fa;
    color: #334155;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
}
.ws-tab:hover:not(:disabled) { background: #eaeef2; }
.ws-tab.active {
    background: #4CAF50;
    color: #ffffff;
    border-color: #4CAF50;
}
.ws-tab:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.workspace-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}
.share-btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #1e293b;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
}
.share-btn:hover:not(:disabled) {
    background: #f1f5f9;
    border-color: #94a3b8;
}
.share-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.workspace-stage {
    flex: 1 1 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: #ffffff;
}

.render-div { width: 100%; height: 100%; overflow: hidden; outline: none; }

/* Floating Canvas Toolbar */
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
.toolbar-btn.active {
    background: #1565C0; color: #ffffff; border-color: #1565C0;
}
.toolbar-toggle {
    display: flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 500; color: #333;
    cursor: pointer; user-select: none; padding-left: 4px;
}

/* In-Canvas Search Box */
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
.search-badge.zero {
    background: #f1f5f9; color: #94a3b8; border-color: #e2e8f0;
}
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
.stepper-controls {
    display: flex; align-items: center; justify-content: center; gap: 8px;
}
.step-btn {
    width: 30px; height: 28px; border-radius: 6px;
    border: 1px solid #cbd5e1; background: #f8fafc;
    cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;
}
.step-btn:hover:not(:disabled) { background: #e2e8f0; }
.step-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.step-btn.play-btn { background: #1565C0; color: #ffffff; border-color: #1565C0; }
.step-btn.play-btn:hover { background: #0D47A1; }
.step-counter {
    font-size: 12px; font-weight: 700; color: #1565C0; margin-left: 6px;
}
.step-summary {
    font-size: 12px; color: #334155; text-align: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Analysis Summary Drawer */
.summary-panel {
    position: absolute; top: 16px; right: 16px; width: 350px; max-height: calc(100% - 100px);
    background: #ffffff; border: 1px solid #d0d7de; border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.14); padding: 18px;
    overflow-y: auto; z-index: 950;
}
.summary-panel h3 { margin: 0 0 4px 0; padding-right: 28px; font-size: 16px; color: #1e293b; }
.summary-sub { margin: 0 0 12px 0; font-size: 12px; color: #64748b; }
.summary-metrics { display: flex; gap: 8px; margin-bottom: 14px; }
.metric-box {
    flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
    padding: 8px; text-align: center; display: flex; flex-direction: column;
}
.metric-val { font-size: 18px; font-weight: 700; color: #1e293b; }
.metric-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; }
.summary-section { margin-bottom: 12px; }
.sec-title { margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; }
.sec-title.danger { color: #c53030; }
.sec-title.warning { color: #c05621; }
.sec-title.ok { color: #2e7d32; }
.summary-empty { font-size: 12px; color: #94a3b8; font-style: italic; }
.summary-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 5px; }
.summary-list li {
    background: #f8fafc; border: 1px solid #edf2f7; border-radius: 5px;
    padding: 6px 8px; display: flex; flex-direction: column; gap: 2px;
}
.sum-item-label { font-size: 12px; font-weight: 600; color: #1e293b; }
.sum-item-detail { font-size: 11px; color: #64748b; }

.upload-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; z-index: 10; }
.upload-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 16px; cursor: pointer; margin-top: 15px; }

/* Info Panel Styles */
.info-panel {
    position: absolute; top: 16px; right: 16px; width: 350px; max-height: calc(100% - 100px);
    background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2); padding: 20px; overflow-y: auto; z-index: 1000;
}
.info-group-tag {
    display: inline-block; margin-bottom: 8px; padding: 2px 8px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;
    border-radius: 10px; background: #eef2f6; color: #475569;
}
.info-panel h3 { margin: 0 0 12px 0; padding-right: 28px; font-size: 18px; color: #333; }
.info-panel p { margin: 0; font-size: 14px; color: #555; line-height: 1.6; }
.info-close-btn {
    position: absolute; top: 12px; right: 12px;
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 4px;
    cursor: pointer; font-size: 22px; color: #888;
    background: none; border: none; padding: 0; line-height: 1;
    transition: background 0.15s, color 0.15s;
}
.info-close-btn:hover { background: #f0f0f0; color: #222; }

/* Legend Styles */
.legend-panel {
    position: absolute; bottom: 20px; left: 20px; background: rgba(255,255,255,0.9);
    padding: 14px; border-radius: 8px; border: 1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 100;
}
.legend-panel h4 { margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; color: #555; }
.legend-item { display: flex; align-items: center; gap: 10px; font-size: 12px; margin-bottom: 5px; color: #333; }
.color-box { width: 15px; height: 15px; border-radius: 4px; display: inline-block; border: 1px solid rgba(0,0,0,0.2); }
.color-box.process { background: #FFF2CC; }
.color-box.object { background: #D5E8D4; }
.line { width: 15px; height: 2px; display: inline-block; background: transparent; }
.line.solid { border-top: 2px solid #848484; }
.line.dashed { border-top: 2px dashed #848484; }

/* Export PNG Button */
.export-image-container { position: absolute; bottom: 20px; right: 20px; z-index: 100; }
.export-btn { background: #ffffff; border: 1px solid #ccc; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: all 0.2s; }
.export-btn:hover { background: #f0f0f0; transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0,0,0,0.15); }

.error-panel { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); background: #ffebee; color: #c62828; padding: 15px 25px; border-radius: 8px; border: 1px solid #ef9a9a; z-index: 1000; max-width: 80%; }

/* Status & Empty State Overlays */
.status-overlay {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    text-align: center; background: white; padding: 40px 50px; border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e0e0e0; z-index: 10;
}
.status-overlay h3 { margin: 15px 0 5px 0; color: #333; font-size: 1.1rem; }
.status-overlay p { margin: 0; color: #777; font-size: 0.9rem; }

.spinner {
    width: 40px; height: 40px; margin: 0 auto 10px auto;
    border: 3px solid #e0e0e0; border-top: 3px solid #007bff;
    border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.overlay-error { color: #d32f2f; font-size: 0.9rem; margin: 10px 0; }

.empty-state {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    text-align: center; max-width: 480px; padding: 40px 30px;
    background: #fafafa; border: 2px dashed #d0d7de; border-radius: 12px;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-state h3 { margin: 0 0 10px 0; color: #24292f; font-size: 1.2rem; }
.empty-state p { margin: 0 0 20px 0; color: #57606a; font-size: 0.95rem; line-height: 1.5; }
.model-quick-stats { display: flex; justify-content: center; gap: 15px; }
.stat-pill {
    background: #ffffff; border: 1px solid #d0d7de; padding: 6px 14px;
    border-radius: 20px; font-size: 0.85rem; color: #444; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

@media (max-width: 768px) {
    .workspace-nav { padding-left: 105px; }
}
</style>
