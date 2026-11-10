<script setup>
import { ref, computed, watch } from 'vue';
import { store, graphData, applyModelXml, loadDefaultModel } from '../store/graphStore.js';
import { CaseRegistry, casesList } from '../cases/caseRegistry.js';
import { graphToMermaidAndData } from '../renderers/mermaidGenerator.js';
import SearchableSelect from './SearchableSelect.vue';

const customFileInput = ref(null);

const handleCustomFileUpload = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      applyModelXml(e.target.result, file.name);
      store.uiMessage = { text: `Model "${file.name}" loaded successfully!`, type: 'success' };
    } catch (err) {
      alert("Error parsing XML! " + err.message);
      store.uiMessage = { text: `Failed to parse XML: ${err.message}`, type: 'error' };
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

const resetToDefault = async () => {
  await loadDefaultModel();
};

// ISO 15288 Process Classification Mapping
const iso15288Mapping = {
  // Technical Processes
  'Business or Mission Analysis': 'Technical',
  'System Analysis': 'Technical',
  'Stakeholder Needs and Requirements Definition': 'Technical',
  'System Requirements Definition': 'Technical',
  'System Architecture Definition': 'Technical',
  'Design Definition': 'Technical',
  'Implementation': 'Technical',
  'Integration': 'Technical',
  'Verification': 'Technical',
  'Transition': 'Technical',
  'Validation': 'Technical',
  'Operation': 'Technical',
  'Maintenance': 'Technical',
  'Disposal': 'Technical',

  // Technical Management Processes
  'Project Planning': 'Technical Management',
  'Project Assessment and Control': 'Technical Management',
  'Decision Management': 'Technical Management',
  'Risk Management': 'Technical Management',
  'Configuration Management': 'Technical Management',
  'Information Management': 'Technical Management',
  'Measurement': 'Technical Management',
  'Quality Assurance': 'Technical Management',

  // Organizational Project-Enabling Processes
  'Life Cycle Model Management': 'Organizational Project-Enabling',
  'Infrastructure Management': 'Organizational Project-Enabling',
  'Portfolio Management': 'Organizational Project-Enabling',
  'Human Resource Management': 'Organizational Project-Enabling',
  'Quality Management': 'Organizational Project-Enabling',
  'Knowledge Management': 'Organizational Project-Enabling',

  // Agreement Processes
  'Acquisition': 'Agreement',
  'Supply': 'Agreement',

  // Tailoring
  'Tailoring': 'Tailoring'
};

// Transforms raw dictionary into grouped objects array for SearchableSelect
const getGroupedOptions = (sourceKey) => {
  const rawData = getDynamicOptions(sourceKey); // This uses your existing function
  if (!rawData) return [];

  return Object.entries(rawData).map(([id, name]) => {
    let group = 'Others';
    if (sourceKey === 'processes' || sourceKey === 'dynamic_inputs' || sourceKey === 'dynamic_outputs') {
      // Find group, fallback to 'Others' for unknown processes
      group = iso15288Mapping[name] || 'Others'; 
      // If it's dynamically detected as an artifact in Case 7, group as Business Objects
      if ((sourceKey === 'dynamic_inputs' || sourceKey === 'dynamic_outputs') && !store.processes[id]) {
          group = 'Business Objects';
      }
    } else if (sourceKey === 'businessObjects') {
      group = 'Business Objects';
    }
    return { id, name, group };
  });
};

// Get the currently active case configuration
const activeCase = computed(() => CaseRegistry[store.activeCaseId]);

// Reset case parameters when switching between different cases
watch(() => store.activeCaseId, () => {
  store.caseParams = {};
  store.uiMessage = { text: '', type: '' };
});

// Clear selected inputs/outputs when Central Process changes (Case 7)
watch(() => store.caseParams.pCenter, (newVal, oldVal) => {
  if (newVal !== oldVal && store.activeCaseId === 'case_7') {
    store.caseParams.selectedInputs = [];
    store.caseParams.selectedOutputs = [];
  }
});

// Resolves options for dropdowns dynamically (especially for Case 7)
const getDynamicOptions = (sourceKey) => {
  if (sourceKey === 'processes') return store.processes;
  if (sourceKey === 'businessObjects') return store.businessObjects;
  
  // Custom logic for Case 7 dynamic inputs/outputs
  if (sourceKey === 'dynamic_inputs' || sourceKey === 'dynamic_outputs') {
    const pCenter = store.caseParams.pCenter;
    if (!pCenter || !graphData.gActive) return {};
    
    const gActive = graphData.gActive();
    const result = {};
    
    if (sourceKey === 'dynamic_inputs') {
      gActive.forEachInNeighbor(pCenter, neighbor => {
        const type = gActive.getNodeAttribute(neighbor, 'type') || '';
        if (!type.includes('BusinessProcess') && !type.includes('BusinessFunction')) {
          result[neighbor] = gActive.getNodeAttribute(neighbor, 'name') || 'Unnamed';
        }
      });
    } else {
      gActive.forEachOutNeighbor(pCenter, neighbor => {
        const type = gActive.getNodeAttribute(neighbor, 'type') || '';
        if (!type.includes('BusinessProcess') && !type.includes('BusinessFunction')) {
          result[neighbor] = gActive.getNodeAttribute(neighbor, 'name') || 'Unnamed';
        }
      });
    }
    return result;
  }
  return {};
};

const runAnalysis = () => {
  if (!store.isLoaded) return;
  
  // 1. Execute the business logic for the active case
  const ctx = {
    gActive: graphData.gActive(),
    gFull: graphData.gFull,
    settings: store.settings
  };
  
  const result = activeCase.value.execute(ctx, store.caseParams);
  
  // 2. Handle errors or warnings from the case logic
  if (result.error) {
    store.uiMessage = { text: result.message, type: 'error' };
    return;
  }
  
  store.uiMessage = { text: result.message || 'Diagram generated!', type: result.warning ? 'warning' : 'success' };
  
  // 3. Save raw data to the store for the active renderer to use
  store.renderPayload = {
    nodes: result.nodes,
    edges: result.edges,
    highlightedNodes: result.highlightedNodes || new Set(), // <--- Добавить это
    renderSubgraphs: result.renderSubgraphs || false,
    customLabels: result.customLabels || {}
  };
  
  // 4. Save to store (GraphCanvas will detect this change and draw it)
  store.mermaidCode = mermaidCode;
  store.nodesData = nodesData;
};

const clearDiagram = () => {
  store.renderPayload = { nodes: new Set(), edges: [], renderSubgraphs: false, customLabels: {} };
  store.uiMessage = { text: 'Diagram memory cleared.', type: 'warning' };
};

const exportJson = () => {
  if (!store.renderPayload || store.renderPayload.nodes.size === 0) {
      alert("Generate a diagram first!");
      return;
  }
  
  // Gathering data about nodes and edges
  const gActive = graphData.gActive();
  const exportData = {
      nodes: Array.from(store.renderPayload.nodes).map(id => ({
          id,
          name: store.renderPayload.customLabels[id] || gActive.getNodeAttribute(id, 'name') || 'Unknown',
          type: gActive.getNodeAttribute(id, 'type') || '',
          doc: gActive.getNodeAttribute(id, 'doc') || ''
      })),
      edges: store.renderPayload.edges.map(e => ({
          source: e.u,
          target: e.v,
          type: e.data.type || '',
          subclass: e.data.subclass || '',
          access: e.data.access || ''
      }))
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 4));
  const a = document.createElement("a");
  a.href = dataStr;
  a.download = "ISO15288_Analysis.json";
  a.click();
};
</script>

