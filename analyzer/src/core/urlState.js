/**
 * Encodes and decodes application workspace, global settings, and scenario parameters
 * into shareable URL query parameters.
 */

const VALID_VIEWS = new Set(['graph', 'model3d', 'n2', 'checklist', 'hotspots', 'dictionary']);
const VALID_ENGINES = new Set(['mermaid', 'visjs', '3d']);

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

  if (store.activeView === 'model3d') {
    if (store.threeOptions.isLayered) q.set('layers', '1');
    if (!store.threeOptions.showLabels) q.set('labels', '0');
  }

  if (store.activeView === 'graph') {
    q.set('engine', store.activeEngine || 'mermaid');
    if (store.activeEngine === '3d') {
      if (store.threeOptions.isLayered) q.set('layers', '1');
      if (!store.threeOptions.showLabels) q.set('labels', '0');
    }
    if (store.activeCaseId) {
      q.set('case', store.activeCaseId);
    }
    if (store.caseParams && Object.keys(store.caseParams).length > 0) {
      const encoded = encodeParams(store.caseParams);
      if (encoded) q.set('p', encoded);
    }
    if (store.renderPayload && store.renderPayload.nodes.size > 0) {
      q.set('run', '1');
    }
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

  const view = q.get('view');
  if (view && VALID_VIEWS.has(view)) state.activeView = view;

  const engine = q.get('engine');
  if (engine && VALID_ENGINES.has(engine)) state.activeEngine = engine;

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

  if (q.get('layers') === '1') state.is3DLayered = true;
  if (q.get('labels') === '0') state.show3DLabels = false;
  if (q.get('run') === '1') state.autoRun = true;

  return state;
}
