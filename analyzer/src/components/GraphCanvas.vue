<script setup>
import { ref, watch, nextTick } from 'vue';
import mermaid from 'mermaid';
import svgPanZoom from 'svg-pan-zoom';
import { Network } from 'vis-network';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';

import { store, graphData, applyModelXml } from '../store/graphStore.js';
import { loadAndParseXML } from '../core/xmlParser.js';
import { graphToMermaidAndData } from '../renderers/mermaidGenerator.js';

const fileInput = ref(null);
const mermaidDiv = ref(null);
const visDiv = ref(null);
const threeDiv = ref(null);

const errorContent = ref('');
const selectedNodeInfo = ref(null); // State for the Info Panel

let panZoomInstance = null;
let visNetworkInstance = null;
let threeGraphInstance = null;

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

// --- UNIVERSAL NODE CLICK HANDLER ---
const showNodeInfo = (rawId) => {
    // Mermaid sends IDs with underscores (e.g., id_123) instead of hyphens. Fix it back.
    const originalId = rawId.replace(/_/g, '-');
    const gActive = graphData.gActive();
    
    if (gActive.hasNode(originalId)) {
        selectedNodeInfo.value = {
            name: store.renderPayload.customLabels[originalId] || gActive.getNodeAttribute(originalId, 'name') || 'Unknown',
            doc: gActive.getNodeAttribute(originalId, 'doc') || 'Description is missing in the model.'
        };
    } else {
        selectedNodeInfo.value = null;
    }
};

// Expose to window so Mermaid's SVG can call it
window.handleNodeClick = showNodeInfo;

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

// --- RENDERERS ---
const renderMermaid = async (payload) => {
    if (panZoomInstance) { panZoomInstance.destroy(); panZoomInstance = null; }
    mermaidDiv.value.innerHTML = '';
    
    const { mermaidCode } = graphToMermaidAndData(
        graphData.gActive(), 
        payload.nodes, 
        payload.edges, 
        payload.renderSubgraphs, 
        payload.customLabels,
        payload.highlightedNodes
    );
    if (!mermaidCode) return;

    try {
        // 1. Захватываем не только svg, но и функцию bindFunctions
        const { svg, bindFunctions } = await mermaid.render('mermaid-svg-element', mermaidCode);
        
        mermaidDiv.value.innerHTML = svg;
        const svgElement = mermaidDiv.value.querySelector('svg');
        
        // 2. Инициализируем обработчики кликов Mermaid
        if (bindFunctions) {
            bindFunctions(mermaidDiv.value);
        }
        
        svgElement.style.width = "100%"; 
        svgElement.style.height = "100%";
        
        panZoomInstance = svgPanZoom(svgElement, { 
            zoomEnabled: true, 
            controlIconsEnabled: false, 
            fit: true, 
            center: true,
            preventMouseEventsDefault: false // Разрешает прохождение кликов до SVG
        });
    } catch (error) { 
        errorContent.value = error.message; 
    }
};

const renderVisJs = (payload) => {
    if (visNetworkInstance) { visNetworkInstance.destroy(); visNetworkInstance = null; }
    const gActive = graphData.gActive();
    
    const nodes = Array.from(payload.nodes).map(id => {
        const type = gActive.getNodeAttribute(id, 'type') || '';
        const isProc = type.includes('BusinessFunction') || type.includes('BusinessProcess');
        const isHighlighted = payload.highlightedNodes && payload.highlightedNodes.has(id);
        
        return {
            id,
            label: payload.customLabels[id] || gActive.getNodeAttribute(id, 'name') || 'Unknown',
            shape: isProc ? 'box' : 'ellipse',
            // Highlight styling for central process
            color: isHighlighted 
                ? { background: '#FFE6CC', border: '#D79B00' }
                : (isProc ? { background: '#FFF2CC', border: '#D6B656' } : { background: '#D5E8D4', border: '#82B366' }),
            font: { face: 'sans-serif', size: isHighlighted ? 16 : 14, bold: isHighlighted },
            borderWidth: isHighlighted ? 3 : 1
        };
    });

    const edges = payload.edges.map(e => {
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

        return { from: e.u, to: e.v, label, dashes, arrows: 'to', font: { size: 10, align: 'middle' }, color: { color: dashes ? '#808080' : '#848484' } };
    });

    visNetworkInstance = new Network(visDiv.value, { nodes, edges }, {
        physics: { enabled: true, solver: 'forceAtlas2Based' },
        layout: { hierarchical: { enabled: payload.renderSubgraphs, direction: 'UD', sortMethod: 'directed' } }
    });

    visNetworkInstance.on("click", function (params) {
        if (params.nodes.length > 0) showNodeInfo(params.nodes[0]);
        else selectedNodeInfo.value = null; 
    });
};

