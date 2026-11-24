/**
 * Encodes and decodes application workspace, global settings, view-specific options
 * (2D/3D/N2/Tours), group ordering/filtering, sidebar state, and scenario parameters
 * into compact shareable URL query parameters.
 */

import { HANDBOOK_GROUP_ORDER, DEFAULT_RING_ORDER } from './iso15288Groups.js';

const VALID_VIEWS = new Set(['graph', 'space3d', 'n2', 'checklist', 'hotspots', 'dictionary', 'tours']);
const VALID_2D_ENGINES = new Set(['mermaid', 'visjs']);
const VALID_TOUR_ENGINES = new Set(['3d', 'visjs', 'mermaid']);
const VALID_SCOPES = new Set(['slice', 'context', 'full']);
const VALID_N2_SCOPES = new Set(['full', 'diagram']);

const GROUP_TO_CODE = {
  'External': 'EXT',
  'Agreement': 'AGMT',
  'Organizational Project-Enabling': 'ORG',
  'Technical Management': 'TM',
  'Technical': 'TECH',
  'Tailoring': 'TLR',
  'Others': 'OTH'
};

const CODE_TO_GROUP = Object.fromEntries(
  Object.entries(GROUP_TO_CODE).map(([k, v]) => [v, k])
);

function encodeGroupList(groups) {
  return groups.map((g) => GROUP_TO_CODE[g]).filter(Boolean).join(',');
}

function decodeGroupList(str, fallbackAllowed) {
  if (!str) return null;
  const allowed = new Set(fallbackAllowed);
  const parsed = str
    .split(',')
    .map((c) => CODE_TO_GROUP[c.trim().toUpperCase()])
    .filter((g) => g && allowed.has(g));
  return parsed.length > 0 ? Array.from(new Set(parsed)) : null;
}

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
 * Builds a compact shareable URL capturing the current view, sidebar state,
 * global model settings, view-specific options, and active slice.
 */
