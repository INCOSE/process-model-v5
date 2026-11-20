import { reactive, watch } from 'vue';
import { loadAndParseXML } from '../core/xmlParser.js';
import { CaseRegistry } from '../cases/caseRegistry.js';

export const store = reactive({
  isLoaded: false,
  isLoading: false,
  loadError: null,
  modelName: 'ISO 15288 Converted Model.xml',
  rawXml: null,
  processes: {},
  businessObjects: {},

  settings: {
    useHierarchy: true,
    connectBorderObjects: true,
    includeEnables: false,
    includeControls: false,
    includeSituational: false
  },

  // Top-level workspace view: 'graph' | 'n2' | 'checklist' | 'hotspots' | 'dictionary'
  activeView: 'graph',

  // Graph rendering engine (used in 'graph' view): 'mermaid' | 'visjs' | '3d'
  activeEngine: 'mermaid',

  // 3D display preferences (shared for deep linking)
  threeOptions: {
    showLabels: true,
    isLayered: false
  },

  // Selected process in Process Checklist view
  selectedChecklistProcessId: '',

  // Scenario Builder state
  activeCaseId: 'case_1',
  caseParams: {},
  uiMessage: { text: '', type: '' },

  // Universal Graph Data payload for graph renderers
  renderPayload: {
    nodes: new Set(),
    edges: [],
    highlightedNodes: new Set(),
    renderSubgraphs: false,
    customLabels: {},
    orderedPath: null,
    analysisSummary: null
  }
});

export const graphData = {
  gFull: null,
  gDirect: null,
  gActive: () => store.settings.useHierarchy ? graphData.gFull : graphData.gDirect
};

/**
 * Populates default values for a case's input schema.
 */
export function getCaseDefaults(caseId) {
  const c = CaseRegistry[caseId];
  const defaults = {};
  if (c?.inputs) {
    c.inputs.forEach((inp) => {
      if (inp.default !== undefined) defaults[inp.key] = inp.default;
    });
  }
  return defaults;
}

/**
 * Executes the currently selected case and updates renderPayload.
 */
export function executeActiveCase(switchToGraphView = true) {
  if (!store.isLoaded) return false;
  const activeCase = CaseRegistry[store.activeCaseId];
  if (!activeCase) return false;

  const ctx = {
    gActive: graphData.gActive(),
    gFull: graphData.gFull,
    settings: store.settings
  };

  const result = activeCase.execute(ctx, store.caseParams);

  if (result.error) {
    store.uiMessage = { text: result.message, type: 'error' };
    return false;
  }

  store.uiMessage = {
    text: result.message || 'Diagram generated!',
    type: result.warning ? 'warning' : 'success'
  };

  if (switchToGraphView) {
    store.activeView = 'graph';
  }

  store.renderPayload = {
    nodes: result.nodes,
    edges: result.edges,
    highlightedNodes: result.highlightedNodes || new Set(),
    renderSubgraphs: result.renderSubgraphs || false,
    customLabels: result.customLabels || {},
    orderedPath: result.orderedPath || null,
    analysisSummary: result.analysisSummary || null
  };
  return true;
}

/**
 * Parses raw XML string and initialises the graph structures.
 */
export function applyModelXml(xmlString, modelName = 'ISO 15288 Converted Model.xml') {
  store.isLoading = true;
  store.loadError = null;
  try {
    const { gFull, gDirect, processes, businessObjects } = loadAndParseXML(
      xmlString,
      store.settings.includeEnables,
      store.settings.includeControls,
      store.settings.includeSituational
    );
    graphData.gFull = gFull;
    graphData.gDirect = gDirect;
    store.processes = processes;
    store.businessObjects = businessObjects;
    store.rawXml = xmlString;
    store.modelName = modelName;
    store.isLoaded = true;
  } catch (err) {
    store.loadError = err.message;
    throw err;
  } finally {
    store.isLoading = false;
  }
}

/**
 * Re-parses the current raw XML when inheritance settings change.
 */
export function reparseCurrentModel() {
  if (!store.rawXml) return;
  try {
    const { gFull, gDirect, processes, businessObjects } = loadAndParseXML(
      store.rawXml,
      store.settings.includeEnables,
      store.settings.includeControls,
      store.settings.includeSituational
    );
    graphData.gFull = gFull;
    graphData.gDirect = gDirect;
    store.processes = processes;
    store.businessObjects = businessObjects;
  } catch (err) {
    console.error('Error re-parsing model with updated settings:', err);
  }
}

// Automatically re-parse when meta-level inheritance settings change
watch(
  () => [store.settings.includeEnables, store.settings.includeControls, store.settings.includeSituational],
  () => {
    reparseCurrentModel();
  }
);

/**
 * Automatically loads the default ISO 15288 XML model via fetch.
 */
export async function loadDefaultModel() {
  store.isLoading = true;
  store.loadError = null;
  const fileName = 'ISO 15288 Converted Model.xml';
  const primaryUrl = `${import.meta.env.BASE_URL}${fileName}`;
  const fallbackUrl = `./${fileName}`;

  try {
    let response = await fetch(primaryUrl);
    if (!response.ok && primaryUrl !== fallbackUrl) {
      response = await fetch(fallbackUrl);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const xmlText = await response.text();
    applyModelXml(xmlText, fileName);
    store.uiMessage = { text: 'Default model ISO 15288 loaded successfully.', type: 'success' };
  } catch (err) {
    console.error('Failed to auto-load default XML model:', err);
    store.loadError = `Failed to load default XML model: ${err.message}`;
    store.isLoaded = false;
  } finally {
    store.isLoading = false;
  }
}