const render3D = (payload) => {
    threeDiv.value.innerHTML = '';
    const gActive = graphData.gActive();

    const nodes = Array.from(payload.nodes).map(id => {
        const type = gActive.getNodeAttribute(id, 'type') || '';
        const isProc = type.includes('BusinessFunction') || type.includes('BusinessProcess');
        const isHighlighted = payload.highlightedNodes && payload.highlightedNodes.has(id);
        
        return {
            id, 
            name: payload.customLabels[id] || gActive.getNodeAttribute(id, 'name') || 'Unknown',
            val: isHighlighted ? 35 : (isProc ? 20 : 10), 
            color: isHighlighted ? '#D79B00' : (isProc ? '#D6B656' : '#82B366'),
            isHighlighted
        };
    });

    const links = payload.edges.map(e => ({ source: e.u, target: e.v, name: e.data.name || e.data.type }));

    threeGraphInstance = ForceGraph3D()(threeDiv.value)
        .width(threeDiv.value.clientWidth)
        .height(threeDiv.value.clientHeight)
        .graphData({ nodes, links })
        .backgroundColor('#ffffff')
        .nodeColor('color')
        .nodeVal('val')
        // Constant 2D text label above the 3D node
        .nodeThreeObjectExtend(true)
        .nodeThreeObject(node => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = `${node.isHighlighted ? 'bold ' : ''}24px Sans-Serif`;
            const textWidth = context.measureText(node.name).width;
            canvas.width = textWidth + 10;
            canvas.height = 30;
            context.font = `${node.isHighlighted ? 'bold ' : ''}24px Sans-Serif`;
            context.fillStyle = node.isHighlighted ? '#D79B00' : 'rgba(80, 80, 80, 0.9)';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(node.name, canvas.width / 2, canvas.height / 2);
            
            // eslint-disable-next-line no-undef
            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            // eslint-disable-next-line no-undef
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false });
            // eslint-disable-next-line no-undef
            const sprite = new THREE.Sprite(spriteMaterial);
            
            const scale = node.isHighlighted ? 0.3 : 0.2;
            sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
            sprite.position.set(0, node.isHighlighted ? 15 : 10, 0); // Position above node
            return sprite;
        })
        .linkColor(() => '#a0a0a0')
        .linkDirectionalArrowLength(4)
        .linkDirectionalArrowRelPos(1)
        .onNodeClick(node => showNodeInfo(node.id))
        .onBackgroundClick(() => { selectedNodeInfo.value = null; });
};

watch(() => [store.renderPayload, store.activeEngine], async ([newPayload, engine]) => {
    selectedNodeInfo.value = null; // Hide panel on new render
    if (!newPayload || newPayload.nodes.size === 0) return;
    errorContent.value = '';
    await nextTick();
    if (engine === 'mermaid') await renderMermaid(newPayload);
    else if (engine === 'visjs') renderVisJs(newPayload);
    else if (engine === '3d') render3D(newPayload);
}, { deep: true });

// --- UNIVERSAL PNG EXPORT ---
const exportImage = () => {
    if (store.activeEngine === 'mermaid') {
        const svg = mermaidDiv.value.querySelector('svg');
        if (!svg) return;
        
        // Temporarily reset zoom to capture full diagram (matches your old Python logic)
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
                
                // INCOSE Watermark (from old frontend.py)
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
        const canvas = visDiv.value.querySelector('canvas');
        if (canvas) {
            const a = document.createElement("a");
            a.download = "Diagram_Vis.png";
            a.href = canvas.toDataURL("image/png");
            a.click();
        }
    } else if (store.activeEngine === '3d') {
        // Force synchronous render to buffer, then capture canvas
        if (threeGraphInstance) {
            threeGraphInstance.renderer().render(threeGraphInstance.scene(), threeGraphInstance.camera());
            const canvas = threeDiv.value.querySelector('canvas');
            if (canvas) {
                const a = document.createElement("a");
                a.download = "Diagram_3D.png";
                a.href = canvas.toDataURL("image/png");
                a.click();
            }
        }
    }
};

// 3d canvas redraw triggered by window resize
window.addEventListener('resize', () => {
    if (store.activeEngine === '3d' && threeGraphInstance && threeDiv.value) {
        threeGraphInstance.width(threeDiv.value.clientWidth);
        threeGraphInstance.height(threeDiv.value.clientHeight);
    }
});
</script>

