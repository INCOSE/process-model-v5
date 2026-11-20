<script setup>
import { ref, computed, watch } from 'vue';
import {
  store,
  graphData,
  applyModelXml,
  loadDefaultModel,
  getCaseDefaults,
  executeActiveCase
} from '../store/graphStore.js';
import { CaseRegistry, groupedCases } from '../cases/caseRegistry.js';
import { iso15288Mapping } from '../core/iso15288Groups.js';
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

const getGroupedOptions = (sourceKey) => {
  const rawData = getDynamicOptions(sourceKey);
  if (!rawData) return [];

  return Object.entries(rawData).map(([id, name]) => {
    let group = 'Others';
    if (sourceKey === 'allNodes') {
      group = store.processes[id] ? (iso15288Mapping[name] || 'Others') : 'Business Objects';
    } else if (sourceKey === 'processes' || sourceKey === 'dynamic_inputs' || sourceKey === 'dynamic_outputs') {
      group = iso15288Mapping[name] || 'Others';
      if ((sourceKey === 'dynamic_inputs' || sourceKey === 'dynamic_outputs') && !store.processes[id]) {
        group = 'Business Objects';
      }
    } else if (sourceKey === 'businessObjects') {
      group = 'Business Objects';
    }
    return { id, name, group };
  });
};

const activeCase = computed(() => CaseRegistry[store.activeCaseId]);

// Only reset parameters when the user explicitly switches scenario in the dropdown
const handleCaseChange = () => {
  store.caseParams = getCaseDefaults(store.activeCaseId);
  store.uiMessage = { text: '', type: '' };
};

watch(() => store.caseParams.pCenter, (newVal, oldVal) => {
  if (oldVal !== undefined && newVal !== oldVal && store.activeCaseId === 'case_7') {
    store.caseParams.selectedInputs = [];
    store.caseParams.selectedOutputs = [];
  }
});

const getDynamicOptions = (sourceKey) => {
  if (sourceKey === 'processes') return store.processes;
  if (sourceKey === 'businessObjects') return store.businessObjects;
  if (sourceKey === 'allNodes') return { ...store.processes, ...store.businessObjects };

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
  executeActiveCase(true);
};

const clearDiagram = () => {
  store.renderPayload = {
    nodes: new Set(),
    edges: [],
    highlightedNodes: new Set(),
    renderSubgraphs: false,
    customLabels: {},
    orderedPath: null,
    analysisSummary: null
  };
  store.uiMessage = { text: 'Diagram memory cleared.', type: 'warning' };
};

