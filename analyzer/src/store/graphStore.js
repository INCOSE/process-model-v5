import { reactive, watch } from 'vue';
import { loadAndParseXML } from '../core/xmlParser.js';

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

  // UI state
  activeCaseId: 'case_1',
  caseParams: {}, 
  uiMessage: { text: '', type: '' },
  
  // Visualization Engine Selection: 'mermaid', 'visjs', '3d'
  activeEngine: 'mermaid',
  
  // Universal Graph Data payload for renderers
  renderPayload: {
    nodes: new Set(),
    edges: [],
    highlightedNodes: new Set(), // <--- Добавить это
    renderSubgraphs: false,
    customLabels: {}
  }
});

export const graphData = {
  gFull: null,
  gDirect: null,
  gActive: () => store.settings.useHierarchy ? graphData.gFull : graphData.gDirect
};

/**
 * Parses raw XML string and initializes the graph structures.
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