<template>
  <div class="sidebar-content">
    
    <!-- 0. Model Source -->
    <div class="section model-section">
      <div class="model-header">
        <label class="section-title">Model Source:</label>
        <span class="status-badge" :class="{ active: store.isLoaded, loading: store.isLoading }">
          {{ store.isLoading ? 'Loading...' : (store.isLoaded ? 'Active' : 'Not Loaded') }}
        </span>
      </div>
      <div class="model-info">
        <span class="model-file-name" :title="store.modelName">📄 {{ store.modelName || 'No model loaded' }}</span>
      </div>
      <div class="model-buttons">
        <input 
          type="file" 
          ref="customFileInput" 
          accept=".xml" 
          @change="handleCustomFileUpload" 
          style="display: none" 
        />
        <button class="model-upload-btn" @click="customFileInput.click()" :disabled="store.isLoading">
          📂 Load Custom XML
        </button>
        <button 
          v-if="store.modelName !== 'ISO 15288 Converted Model.xml'" 
          class="model-reset-btn" 
          @click="resetToDefault" 
          :disabled="store.isLoading"
          title="Reset to default model"
        >
          🔄 Default
        </button>
      </div>
    </div>

    <hr class="divider" />

    <!-- 1. Case Selection -->
    <div class="section">
      <label class="section-title">Select analysis scenario:</label>
      <select v-model="store.activeCaseId" class="case-select">
        <option v-for="c in casesList" :key="c.id" :value="c.id">
          {{ c.name }}
        </option>
      </select>
      <p class="description-text">{{ activeCase?.description }}</p>
    </div>

    <hr class="divider" />

