<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import mermaid from 'mermaid';
import svgPanZoom from 'svg-pan-zoom';
import { Network } from 'vis-network';

import { store, graphData, applyModelXml } from '../store/graphStore.js';
import { graphToMermaidAndData } from '../renderers/mermaidGenerator.js';
import { getProcessGroup, getProcessOrderIndex, groupColors } from '../core/iso15288Groups.js';
import { buildFlowSteps } from '../core/flowStepper.js';
import N2Matrix from './N2Matrix.vue';
import InsightsView from './InsightsView.vue';
import Space3D from './Space3D.vue';

const stageRef = ref(null);
const fileInput = ref(null);
const mermaidDiv = ref(null);
const visDiv = ref(null);

const errorContent = ref('');
const selectedNodeInfo = ref(null);
const showSummaryDrawer = ref(false);
const isSummaryCollapsed = ref(false);

// In-canvas node search state
const searchQuery = ref('');
const searchFocusIdx = ref(0);

// Report-pinned highlight nodes (Case 8 / Case 9 interactive checkboxes — zero redraw)
const pinnedNodeIds = ref(new Set());

// Step-by-step Flow Player state
const stepperActive = ref(false);
const flowSteps = ref([]);
const currentStepIdx = ref(0);
const isPlaying = ref(false);
let playTimer = null;

// Track currently rendered node IDs for search (especially in Vis.js Full/Context modes)
const rendered2DNodeIds = ref([]);

const hasSlice = computed(() => store.renderPayload && store.renderPayload.nodes.size > 0);
const effectiveVisScope = computed(() => {
    if (!hasSlice.value) return 'full';
    return store.visOptions.scope || 'slice';
});

