import { reactive, watch } from 'vue';
import { loadAndParseXML } from '../core/xmlParser.js';
import { CaseRegistry } from '../cases/caseRegistry.js';
import {
  HANDBOOK_GROUP_ORDER,
  TECHNICAL_FIRST_GROUP_ORDER,
  DEFAULT_RING_ORDER
} from '../core/iso15288Groups.js';

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

  // Global UI layout state (persisted in Share Link)
  isSidebarCollapsed: false,

  // Shared group order & visibility for N2 Matrix and 3D Process Group planes (top -> bottom)
  groupOrder: [...HANDBOOK_GROUP_ORDER],
  activeGroups: [...HANDBOOK_GROUP_ORDER],
  useHandbookOrder: true,

  // Top-level projection / workspace view:
  // Visual projections: 'graph' (2D Diagram) | 'space3d' (3D Space) | 'n2' (N2 Matrix)
  // Reference views:    'checklist' | 'hotspots' | 'dictionary'
  // Guided tours:       'tours'
  activeView: 'graph',

  // 2D diagram renderer (used inside 'graph' view): 'mermaid' | 'visjs'
  activeEngine: 'mermaid',

  // 2D Vis.js display preferences
  visOptions: {
    scope: 'slice',                          // 'slice' | 'context' | 'full'
    useRings: false,                         // Concentric Process Group circles (Onion layout)
    ringOrder: [...DEFAULT_RING_ORDER],      // Inner -> Outer ring order (Tailoring excluded)
    activeRingGroups: [...DEFAULT_RING_ORDER]
  },

  // Unified 3D Space display preferences
  threeOptions: {
    scope: 'full',       // 'slice' | 'context' | 'full'
    showLabels: false,
    isLayered: true
  },

  // N2 Matrix display preferences
  n2Options: {
    scope: 'full',           // 'full' | 'diagram'
    useVirtualBuses: false
  },

  // Guided Tours playback & display preferences
  tourOptions: {
    tourId: 'vv_loops',
    engine: '3d',        // '3d' | 'visjs' | 'mermaid'
    showCaptions: true,
    showLabels3D: true,
    currentTime: 0
  },

  // Selected process in Process Checklist view
  selectedChecklistProcessId: '',

  // Scenario / Slice Builder state
  activeCaseId: 'case_1',
  caseParams: {},
  uiMessage: { text: '', type: '' },

  // Universal Graph Data payload for active slice
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
 * Reorders a group inside the shared top-to-bottom groupOrder (N2 & 3D planes).
 */
export function reorderGlobalGroup(srcGroup, targetGroup) {
  const list = [...store.groupOrder];
  const fromIdx = list.indexOf(srcGroup);
  const toIdx = list.indexOf(targetGroup);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

  list.splice(fromIdx, 1);
  list.splice(toIdx, 0, srcGroup);
  store.groupOrder = list;
  store.useHandbookOrder = list.every((g, i) => g === HANDBOOK_GROUP_ORDER[i]);
}

/**
 * Toggles between Handbook order and Technical-first order for N2 & 3D planes.
 */
export function setHandbookOrder(enabled) {
  store.useHandbookOrder = enabled;
  store.groupOrder = enabled ? [...HANDBOOK_GROUP_ORDER] : [...TECHNICAL_FIRST_GROUP_ORDER];
}

/**
 * Reorders a group inside the 2D Vis.js concentric rings (inner -> outer).
 */
export function reorderVisRingGroup(srcGroup, targetGroup) {
  const list = [...store.visOptions.ringOrder];
  const fromIdx = list.indexOf(srcGroup);
  const toIdx = list.indexOf(targetGroup);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

  list.splice(fromIdx, 1);
  list.splice(toIdx, 0, srcGroup);
  store.visOptions.ringOrder = list;
}

export function resetVisRingOrder() {
  store.visOptions.ringOrder = [...DEFAULT_RING_ORDER];
}

/**
 * Toggles visibility of a group in the shared N2 / 3D activeGroups list.
 */
export function toggleGlobalGroupVisibility(g, presentGroupsList) {
  const next = new Set(store.activeGroups);
  if (next.has(g)) {
    const currentlyVisible = presentGroupsList.filter((x) => next.has(x));
    if (currentlyVisible.length > 1) next.delete(g);
  } else {
    next.add(g);
  }
  store.activeGroups = Array.from(next);
}

/**
 * Toggles visibility of a ring group in 2D Vis.js concentric rings.
 */
export function toggleVisRingGroupVisibility(g, presentRingList) {
  const next = new Set(store.visOptions.activeRingGroups);
  if (next.has(g)) {
    const currentlyVisible = presentRingList.filter((x) => next.has(x));
    if (currentlyVisible.length > 1) next.delete(g);
  } else {
    next.add(g);
  }
  store.visOptions.activeRingGroups = Array.from(next);
}

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
export function executeActiveCase(autoSwitchView = true) {
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
    text: result.message || 'Slice generated!',
    type: result.warning ? 'warning' : 'success'
  };

  store.renderPayload = {
    nodes: result.nodes,
    edges: result.edges,
    highlightedNodes: result.highlightedNodes || new Set(),
    renderSubgraphs: result.renderSubgraphs || false,
    customLabels: result.customLabels || {},
    orderedPath: result.orderedPath || null,
    analysisSummary: result.analysisSummary || null
  };

  if (autoSwitchView) {
    if (store.activeView === 'space3d') {
      if (store.threeOptions.scope === 'full') {
        store.threeOptions.scope = 'context';
      }
    } else if (store.activeView === 'graph' && store.activeEngine === 'visjs') {
      if (store.visOptions.scope === 'full') {
        store.visOptions.scope = 'context';
      }
    } else if (!['graph', 'n2'].includes(store.activeView)) {
      store.activeView = 'graph';
    }
  }

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