<!-- 2. Global Settings -->
    <div class="section">
      <label class="section-title">Global Settings:</label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="store.settings.useHierarchy" />
        Include derived connections (Hierarchy)
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="store.settings.connectBorderObjects" />
        Show relations between boundary objects
      </label>

      <label class="section-title" style="margin-top: 10px;">Meta-Level Inheritance:</label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="store.settings.includeEnables" />
        Inherit Enables
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="store.settings.includeControls" />
        Inherit Controls
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="store.settings.includeSituational" />
        Inherit Situational Input/Output
      </label>
    </div>

    <hr class="divider" />

    <!-- 3. Dynamic Case Parameters -->
    <div class="section" v-if="activeCase">
      <label class="section-title">Case Parameters:</label>
      
      <!-- Dynamically render inputs based on the case schema -->
      <div v-for="input in activeCase.inputs" :key="input.key" class="dynamic-input">
        <label v-if="input.type !== 'checkbox'">{{ input.label }}</label>
        
        <!-- New Searchable Multi-Select -->
        <SearchableSelect 
          v-if="input.type === 'multiselect'" 
          v-model="store.caseParams[input.key]" 
          :options="getGroupedOptions(input.optionsSource)"
          :multiple="true"
          placeholder="Select multiple items..."
        />

        <!-- New Searchable Single-Select -->
        <SearchableSelect 
          v-if="input.type === 'select'" 
          v-model="store.caseParams[input.key]" 
          :options="getGroupedOptions(input.optionsSource)"
          :multiple="false"
          placeholder="Select an item..."
        />
        
        <!-- Checkbox -->
        <label v-if="input.type === 'checkbox'" class="checkbox-label" style="margin-top: 10px;">
          <input type="checkbox" v-model="store.caseParams[input.key]" />
          {{ input.label }}
        </label>
        
        <!-- Radio Buttons (For Case 5 depth selection) -->
        <div v-if="input.type === 'radio'" class="radio-group">
          <label v-for="opt in input.options" :key="opt.value" class="radio-label">
            <input 
              type="radio" 
              :name="input.key" 
              :value="opt.value" 
              v-model="store.caseParams[input.key]" 
            />
            {{ opt.label }}
          </label>
        </div>

      </div>
      
      <!-- Engine Selector -->
      <div class="engine-selector">
        <label class="section-title">Visualisation Engine:</label>
        <div class="radio-group">
          <label class="radio-label"><input type="radio" value="mermaid" v-model="store.activeEngine" /> Mermaid.js</label>
          <label class="radio-label"><input type="radio" value="visjs" v-model="store.activeEngine" /> Vis.js (2D Physics)</label>
          <label class="radio-label"><input type="radio" value="3d" v-model="store.activeEngine" /> 3D Force Graph</label>
        </div>
      </div>

      <button class="action-btn" :disabled="!store.isLoaded" @click="runAnalysis">
        {{ store.isLoaded ? 'Generate Diagram' : 'Please Load XML First' }}
      </button>
      
      <!-- New Data Action Buttons -->
      <div class="data-actions" v-if="store.renderPayload.nodes.size > 0">
        <button class="export-json-btn" @click="exportJson">💾 Export Data (JSON)</button>
        <button class="clear-btn" @click="clearDiagram">🗑️ Clear Diagram</button>
      </div>
      
      <!-- Status Message -->
      <div v-if="store.uiMessage.text" :class="['status-msg', store.uiMessage.type]">
        {{ store.uiMessage.text }}
      </div>
    </div>

  </div>
</template>

<style scoped>
.sidebar-content { padding: 20px; overflow-y: auto; flex-grow: 1; }
.section { display: flex; flex-direction: column; gap: 12px; }
.section-title { font-weight: 600; font-size: 0.9rem; color: #555; }
.description-text { font-size: 0.8rem; color: #666; margin: 0; font-style: italic; }
.case-select { padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 13px; width: 100%; }
.multiselect { height: 150px; }
.checkbox-label { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; cursor: pointer; }
.checkbox-label input { margin-top: 3px; }
.divider { border: 0; border-top: 1px solid #eee; margin: 20px 0; }
.dynamic-input { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.dynamic-input small { color: #888; font-size: 11px; }

.action-btn { background: #4CAF50; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 10px; transition: background 0.2s; }
.action-btn:hover:not(:disabled) { background: #45a049; }
.action-btn:disabled { background: #cccccc; cursor: not-allowed; }

.status-msg { padding: 10px; border-radius: 4px; font-size: 13px; margin-top: 10px; font-weight: 500; }
.status-msg.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
.status-msg.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
.status-msg.warning { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }

.radio-group { display: flex; gap: 15px; margin-top: 5px; }
.radio-label { display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 13px; }

.data-actions { display: flex; gap: 10px; margin-top: 5px; }
.export-json-btn { flex: 1; background: #e0e0e0; border: 1px solid #ccc; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; transition: 0.2s; }
.export-json-btn:hover { background: #d0d0d0; }
.clear-btn { flex: 1; background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; transition: 0.2s; }
.clear-btn:hover { background: #ffcdd2; }

/* Model Section Styles */
.model-section { background: #fdfdfd; padding: 10px; border-radius: 6px; border: 1px solid #e9ecef; }
.model-header { display: flex; justify-content: space-between; align-items: center; }
.status-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: #e0e0e0; color: #555; }
.status-badge.active { background: #d4edda; color: #155724; }
.status-badge.loading { background: #fff3cd; color: #856404; }
.model-info { font-size: 12px; color: #495057; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 2px 0; }
.model-file-name { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.model-buttons { display: flex; gap: 8px; margin-top: 4px; }
.model-upload-btn { flex: 1; background: #007bff; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.model-upload-btn:hover:not(:disabled) { background: #0056b3; }
.model-upload-btn:disabled { background: #cccccc; cursor: not-allowed; }
.model-reset-btn { background: #6c757d; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.model-reset-btn:hover:not(:disabled) { background: #545b62; }
.model-reset-btn:disabled { background: #cccccc; cursor: not-allowed; }
</style>