// Show 2D canvas whenever there is a slice OR when user is in Vis.js Full Model mode
const show2DCanvas = computed(() => {
    if (hasSlice.value) return true;
    return store.activeEngine === 'visjs' && store.visOptions.scope === 'full';
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

const searchMatchList = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return [];
    const gActive = graphData.gActive();
    if (!gActive) return [];

    const sourceIds = store.activeEngine === 'visjs' && rendered2DNodeIds.value.length > 0
        ? rendered2DNodeIds.value
        : Array.from(store.renderPayload.nodes || []);

    const matches = [];
    sourceIds.forEach((id) => {
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
let resizeObserver = null;
let resizeRaf = null;

// Concentric ring geometry for 2D Vis.js "Process Groups" (Onion) layout
// Tailoring is intentionally excluded from the concentric rings.
const ONION_RING_GROUPS = [
    { group: 'Technical', label: 'Technical Processes', radius: 340, fill: 'rgba(46, 125, 50, 0.045)', stroke: 'rgba(46, 125, 50, 0.38)' },
    { group: 'Technical Management', label: 'Technical Management', radius: 640, fill: 'rgba(21, 101, 192, 0.035)', stroke: 'rgba(21, 101, 192, 0.34)' },
    { group: 'Organizational Project-Enabling', label: 'Organisational Project-Enabling', radius: 920, fill: 'rgba(106, 27, 154, 0.03)', stroke: 'rgba(106, 27, 154, 0.30)' },
    { group: 'Agreement', label: 'Agreement', radius: 1160, fill: 'rgba(198, 40, 40, 0.025)', stroke: 'rgba(198, 40, 40, 0.28)' },
    { group: 'External', label: 'External Boundary', radius: 1380, fill: 'rgba(55, 71, 79, 0.02)', stroke: 'rgba(55, 71, 79, 0.32)' }
];

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

// --- INTERNAL ACTIVITIES HELPER ---
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

// --- UNIVERSAL NODE CLICK HANDLER ---
const showNodeInfo = (rawId) => {
    const originalId = rawId.replace(/_/g, '-');
    const gActive = graphData.gActive();

    if (gActive && gActive.hasNode(originalId)) {
        const name = store.renderPayload.customLabels?.[originalId] || gActive.getNodeAttribute(originalId, 'name') || 'Unknown';
        const type = gActive.getNodeAttribute(originalId, 'type') || '';
        const isProc = type.includes('BusinessFunction') || type.includes('BusinessProcess');
        const group = isProc ? getProcessGroup(name) : 'Business Object';

        showSummaryDrawer.value = false;
        selectedNodeInfo.value = {
            name,
            group,
            doc: gActive.getNodeAttribute(originalId, 'doc') || 'Description is missing in the model.',
            activities: type.includes('BusinessFunction') ? getInternalActivities(originalId) : []
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

// --- MERMAID DOM HELPERS (ZERO-REDRAW PIN & ZOOM) ---
const MERMAID_SHAPE_SELECTOR = ':scope > rect, :scope > polygon, :scope > circle, :scope > ellipse, :scope > path, .label-container';

const findMermaidNodeEl = (nodeId) => {
    if (!mermaidDiv.value || !nodeId) return null;
    const mId = nodeId.replace(/-/g, '_');
    const candidates = mermaidDiv.value.querySelectorAll('.node, .cluster');
    for (const el of candidates) {
        const elId = el.getAttribute('id') || '';
        if (elId === mId || elId.startsWith(`flowchart-${mId}-`) || elId.includes(`-${mId}-`)) {
            return el;
        }
    }
    return null;
};

const applyMermaidPinnedClasses = () => {
    if (!mermaidDiv.value) return;

    mermaidDiv.value.querySelectorAll('.report-pinned').forEach((el) => {
        el.classList.remove('report-pinned');
        el.style.removeProperty('filter');
        el.querySelectorAll(MERMAID_SHAPE_SELECTOR).forEach((shape) => {
            shape.style.removeProperty('stroke');
            shape.style.removeProperty('stroke-width');
            shape.style.removeProperty('fill');
        });
    });

    pinnedNodeIds.value.forEach((nodeId) => {
        const el = findMermaidNodeEl(nodeId);
        if (!el) return;
        el.classList.add('report-pinned');
        el.style.setProperty('filter', 'drop-shadow(0 0 6px rgba(216, 27, 96, 0.55))');
        el.querySelectorAll(MERMAID_SHAPE_SELECTOR).forEach((shape) => {
            shape.style.setProperty('stroke', '#D81B60', 'important');
            shape.style.setProperty('stroke-width', '4px', 'important');
            shape.style.setProperty('fill', '#FCE4EC', 'important');
        });
    });
};

// --- REPORT INTERACTIVE ACTIONS ---
const isNodeInDiagram = (nodeId) => {
    if (!nodeId) return false;
    if (store.activeEngine === 'visjs') return rendered2DNodeIds.value.includes(nodeId);
    return store.renderPayload.nodes.has(nodeId);
};

const togglePinNode = (nodeId) => {
    if (!isNodeInDiagram(nodeId)) return;
    const next = new Set(pinnedNodeIds.value);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    pinnedNodeIds.value = next;

    if (store.activeEngine === 'mermaid') {
        applyMermaidPinnedClasses();
    } else if (store.activeEngine === 'visjs') {
        applyVisVisualState();
    }
};

const clearPinnedNodes = () => {
    pinnedNodeIds.value = new Set();
    if (store.activeEngine === 'mermaid') {
        applyMermaidPinnedClasses();
    } else if (store.activeEngine === 'visjs') {
        applyVisVisualState();
    }
};

const zoomToNode = (nodeId) => {
    if (!isNodeInDiagram(nodeId)) return;

    if (store.activeEngine === 'mermaid' && panZoomInstance && mermaidDiv.value) {
        const el = findMermaidNodeEl(nodeId);
        if (!el) return;

        const containerRect = mermaidDiv.value.getBoundingClientRect();
        const nodeRect = el.getBoundingClientRect();

        const currentZoom = panZoomInstance.getZoom();
        const targetNodeWidth = Math.min(260, containerRect.width * 0.24);
        const desiredScale = nodeRect.width > 0 ? Math.min(2.6, Math.max(1.0, targetNodeWidth / nodeRect.width)) : 1.5;
        const targetZoom = Math.min(4.5, Math.max(currentZoom, currentZoom * desiredScale));

        const rightOffset = (showSummaryDrawer.value && !isSummaryCollapsed.value) ? 340 : 0;
        const viewportCenterX = containerRect.left + (containerRect.width - rightOffset) / 2;
        const viewportCenterY = containerRect.top + containerRect.height / 2;
        const nodeCenterX = nodeRect.left + nodeRect.width / 2;
        const nodeCenterY = nodeRect.top + nodeRect.height / 2;

        panZoomInstance.panBy({
            x: viewportCenterX - nodeCenterX,
            y: viewportCenterY - nodeCenterY
        });

        if (targetZoom > currentZoom * 1.05) {
            panZoomInstance.zoomAtPoint(targetZoom, {
                x: viewportCenterX - containerRect.left,
                y: viewportCenterY - containerRect.top
            });
        }

        el.classList.remove('report-pulse');
        void el.offsetWidth;
        el.classList.add('report-pulse');
        setTimeout(() => el.classList.remove('report-pulse'), 1500);

    } else if (store.activeEngine === 'visjs' && visNetworkInstance) {
        visNetworkInstance.focus(nodeId, {
            scale: 1.15,
            animation: { duration: 450, easingFunction: 'easeInOutQuad' }
        });
        visNetworkInstance.selectNodes([nodeId]);
    }
};

// --- IN-CANVAS SEARCH FOCUS ---
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
const destroyRenderers = () => {
    if (panZoomInstance) {
        panZoomInstance.destroy();
        panZoomInstance = null;
    }
    if (visNetworkInstance) {
        visNetworkInstance.destroy();
        visNetworkInstance = null;
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

// --- APPLY STEP / SEARCH / REPORT-PIN / IN-CONTEXT STATE TO VIS.JS ---
const applyVisVisualState = () => {
    if (!visNetworkInstance) return;
    const nodesDS = visNetworkInstance.body.data.nodes;
    const edgesDS = visNetworkInstance.body.data.edges;
    const stepState = currentStepState.value;
    const matches = searchMatchSet.value;
    const pinned = pinnedNodeIds.value;
    const hasPins = pinned.size > 0;
    const mode = effectiveVisScope.value;

    const updatedNodes = visBaseNodes.map((n) => {
        if (pinned.has(n.id)) {
            return {
                ...n,
                color: { background: '#FCE4EC', border: '#D81B60', highlight: { background: '#F8BBD0', border: '#AD1457' } },
                borderWidth: 4.5,
                opacity: 1
            };
        }
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
                opacity: 0.22
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
                opacity: 0.25
            };
        }
        if (hasPins) {
            return { ...n, opacity: n._inSlice ? 0.5 : 0.22 };
        }
        if (mode === 'context' && !n._inSlice) {
            return {
                ...n,
                color: { background: '#f5f7fa', border: '#d5dce4' },
                font: { ...n.font, color: '#94a3b8' },
                opacity: 0.4
            };
        }
        return n;
    });

    const updatedEdges = visBaseEdges.map((e) => {
        if (hasPins && (pinned.has(e.from) || pinned.has(e.to))) {
            return {
                ...e,
                width: 2.8,
                color: { color: '#D81B60', highlight: '#AD1457' },
                font: { ...e.font, color: '#AD1457' }
            };
        }
        if (matches !== null) {
            const touched = matches.has(e.from) || matches.has(e.to);
            return touched
                ? { ...e, width: 2 }
                : { ...e, width: 0.8, color: { color: 'rgba(180,180,180,0.18)' }, font: { ...e.font, color: 'rgba(160,160,160,0.22)' } };
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
                width: 0.8,
                color: { color: 'rgba(180,180,180,0.22)' },
                font: { ...e.font, color: 'rgba(160,160,160,0.25)' }
            };
        }
        if (mode === 'context') {
            if (e._inSlice) {
                return {
                    ...e,
                    width: 2.4,
                    color: { color: e.dashes ? '#64748b' : '#2e7d32', highlight: '#1b5e20' }
                };
            }
            return {
                ...e,
                width: 0.7,
                label: '',
                color: { color: 'rgba(180,190,200,0.22)' }
            };
        }
        if (hasPins) {
            return {
                ...e,
                width: 1,
                color: { color: 'rgba(180,180,180,0.3)' },
                font: { ...e.font, color: 'rgba(160,160,160,0.35)' }
            };
        }
        return e;
    });

    nodesDS.update(updatedNodes);
    edgesDS.update(updatedEdges);
};

// --- 2D CONCENTRIC RING POSITIONING (ONION LAYOUT) ---
const computeOnionPositions = (nodesList, edgesList) => {
    const ringRadiusByGroup = {};
    ONION_RING_GROUPS.forEach((r) => { ringRadiusByGroup[r.group] = r.radius; });

    const procsByGroup = {};
    const artefacts = [];

    nodesList.forEach((n) => {
        if (n._isProc) {
            const g = n._group;
            if (!procsByGroup[g]) procsByGroup[g] = [];
            procsByGroup[g].push(n);
        } else {
            artefacts.push(n);
        }
    });

    const posById = new Map();
    const angleById = new Map();
    const radiusById = new Map();

    // 1. Place processes evenly around their Process Group circle in ISO 15288 order
    ONION_RING_GROUPS.forEach((ring, ringIdx) => {
        const list = procsByGroup[ring.group] || [];
        if (list.length === 0) return;

        list.sort((a, b) => getProcessOrderIndex(a._rawName) - getProcessOrderIndex(b._rawName));
        const startAngle = -Math.PI / 2 + (ringIdx % 2 === 1 ? Math.PI / Math.max(list.length, 4) : 0);

        list.forEach((n, idx) => {
            const angle = startAngle + (2 * Math.PI * idx) / list.length;
            const x = ring.radius * Math.cos(angle);
            const y = ring.radius * Math.sin(angle);
            posById.set(n.id, { x, y });
            angleById.set(n.id, angle);
            radiusById.set(n.id, ring.radius);
        });
    });

    // 2. Group artefacts by their radial band based on connected processes
    const connectedProcs = new Map();
    edgesList.forEach((e) => {
        if (radiusById.has(e.from) && !radiusById.has(e.to)) {
            if (!connectedProcs.has(e.to)) connectedProcs.set(e.to, []);
            connectedProcs.get(e.to).push(e.from);
        } else if (radiusById.has(e.to) && !radiusById.has(e.from)) {
            if (!connectedProcs.has(e.from)) connectedProcs.set(e.from, []);
            connectedProcs.get(e.from).push(e.to);
        }
    });

    // Bucket artefacts into concentric bands so they never collide on top of each other
    const bands = new Map(); // bandRadius -> Array({ node, targetAngle })

    artefacts.forEach((art, idx) => {
        const peers = Array.from(new Set(connectedProcs.get(art.id) || []));
        let targetRadius = 175;
        let targetAngle = (2 * Math.PI * idx) / Math.max(artefacts.length, 1);

        if (peers.length > 0) {
            const peerRadii = peers.map((pId) => radiusById.get(pId));
            const uniqueRadii = Array.from(new Set(peerRadii));
            const minR = Math.min(...uniqueRadii);
            const maxR = Math.max(...uniqueRadii);

            // Circular mean angle of connected processes
            let sinSum = 0;
            let cosSum = 0;
            peers.forEach((pId) => {
                const a = angleById.get(pId);
                sinSum += Math.sin(a);
                cosSum += Math.cos(a);
            });
            targetAngle = Math.atan2(sinSum, cosSum);

            if (uniqueRadii.length === 1) {
                // Connected only to one process group:
                // Technical-only artefacts go INSIDE the core circle!
                if (minR === ringRadiusByGroup['Technical']) {
                    targetRadius = 155;
                } else {
                    targetRadius = minR - 115;
                }
            } else {
                // Cross-group exchange: sit cleanly between the connected rings
                targetRadius = Math.round(((minR + maxR) / 2) / 30) * 30;
            }
        }

        if (!bands.has(targetRadius)) bands.set(targetRadius, []);
        bands.get(targetRadius).push({ node: art, targetAngle });
    });

    // Spread artefacts evenly within each radial band while preserving angular ordering
    bands.forEach((items, bandR) => {
        items.sort((a, b) => a.targetAngle - b.targetAngle);
        const count = items.length;
        const minAngularStep = Math.min((2 * Math.PI) / Math.max(count, 1), 110 / Math.max(bandR, 120));

        // If band is dense, distribute evenly around the band (with gentle radial stagger)
        if (count * minAngularStep > Math.PI * 1.65) {
            items.forEach((entry, i) => {
                const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
                const r = bandR + (count > 14 ? ((i % 2) === 0 ? -24 : 24) : 0);
                posById.set(entry.node.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
            });
        } else {
            // Keep close to targetAngle while nudging overlapping neighbours apart
            let prevAngle = null;
            items.forEach((entry, i) => {
                let angle = entry.targetAngle;
                if (prevAngle !== null && angle - prevAngle < minAngularStep) {
                    angle = prevAngle + minAngularStep;
                }
                prevAngle = angle;
                const r = bandR + ((i % 2) === 0 ? -10 : 10);
                posById.set(entry.node.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
            });
        }
    });

    return posById;
};

// --- 2D RENDERERS ---
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

        rendered2DNodeIds.value = Array.from(payload.nodes);

        if (pinnedNodeIds.value.size > 0) {
            applyMermaidPinnedClasses();
        }
    } catch (error) {
        errorContent.value = error.message;
    }
};

const renderVisJs = (payload) => {
    destroyRenderers();
    if (!visDiv.value) return;
    const gActive = graphData.gActive();
    if (!gActive) return;

    const mode = effectiveVisScope.value;
    const useRings = store.visOptions.useRings;
    const sliceNodes = payload.nodes || new Set();
    const sliceEdges = sliceEdgeKeySet.value;

    // Fold internal BusinessProcess activities inside parent BusinessFunction cards in Slice mode
    const embeddedActivitiesByParent = new Map();
    const foldedChildIds = new Set();

    if (mode === 'slice') {
        (payload.edges || []).forEach((e) => {
            const eType = e.data?.type || '';
            if (!eType.includes('Composition')) return;
            const uType = gActive.getNodeAttribute(e.u, 'type') || '';
            const vType = gActive.getNodeAttribute(e.v, 'type') || '';
            if (uType.includes('BusinessFunction') && vType.includes('BusinessProcess')) {
                if (!embeddedActivitiesByParent.has(e.u)) embeddedActivitiesByParent.set(e.u, []);
                const childName = payload.customLabels?.[e.v] || gActive.getNodeAttribute(e.v, 'name') || 'Activity';
                embeddedActivitiesByParent.get(e.u).push(childName);
                foldedChildIds.add(e.v);
            }
        });
    }

    const candidateNodeIds = mode === 'slice'
        ? Array.from(sliceNodes)
        : gActive.nodes();

    const includedIds = new Set();
    const rawNodes = [];

    candidateNodeIds.forEach((id) => {
        if (!gActive.hasNode(id) || foldedChildIds.has(id) || includedIds.has(id)) return;
        const type = gActive.getNodeAttribute(id, 'type') || '';
        // Skip internal BusinessProcess activities in Full/Context or Ring views
        if (type.includes('BusinessProcess')) return;

        const rawName = gActive.getNodeAttribute(id, 'name') || 'Unknown';
        const isProc = type.includes('BusinessFunction');
        const group = isProc ? getProcessGroup(rawName) : 'Business Objects';

        // Exclude Tailoring when Onion Rings layout is active (per design)
        if (useRings && isProc && group === 'Tailoring') return;

        const inSlice = sliceNodes.has(id);
        const isHighlighted = mode !== 'full' && payload.highlightedNodes && payload.highlightedNodes.has(id);
        const baseName = (inSlice && payload.customLabels?.[id]) || rawName;

        const embedded = (!useRings && mode === 'slice') ? embeddedActivitiesByParent.get(id) : null;
        let label = baseName;
        let align = 'center';
        let widthMax = useRings ? (isProc ? 165 : 135) : 185;

        if (embedded && embedded.length > 0) {
            label = `${baseName}\n────────────────────\n` + embedded.map((a) => `• ${a}`).join('\n');
            align = 'left';
            widthMax = 260;
        }

        const groupBorder = isProc ? (groupColors[group] || '#D6B656') : '#82B366';

        rawNodes.push({
            id,
            label,
            shape: isProc ? 'box' : 'ellipse',
            widthConstraint: { maximum: widthMax },
            color: isHighlighted || (embedded && embedded.length > 0)
                ? { background: '#FFE6CC', border: '#D79B00', highlight: { background: '#FFD9B3', border: '#B37F00' } }
                : (isProc
                    ? { background: '#FFF8E1', border: useRings ? groupBorder : '#D6B656', highlight: { background: '#FFE8A3', border: '#B89635' } }
                    : { background: '#E8F5E9', border: '#82B366', highlight: { background: '#C8E6C9', border: '#5E8E45' } }),
            font: {
                face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                size: useRings ? (isProc ? 12 : 10.5) : (isHighlighted ? 14 : 13),
                bold: isHighlighted || (useRings && isProc),
                align,
                color: '#222222'
            },
            borderWidth: isHighlighted || (embedded && embedded.length > 0) ? 2.5 : (useRings && isProc ? 2 : 1.5),
            margin: embedded && embedded.length > 0 ? 12 : (useRings ? 7 : 10),
            opacity: 1,
            _isProc: isProc,
            _group: group,
            _rawName: rawName,
            _inSlice: inSlice
        });
        includedIds.add(id);
    });

    const rawEdges = [];
    const seenEdgeKeys = new Set();

    const addEdge = (u, v, data, idx) => {
        if (!includedIds.has(u) || !includedIds.has(v)) return;
        if (data?.access === 'hierarchy_reverse' || (data?.type || '').includes('Composition')) return;
        const key = `${u}___${v}`;
        if (seenEdgeKeys.has(key)) return;
        seenEdgeKeys.add(key);

        const type = data?.type || '';
        const access = (data?.access || '').toLowerCase();
        const subclass = data?.subclass || '';
        let label = '';
        let dashes = false;

        if (type.includes('Access')) {
            if (subclass === 'Controls') { label = 'Controls'; dashes = true; }
            else if (subclass === 'Enables') { label = 'Enables'; dashes = true; }
            else if (subclass === 'Situational') { label = access === 'read' ? 'Situational Input' : 'Situational Output'; dashes = true; }
            else if (access === 'read') label = 'Input';
            else if (access === 'write') label = 'Output';
        } else {
            label = type.replace('Relationship', '').replace('archimate:', '');
            if (label === 'Specialization') dashes = true;
        }

        rawEdges.push({
            id: `e_${idx}_${u}_${v}`,
            from: u,
            to: v,
            label: mode === 'full' ? '' : label,
            dashes,
            width: mode === 'full' ? 0.9 : 1.5,
            arrows: { to: { enabled: true, scaleFactor: mode === 'full' ? 0.55 : 0.8 } },
            font: { size: 10.5, align: 'middle', strokeWidth: 3, strokeColor: '#ffffff', color: '#444444' },
            color: { color: dashes ? '#999999' : (mode === 'full' ? 'rgba(100,116,139,0.45)' : '#666666'), highlight: '#222222' },
            _inSlice: sliceEdges.has(key)
        });
    };

    if (mode === 'slice') {
        (payload.edges || []).forEach((e, idx) => addEdge(e.u, e.v, e.data, idx));
    } else {
        let idx = 0;
        gActive.forEachEdge((edge, attr, u, v) => addEdge(u, v, attr, idx++));
    }

    // Apply deterministic concentric coordinates when Process Groups (Rings) is enabled
    const activeRingGroups = new Set();
    if (useRings) {
        const positions = computeOnionPositions(rawNodes, rawEdges);
        rawNodes.forEach((n) => {
            const p = positions.get(n.id);
            if (p) {
                n.x = p.x;
                n.y = p.y;
            }
            if (n._isProc) activeRingGroups.add(n._group);
        });
    }

    visBaseNodes = rawNodes;
    visBaseEdges = rawEdges;
    rendered2DNodeIds.value = Array.from(includedIds);

    visNetworkInstance = new Network(
        visDiv.value,
        { nodes: [...visBaseNodes], edges: [...visBaseEdges] },
        {
            edges: {
                smooth: useRings
                    ? { enabled: true, type: 'continuous', roundness: 0.25 }
                    : { enabled: true, type: 'dynamic' }
            },
            interaction: {
                hover: true
            },
            physics: useRings
                ? { enabled: false }
                : {
                    enabled: true,
                    solver: 'forceAtlas2Based',
                    forceAtlas2Based: {
                        gravitationalConstant: mode === 'full' ? -130 : -105,
                        centralGravity: 0.01,
                        springLength: mode === 'full' ? 210 : 175,
                        springConstant: 0.055,
                        avoidOverlap: 0.8
                    },
                    stabilization: {
                        iterations: mode === 'full' ? 260 : 220
                    }
                }
        }
    );

    // Draw concentric Process Group rings on the Vis.js background canvas
    if (useRings) {
        const ringsToDraw = ONION_RING_GROUPS.filter((r) => activeRingGroups.has(r.group));
        visNetworkInstance.on('beforeDrawing', (ctx) => {
            // Draw from outermost to innermost so subtle fills layer cleanly
            [...ringsToDraw].reverse().forEach((ring) => {
                ctx.save();
                ctx.beginPath();
                ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
                ctx.fillStyle = ring.fill;
                ctx.fill();
                ctx.setLineDash([8, 6]);
                ctx.lineWidth = 2;
                ctx.strokeStyle = ring.stroke;
                ctx.stroke();

                // Ring label at top (12 o'clock)
                ctx.setLineDash([]);
                ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const labelY = -ring.radius - 16;
                const textW = ctx.measureText(ring.label).width;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
                ctx.fillRect(-textW / 2 - 8, labelY - 11, textW + 16, 22);
                ctx.fillStyle = groupColors[ring.group] || '#475569';
                ctx.fillText(ring.label, 0, labelY);
                ctx.restore();
            });
        });

        setTimeout(() => {
            visNetworkInstance?.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
        }, 50);
    } else {
        visNetworkInstance.once('stabilizationIterationsDone', () => {
            visNetworkInstance?.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
        });
    }

    visNetworkInstance.on('click', (params) => {
        if (params.nodes.length > 0) showNodeInfo(params.nodes[0]);
        else selectedNodeInfo.value = null;
    });

    applyVisVisualState();
};

// --- VIEW CONTROLS ---
const fitView = () => {
    if (store.activeEngine === 'mermaid' && panZoomInstance) {
        panZoomInstance.resize();
        panZoomInstance.fit();
        panZoomInstance.center();
    } else if (store.activeEngine === 'visjs' && visNetworkInstance) {
        visNetworkInstance.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }
};

const toggleSummaryDrawer = () => {
    showSummaryDrawer.value = !showSummaryDrawer.value;
    if (showSummaryDrawer.value) {
        selectedNodeInfo.value = null;
        isSummaryCollapsed.value = false;
    }
};

// Re-render 2D graph when payload, 2D engine, Vis options, global settings, or active view changes
watch(
    () => [
        store.renderPayload,
        store.activeEngine,
        store.activeView,
        store.visOptions.scope,
        store.visOptions.useRings,
        store.settings.useHierarchy,
        store.settings.includeEnables,
        store.settings.includeControls,
        store.settings.includeSituational
    ],
    async () => {
        selectedNodeInfo.value = null;
        stopAutoPlay();
        stepperActive.value = false;
        flowSteps.value = [];
        searchQuery.value = '';
        searchFocusIdx.value = 0;
        pinnedNodeIds.value = new Set();
        showSummaryDrawer.value =
            store.activeView === 'graph' &&
            Boolean(store.renderPayload?.analysisSummary) &&
            !(store.activeEngine === 'visjs' && effectiveVisScope.value === 'full');
        isSummaryCollapsed.value = false;

        if (store.activeView !== 'graph' || !store.isLoaded || !show2DCanvas.value) {
            destroyRenderers();
            return;
        }

        errorContent.value = '';
        await nextTick();
        if (store.activeEngine === 'visjs') renderVisJs(store.renderPayload);
        else await renderMermaid(store.renderPayload, false);
    },
    { deep: true }
);

// React to step or search changes without resetting layout
watch([stepperActive, currentStepIdx, searchQuery], async () => {
    searchFocusIdx.value = 0;
    if (store.activeView !== 'graph' || !show2DCanvas.value) return;
    if (store.activeEngine === 'mermaid') {
        await renderMermaid(store.renderPayload, true);
    } else if (store.activeEngine === 'visjs') {
        applyVisVisualState();
    }
});

// --- PNG EXPORT ---
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
            a.download = `Diagram_Vis_${store.visOptions.useRings ? 'Rings' : 'Free'}.png`;
            a.href = canvas.toDataURL("image/png");
            a.click();
        }
    }
};

const syncRendererSize = () => {
    if (store.activeView !== 'graph') return;
    if (store.activeEngine === 'mermaid' && panZoomInstance) {
        panZoomInstance.resize();
    } else if (store.activeEngine === 'visjs' && visNetworkInstance) {
        visNetworkInstance.setSize('100%', '100%');
        visNetworkInstance.redraw();
    }
};

const scheduleResize = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
        syncRendererSize();
        resizeRaf = null;
    });
};