export function buildShareUrl(store) {
  const url = new URL(window.location.href);
  const q = new URLSearchParams();

  const view = store.activeView || 'graph';
  q.set('view', view);

  // Sidebar collapsed state (omit when open, which is the default)
  if (store.isSidebarCollapsed) {
    q.set('sb', '0');
  }

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

  // --- View-specific parameters ---
  if (view === 'checklist' && store.selectedChecklistProcessId) {
    q.set('proc', store.selectedChecklistProcessId);
  }

  if (view === 'tours') {
    const t = store.tourOptions;
    if (t.tourId) q.set('tour', t.tourId);
    if (t.engine) q.set('teng', t.engine);
    if (!t.showCaptions) q.set('cc', '0');
    if (t.engine === '3d' && !t.showLabels3D) q.set('tlabels', '0');
    const sec = Math.floor(t.currentTime || 0);
    if (sec > 0) q.set('t', String(sec));
  }

  if (view === 'n2') {
    if (store.n2Options.scope === 'diagram') q.set('n2scope', 'diagram');
    if (store.n2Options.useVirtualBuses) q.set('buses', '1');
    if (!store.useHandbookOrder) {
      q.set('ord', encodeGroupList(store.groupOrder));
    }
    const hidden = HANDBOOK_GROUP_ORDER.filter((g) => !store.activeGroups.includes(g));
    if (hidden.length > 0) {
      q.set('hide', encodeGroupList(hidden));
    }
  }

  if (view === 'space3d') {
    q.set('scope3d', store.threeOptions.scope || 'full');
    q.set('layers', store.threeOptions.isLayered ? '1' : '0');
    q.set('labels', store.threeOptions.showLabels ? '1' : '0');
    if (store.threeOptions.isLayered) {
      if (!store.useHandbookOrder) {
        q.set('ord', encodeGroupList(store.groupOrder));
      }
      const hidden = HANDBOOK_GROUP_ORDER.filter((g) => !store.activeGroups.includes(g));
      if (hidden.length > 0) {
        q.set('hide', encodeGroupList(hidden));
      }
    }
  }

  if (view === 'graph') {
    q.set('engine', store.activeEngine || 'mermaid');
    if (store.activeEngine === 'visjs') {
      q.set('scope2d', store.visOptions.scope || 'slice');
      q.set('rings', store.visOptions.useRings ? '1' : '0');
      if (store.visOptions.useRings) {
        const isDefaultRings = store.visOptions.ringOrder.every((g, i) => g === DEFAULT_RING_ORDER[i]);
        if (!isDefaultRings) {
          q.set('rord', encodeGroupList(store.visOptions.ringOrder));
        }
        const hiddenRings = DEFAULT_RING_ORDER.filter((g) => !store.visOptions.activeRingGroups.includes(g));
        if (hiddenRings.length > 0) {
          q.set('rhide', encodeGroupList(hiddenRings));
        }
      }
    }
  }

  // Persist active scenario slice when viewing a projection that uses it
  const hasSlice = store.renderPayload && store.renderPayload.nodes.size > 0;
  if (hasSlice && ['graph', 'space3d', 'n2'].includes(view)) {
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

  if (q.get('sb') === '0') state.isSidebarCollapsed = true;

  // Global settings
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

  // 2D Vis.js options
  const scope2d = q.get('scope2d');
  if (scope2d && VALID_SCOPES.has(scope2d)) state.scope2d = scope2d;

  const rings = q.get('rings');
  if (rings === '1') state.use2DRings = true;
  else if (rings === '0') state.use2DRings = false;

  const rord = decodeGroupList(q.get('rord'), DEFAULT_RING_ORDER);
  if (rord) {
    const missing = DEFAULT_RING_ORDER.filter((g) => !rord.includes(g));
    state.ringOrder = [...rord, ...missing];
  }

  const rhide = decodeGroupList(q.get('rhide'), DEFAULT_RING_ORDER);
  if (rhide) {
    const hiddenSet = new Set(rhide);
    const visible = DEFAULT_RING_ORDER.filter((g) => !hiddenSet.has(g));
    if (visible.length > 0) state.activeRingGroups = visible;
  }

  // 3D Space options
  const scope3d = q.get('scope3d');
  if (scope3d && VALID_SCOPES.has(scope3d)) state.scope3d = scope3d;

  const layers = q.get('layers');
  if (layers === '1') state.is3DLayered = true;
  else if (layers === '0') state.is3DLayered = false;

  const labels = q.get('labels');
  if (labels === '1') state.show3DLabels = true;
  else if (labels === '0') state.show3DLabels = false;

  // N2 & shared group order/visibility
  const n2scope = q.get('n2scope');
  if (n2scope && VALID_N2_SCOPES.has(n2scope)) state.n2Scope = n2scope;

  if (q.get('buses') === '1') state.useVirtualBuses = true;

  const ord = decodeGroupList(q.get('ord'), HANDBOOK_GROUP_ORDER);
  if (ord) {
    const missing = HANDBOOK_GROUP_ORDER.filter((g) => !ord.includes(g));
    state.groupOrder = [...ord, ...missing];
  }

  const hide = decodeGroupList(q.get('hide'), HANDBOOK_GROUP_ORDER);
  if (hide) {
    const hiddenSet = new Set(hide);
    const visible = HANDBOOK_GROUP_ORDER.filter((g) => !hiddenSet.has(g));
    if (visible.length > 0) state.activeGroups = visible;
  }

  // Guided Tours options
  const tourId = q.get('tour');
  if (tourId) state.tourId = tourId;

  const teng = q.get('teng');
  if (teng && VALID_TOUR_ENGINES.has(teng)) state.tourEngine = teng;

  if (q.get('cc') === '0') state.tourCaptions = false;
  if (q.get('tlabels') === '0') state.tourLabels3D = false;

  const tParam = q.get('t');
  if (tParam !== null) {
    const sec = Number(tParam);
    if (Number.isFinite(sec) && sec >= 0) state.tourTime = sec;
  }

  // Checklist & Scenario slice
  const proc = q.get('proc');
  if (proc) state.selectedChecklistProcessId = proc;

  const caseId = q.get('case');
  if (caseId) state.activeCaseId = caseId;

  const encodedParams = q.get('p');
  if (encodedParams) state.caseParams = decodeParams(encodedParams);

  if (q.get('run') === '1') state.autoRun = true;

  return state;
}
