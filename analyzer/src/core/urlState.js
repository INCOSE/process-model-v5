/**
 * Encodes and decodes application workspace, global settings, and scenario parameters
 * into shareable URL query parameters.
 */

const VALID_VIEWS = new Set(['graph', 'space3d', 'n2', 'checklist', 'hotspots', 'dictionary']);
const VALID_2D_ENGINES = new Set(['mermaid', 'visjs']);
const VALID_SCOPES = new Set(['slice', 'context', 'full']);

function encodeParams(obj) {
  try {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function decodeParams(str) {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
    const binary = atob(base64 + pad);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Builds a shareable URL capturing the current view, global model settings,
 * and (when applicable) the active scenario + parameters or checklist process.
 */
export function buildShareUrl(store) {
  const url = new URL(window.location.href);
  const q = new URLSearchParams();

  q.set('view', store.activeView || 'graph');

  // Compact 5-bit flag string for global settings: [hierarchy, border, enables, controls, situational]
  const s = store.settings;
  const flags = [
    s.useHierarchy ? '1' : '0',
    s.connectBorderObjects ? '1' : '0',
    s.includeEnables ? '1' : '0',
    s.includeControls ? '1' : '0',
    s.includeSituational ? '1' : '0'
  ].join('');
  if (flags !== '11000') {
    q.set('s', flags);
  }

  if (store.activeView === 'checklist' && store.selectedChecklistProcessId) {
    q.set('proc', store.selectedChecklistProcessId);
  }

  if (store.activeView === 'graph') {
    q.set('engine', store.activeEngine || 'mermaid');
    if (store.activeEngine === 'visjs') {
      q.set('scope2d', store.visOptions.scope || 'slice');
      q.set('rings', store.visOptions.useRings ? '1' : '0');
    }
  }

  if (store.activeView === 'space3d') {
    q.set('scope3d', store.threeOptions.scope || 'full');
    q.set('layers', store.threeOptions.isLayered ? '1' : '0');
    q.set('labels', store.threeOptions.showLabels ? '1' : '0');
  }

  const hasSlice = store.renderPayload && store.renderPayload.nodes.size > 0;
  if (hasSlice && ['graph', 'space3d', 'n2'].includes(store.activeView)) {
    if (store.activeCaseId) q.set('case', store.activeCaseId);
    if (store.caseParams && Object.keys(store.caseParams).length > 0) {
      const encoded = encodeParams(store.caseParams);
      if (encoded) q.set('p', encoded);
    }
    q.set('run', '1');
  }

  url.search = q.toString();
  return url.toString();
}

/**
 * Parses URL query parameters on startup. Returns null if no share parameters exist.
 */
export function parseUrlState() {
  const q = new URLSearchParams(window.location.search);
  if (Array.from(q.keys()).length === 0) return null;

  const state = {};

  let view = q.get('view');
  const engine = q.get('engine');

  // Backwards compatibility with earlier URL formats
  if (view === 'model3d') {
    view = 'space3d';
    state.scope3d = 'full';
  } else if (view === 'graph' && engine === '3d') {
    view = 'space3d';
    state.scope3d = 'slice';
  }

  if (view && VALID_VIEWS.has(view)) state.activeView = view;
  if (engine && VALID_2D_ENGINES.has(engine)) state.activeEngine = engine;

  const scope2d = q.get('scope2d');
  if (scope2d && VALID_SCOPES.has(scope2d)) state.scope2d = scope2d;

  const rings = q.get('rings');
  if (rings === '1') state.use2DRings = true;
  else if (rings === '0') state.use2DRings = false;

  const scope3d = q.get('scope3d');
  if (scope3d && VALID_SCOPES.has(scope3d)) state.scope3d = scope3d;

  const flags = q.get('s');
  if (flags && flags.length === 5) {
    state.settings = {
      useHierarchy: flags[0] === '1',
      connectBorderObjects: flags[1] === '1',
      includeEnables: flags[2] === '1',
      includeControls: flags[3] === '1',
      includeSituational: flags[4] === '1'
    };
  }

  const proc = q.get('proc');
  if (proc) state.selectedChecklistProcessId = proc;

  const caseId = q.get('case');
  if (caseId) state.activeCaseId = caseId;

  const encodedParams = q.get('p');
  if (encodedParams) state.caseParams = decodeParams(encodedParams);

  const layers = q.get('layers');
  if (layers === '1') state.is3DLayered = true;
  else if (layers === '0') state.is3DLayered = false;

  const labels = q.get('labels');
  if (labels === '1') state.show3DLabels = true;
  else if (labels === '0') state.show3DLabels = false;

  if (q.get('run') === '1') state.autoRun = true;

  return state;
}