onMounted(() => {
    window.addEventListener('resize', scheduleResize);
    if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
        resizeObserver = new ResizeObserver(scheduleResize);
        resizeObserver.observe(stageRef.value);
    }
});

onUnmounted(() => {
    window.removeEventListener('resize', scheduleResize);
    if (resizeObserver) resizeObserver.disconnect();
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    stopAutoPlay();
    destroyRenderers();
});
</script>

<template>
  <div class="canvas-container" ref="stageRef">
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

    <!-- Other Projections & Reference Views -->
    <Space3D v-else-if="store.activeView === 'space3d'" />
    <N2Matrix v-else-if="store.activeView === 'n2'" />
    <InsightsView v-else-if="['checklist', 'hotspots', 'dictionary'].includes(store.activeView)" />

    <!-- 2D Diagram: Empty State (with quick jump to Vis.js Concentric Full Model) -->
    <div v-else-if="!show2DCanvas" class="empty-state">
        <div class="empty-icon">📐</div>
        <h3>{{ store.modelName }} Ready</h3>
        <p>Configure an analysis slice in the left sidebar and click <strong>"Apply Slice / Generate"</strong> — or open the full model in <strong>2D Concentric Rings</strong>, <strong>3D Space</strong>, or <strong>N2 Matrix</strong>.</p>
        <div class="model-quick-stats">
          <span class="stat-pill">Processes: <strong>{{ Object.keys(store.processes).length }}</strong></span>
          <span class="stat-pill">Business Objects: <strong>{{ Object.keys(store.businessObjects).length }}</strong></span>
        </div>
        <div class="empty-actions">
          <button
            class="quick-rings-btn"
            @click="store.activeEngine = 'visjs'; store.visOptions.scope = 'full'; store.visOptions.useRings = true;"
          >
            ◎ Open Full Model in 2D Rings
          </button>
        </div>
    </div>

    <!-- 2D Diagram: Render Targets -->
    <template v-else>
      <div
        v-if="store.activeEngine === 'mermaid'"
        ref="mermaidDiv"
        class="render-div"
        @click="handleMermaidBackgroundClick"
      ></div>
      <div v-if="store.activeEngine === 'visjs'" ref="visDiv" class="render-div"></div>

      <!-- Floating 2D Canvas Controls -->
      <div class="canvas-toolbar">
          <!-- 2D Engine Switcher: Mermaid | Vis.js -->
          <div class="engine-switch" title="Switch 2D layout engine">
              <button
                :class="['engine-btn', { active: store.activeEngine === 'mermaid' }]"
                :disabled="!hasSlice"
                @click="store.activeEngine = 'mermaid'"
              >
                Mermaid
              </button>
              <button
                :class="['engine-btn', { active: store.activeEngine === 'visjs' }]"
                @click="store.activeEngine = 'visjs'"
              >
                Vis.js
              </button>
          </div>

          <!-- Scope Switcher for Vis.js (Slice Only | In Context | Full Model) -->
          <div v-if="store.activeEngine === 'visjs'" class="engine-switch" title="Choose 2D Vis.js scope">
              <button
                :class="['engine-btn', { active: effectiveVisScope === 'slice' }]"
                :disabled="!hasSlice"
                @click="store.visOptions.scope = 'slice'"
              >
                Slice
              </button>
              <button
                :class="['engine-btn', { active: effectiveVisScope === 'context' }]"
                :disabled="!hasSlice"
                @click="store.visOptions.scope = 'context'"
              >
                In Context
              </button>
              <button
                :class="['engine-btn', { active: effectiveVisScope === 'full' }]"
                @click="store.visOptions.scope = 'full'"
              >
                Full Model
              </button>
          </div>

          <button class="toolbar-btn" @click="fitView" title="Fit diagram to viewport">🎯 Fit View</button>

          <button
            v-if="hasSlice && !(store.activeEngine === 'visjs' && effectiveVisScope === 'full') && store.renderPayload.edges.length > 0"
            :class="['toolbar-btn', { active: stepperActive }]"
            @click="toggleStepper"
            title="Step through data flow wave by wave"
          >
            {{ stepperActive ? '⏹ Exit Stepper' : '▶ Step Flow' }}
          </button>

          <button
            v-if="hasSlice && !(store.activeEngine === 'visjs' && effectiveVisScope === 'full') && store.renderPayload.analysisSummary"
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

          <!-- 2D Concentric Rings toggle (Vis.js) -->
          <label
            v-if="store.activeEngine === 'visjs'"
            class="toolbar-toggle"
            title="Arrange ISO 15288 Process Groups on concentric rings (Technical at centre, External on outer ring; Tailoring excluded)"
          >
              <input type="checkbox" v-model="store.visOptions.useRings" />
              Process Groups (Rings)
          </label>
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

      <!-- Analysis Summary Drawer (Collapsible to Header + Closeable) -->
      <div
        v-if="showSummaryDrawer && store.renderPayload.analysisSummary && !selectedNodeInfo"
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
                  <span>
                      {{ pinnedNodeIds.size > 0 ? `${pinnedNodeIds.size} node(s) highlighted` : '0 nodes highlighted' }}
                  </span>
                  <button
                    class="clear-pins-btn"
                    :disabled="pinnedNodeIds.size === 0"
                    @click="clearPinnedNodes"
                  >
                    Clear all
                  </button>
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
                                v-if="item.id && isNodeInDiagram(item.id)"
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
                                v-if="item.id && isNodeInDiagram(item.id)"
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

      <!-- Info Panel -->
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
</template>