<template>
  <div class="canvas-container">
    <!-- Loading Overlay -->
    <div v-if="store.isLoading" class="status-overlay">
        <div class="spinner"></div>
        <h3>Loading ISO 15288 Model...</h3>
        <p>Parsing ArchiMate graph elements and relationships</p>
    </div>

    <!-- Fallback Upload Overlay if model failed or missing -->
    <div v-else-if="!store.isLoaded" class="upload-overlay">
        <h3>Model Not Loaded</h3>
        <p v-if="store.loadError" class="overlay-error">{{ store.loadError }}</p>
        <p v-else>Please choose an ArchiMate Open Exchange XML file.</p>
        <input type="file" accept=".xml" ref="fileInput" @change="handleFileUpload" style="display: none" />
        <button class="upload-btn" @click="fileInput.click()">📁 Choose File</button>
    </div>

    <!-- Empty State Guide (Model is loaded, no diagram generated yet) -->
    <div v-else-if="store.renderPayload.nodes.size === 0" class="empty-state">
        <div class="empty-icon">📐</div>
        <h3>{{ store.modelName }} Ready</h3>
        <p>Select an analysis scenario and parameters in the sidebar, then click <strong>"Generate Diagram"</strong>.</p>
        <div class="model-quick-stats">
          <span class="stat-pill">Processes: <strong>{{ Object.keys(store.processes).length }}</strong></span>
          <span class="stat-pill">Business Objects: <strong>{{ Object.keys(store.businessObjects).length }}</strong></span>
        </div>
    </div>

    <!-- Render Targets -->
    <div v-if="store.activeEngine === 'mermaid' && store.renderPayload.nodes.size > 0" ref="mermaidDiv" class="render-div"></div>
    <div v-if="store.activeEngine === 'visjs' && store.renderPayload.nodes.size > 0" ref="visDiv" class="render-div"></div>
    <div v-if="store.activeEngine === '3d' && store.renderPayload.nodes.size > 0" ref="threeDiv" class="render-div"></div>
    
    <!-- Info Panel (Node details) -->
    <div v-if="selectedNodeInfo" class="info-panel">
        <button class="close-btn" @click="selectedNodeInfo = null">&times;</button>
        <h3>{{ selectedNodeInfo.name }}</h3>
        <p>{{ selectedNodeInfo.doc }}</p>
    </div>

    <!-- Universal Legend -->
    <div v-if="store.renderPayload.nodes.size > 0" class="legend-panel">
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
    <div v-if="store.renderPayload.nodes.size > 0" class="export-image-container">
      <button class="export-btn" @click="exportImage">📸 Export PNG</button>
    </div>
  </div>
</template>

<style scoped>
.canvas-container { width: 100%; height: 100%; position: relative; background: #ffffff; overflow: hidden; }
.render-div { width: 100%; height: 100vh; outline: none; }

.upload-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; z-index: 10; }
.upload-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 16px; cursor: pointer; margin-top: 15px; }

/* Info Panel Styles (Based on old frontend.py) */
.info-panel {
    position: absolute; top: 20px; right: 20px; width: 350px; max-height: 80vh;
    background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2); padding: 20px; overflow-y: auto; z-index: 1000;
}
.info-panel h3 { margin: 0 0 15px 0; font-size: 18px; color: #333; }
.info-panel p { margin: 0; font-size: 14px; color: #555; line-height: 1.6; }
.close-btn { position: absolute; top: 15px; right: 15px; cursor: pointer; font-size: 24px; color: #aaa; background: none; border: none; padding: 0; line-height: 1; }
.close-btn:hover { color: #333; }

/* Legend Styles */
.legend-panel {
    position: absolute; bottom: 25px; left: 25px; background: rgba(255,255,255,0.9);
    padding: 15px; border-radius: 8px; border: 1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 100;
}
.legend-panel h4 { margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; color: #555; }
.legend-item { display: flex; align-items: center; gap: 10px; font-size: 12px; margin-bottom: 6px; color: #333; }
.color-box { width: 16px; height: 16px; border-radius: 4px; display: inline-block; border: 1px solid rgba(0,0,0,0.2); }
.color-box.process { background: #FFF2CC; }
.color-box.object { background: #D5E8D4; }
.line { width: 16px; height: 2px; display: inline-block; background: transparent; }
.line.solid { border-top: 2px solid #848484; }
.line.dashed { border-top: 2px dashed #848484; }

/* Export PNG Button */
.export-image-container { position: absolute; bottom: 25px; right: 25px; z-index: 100; }
.export-btn { background: #ffffff; border: 1px solid #ccc; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: all 0.2s; }
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
</style>