import { reactive } from 'vue';

export const store = reactive({
  isLoaded: false,
  rawXml: null, // Добавили хранение сырого текста XML
  processes: {},
  businessObjects: {},
  
  settings: {
    useHierarchy: true,
    connectBorderObjects: true,
    includeEnables: false,      // Заменили одну галочку на три
    includeControls: false,
    includeSituational: false
  },

  // UI state
  activeCaseId: 'case_1',
  caseParams: {}, 
  uiMessage: { text: '', type: '' },
  
  // New: Visualization Engine Selection
  activeEngine: 'mermaid', // Options: 'mermaid', 'visjs', '3d'
  
  // New: Universal Graph Data payload for any renderer
  renderPayload: {
    nodes: new Set(),
    edges: [],
    renderSubgraphs: false,
    customLabels: {}
  }
});

export const graphData = {
  gFull: null,
  gDirect: null,
  gActive: () => store.settings.useHierarchy ? graphData.gFull : graphData.gDirect
};