<style scoped>
.canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    background: #ffffff;
    overflow: hidden;
}

.render-div { width: 100%; height: 100%; overflow: hidden; outline: none; }

/* Mermaid zoom pulse */
.render-div :deep(.node.report-pulse),
.render-div :deep(.cluster.report-pulse) {
    animation: mermaidNodePulse 0.75s ease-in-out 2;
}

@keyframes mermaidNodePulse {
    0%, 100% { filter: drop-shadow(0 0 0 rgba(216, 27, 96, 0)); }
    50% { filter: drop-shadow(0 0 14px rgba(216, 27, 96, 0.95)); }
}

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

.engine-switch {
    display: inline-flex;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    overflow: hidden;
}
.engine-btn {
    border: none;
    background: #f8fafc;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}
.engine-btn:not(:last-child) { border-right: 1px solid #e2e8f0; }
.engine-btn.active { background: #4CAF50; color: #ffffff; }
.engine-btn:disabled { opacity: 0.4; cursor: not-allowed; }

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

/* Analysis Summary Drawer */
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

.upload-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; z-index: 10; }
.upload-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 16px; cursor: pointer; margin-top: 15px; }

/* Info Panel Styles */
.info-panel {
    position: absolute; top: 14px; right: 16px; width: 350px; max-height: calc(100% - 96px);
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
.empty-actions { margin-top: 18px; }
.quick-rings-btn {
    background: #ffffff; border: 1px solid #4CAF50; color: #2e7d32;
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: background 0.15s, color 0.15s;
}
.quick-rings-btn:hover { background: #4CAF50; color: #ffffff; }
</style>