const exportJson = () => {
  if (!store.renderPayload || store.renderPayload.nodes.size === 0) {
    alert("Generate a diagram first!");
    return;
  }

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
    })),
    analysisSummary: store.renderPayload.analysisSummary || undefined
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

    <!-- 1. Model Source -->
    <div class="section model-section">
      <div class="model-header">
        <label class="section-title">Model Source</label>
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

    <!-- 2. Global Model Settings (Always visible — applies to Graphs, N2 Matrix, Checklist & Hotspots) -->
    <div class="section global-settings-box">
      <div class="section-header-row">
        <label class="section-title">Global Model Settings</label>
        <span class="scope-hint" title="Applies across Scenario Graphs, N2 Matrix, Checklist, and Hotspots">All views</span>
      </div>

      <label class="checkbox-label">
        <input type="checkbox" v-model="store.settings.useHierarchy" />
        Include derived connections (Hierarchy)
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="store.settings.connectBorderObjects" />
        Show relations between boundary objects
      </label>

      <label class="sub-title">Meta-Level Inheritance</label>
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

    <!-- 3. Scenario Graph Builder -->
    <div class="section">
      <div class="section-header-row">
        <label class="section-title">Scenario Graph Builder</label>
        <span class="scope-hint">Graph tab</span>
      </div>

      <select v-model="store.activeCaseId" @change="handleCaseChange" class="case-select">
        <optgroup v-for="group in groupedCases" :key="group.label" :label="group.label">
          <option v-for="c in group.items" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </optgroup>
      </select>
      <p class="description-text">{{ activeCase?.description }}</p>

      <!-- Dynamic Case Parameters -->
      <div v-if="activeCase" class="params-block">
        <div v-for="input in activeCase.inputs" :key="input.key" class="dynamic-input">
          <label v-if="input.type !== 'checkbox'">{{ input.label }}</label>

          <SearchableSelect
            v-if="input.type === 'multiselect'"
            v-model="store.caseParams[input.key]"
            :options="getGroupedOptions(input.optionsSource)"
            :multiple="true"
            placeholder="Select multiple items..."
          />

          <SearchableSelect
            v-if="input.type === 'select'"
            v-model="store.caseParams[input.key]"
            :options="getGroupedOptions(input.optionsSource)"
            :multiple="false"
            placeholder="Select an item..."
          />

          <label v-if="input.type === 'checkbox'" class="checkbox-label" style="margin-top: 6px;">
            <input type="checkbox" v-model="store.caseParams[input.key]" />
            {{ input.label }}
          </label>

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

        <!-- Graph Engine Selector (Only graph renderers) -->
        <div class="engine-selector">
          <label class="sub-title">Graph Renderer</label>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" value="mermaid" v-model="store.activeEngine" /> Mermaid.js</label>
            <label class="radio-label"><input type="radio" value="visjs" v-model="store.activeEngine" /> Vis.js (2D)</label>
            <label class="radio-label"><input type="radio" value="3d" v-model="store.activeEngine" /> 3D Force</label>
          </div>
        </div>

        <button class="action-btn" :disabled="!store.isLoaded" @click="runAnalysis">
          {{ store.isLoaded ? 'Generate Diagram' : 'Please Load XML First' }}
        </button>

        <div class="data-actions" v-if="store.renderPayload.nodes.size > 0">
          <button class="export-json-btn" @click="exportJson">💾 Export JSON</button>
          <button class="clear-btn" @click="clearDiagram">🗑️ Clear</button>
        </div>

        <div v-if="store.uiMessage.text" :class="['status-msg', store.uiMessage.type]">
          {{ store.uiMessage.text }}
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.sidebar-content {
  padding: 16px 18px 40px 18px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1 1 0;
  min-height: 0;
}
.section { display: flex; flex-direction: column; gap: 10px; }
.section-header-row { display: flex; justify-content: space-between; align-items: center; }
.section-title { font-weight: 700; font-size: 0.88rem; color: #334155; }
.sub-title { font-weight: 600; font-size: 0.8rem; color: #64748b; margin-top: 6px; display: block; }
.scope-hint {
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;
  padding: 2px 7px; border-radius: 10px; background: #eef2f6; color: #64748b;
}

.global-settings-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px;
}

.params-block { display: flex; flex-direction: column; gap: 10px; margin-top: 2px; }
.description-text { font-size: 0.78rem; color: #64748b; margin: 0; font-style: italic; line-height: 1.4; }
.case-select { padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 13px; width: 100%; background: #ffffff; }
.checkbox-label { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; cursor: pointer; color: #1e293b; }
.checkbox-label input { margin-top: 3px; }
.divider { border: 0; border-top: 1px solid #eee; margin: 16px 0; }
.dynamic-input { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }

.action-btn { background: #4CAF50; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 6px; transition: background 0.2s; }
.action-btn:hover:not(:disabled) { background: #45a049; }
.action-btn:disabled { background: #cccccc; cursor: not-allowed; }

.status-msg { padding: 10px; border-radius: 4px; font-size: 12.5px; margin-top: 4px; font-weight: 500; }
.status-msg.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
.status-msg.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
.status-msg.warning { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }

.radio-group { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-top: 5px; }
.radio-label { display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 13px; }

.data-actions { display: flex; gap: 8px; }
.export-json-btn { flex: 1; background: #e2e8f0; border: 1px solid #cbd5e1; padding: 7px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; transition: 0.2s; }
.export-json-btn:hover { background: #cbd5e1; }
.clear-btn { flex: 1; background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; padding: 7px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; transition: 0.2s; }
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
