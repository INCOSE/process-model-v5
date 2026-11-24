<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import mermaid from 'mermaid';
import svgPanZoom from 'svg-pan-zoom';
import { Network } from 'vis-network';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';

import { store } from '../store/graphStore.js';
import { guidedToursList } from '../tours/vvLoopsTour.js';

const stageRef = ref(null);
const threeDiv = ref(null);
const visDiv = ref(null);
const mermaidDiv = ref(null);
const audioRef = ref(null);

const selectedTourId = computed({
  get: () => store.tourOptions.tourId,
  set: (v) => { store.tourOptions.tourId = v; }
});
const activeEngine = computed({
  get: () => store.tourOptions.engine,
  set: (v) => { store.tourOptions.engine = v; }
});
const showCaptions = computed({
  get: () => store.tourOptions.showCaptions,
  set: (v) => { store.tourOptions.showCaptions = v; }
});
const showLabels3D = computed({
  get: () => store.tourOptions.showLabels3D,
  set: (v) => { store.tourOptions.showLabels3D = v; }
});
const currentTime = computed({
  get: () => store.tourOptions.currentTime,
  set: (v) => { store.tourOptions.currentTime = v; }
});

const selectedNodeInfo = ref(null);

// Playback state
const isPlaying = ref(false);
const isMuted = ref(false);
const duration = ref(guidedToursList[0].duration);
const audioError = ref(false);

let fallbackRaf = null;
let fallbackLastTs = 0;

// Renderer instances
let threeGraph = null;
let threeDecorGroup = null;
let visNetwork = null;
let visBaseNodes = [];
let visBaseEdges = [];
let panZoomInstance = null;
let resizeObserver = null;
let resizeRaf = null;
let lastAppliedChapterId = null;

const activeTour = computed(() =>
  guidedToursList.find((t) => t.id === selectedTourId.value) || guidedToursList[0]
);

const audioSrc = computed(() => {
  const base = import.meta.env.BASE_URL || './';
  return `${base}${activeTour.value.audioFile}`;
});

const currentChapterIndex = computed(() => {
  const chs = activeTour.value.chapters;
  const t = currentTime.value;
  for (let i = chs.length - 1; i >= 0; i--) {
    if (t >= chs[i].start) return i;
  }
  return 0;
});

const currentChapter = computed(() => activeTour.value.chapters[currentChapterIndex.value] || null);

const activeSubtitle = computed(() => {
  const t = currentTime.value;
  const found = activeTour.value.subtitles.find((s) => t >= s.start && t <= s.end);
  return found ? found.text : '';
});

const formatTime = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
};

// --- PLAYBACK CONTROLS ---
const stopFallbackTimer = () => {
  if (fallbackRaf) {
    cancelAnimationFrame(fallbackRaf);
    fallbackRaf = null;
  }
};

const runFallbackTimer = (ts) => {
  if (!isPlaying.value) return;
  if (!fallbackLastTs) fallbackLastTs = ts;
  const dt = (ts - fallbackLastTs) / 1000;
  fallbackLastTs = ts;

  const next = currentTime.value + dt;
  if (next >= duration.value) {
    currentTime.value = duration.value;
    isPlaying.value = false;
    stopFallbackTimer();
    return;
  }
  currentTime.value = next;
  fallbackRaf = requestAnimationFrame(runFallbackTimer);
};

const togglePlay = async () => {
  if (isPlaying.value) {
    isPlaying.value = false;
    stopFallbackTimer();
    if (audioRef.value && !audioError.value) {
      audioRef.value.pause();
    }
    return;
  }

  if (currentTime.value >= duration.value - 0.5) {
    currentTime.value = 0;
    if (audioRef.value && !audioError.value) audioRef.value.currentTime = 0;
  }

  isPlaying.value = true;

  if (audioRef.value && !audioError.value) {
    try {
      audioRef.value.currentTime = currentTime.value;
      await audioRef.value.play();
      return;
    } catch {
      audioError.value = true;
    }
  }

  fallbackLastTs = 0;
  fallbackRaf = requestAnimationFrame(runFallbackTimer);
};

const seekTo = (sec) => {
  const clamped = Math.max(0, Math.min(duration.value, sec));
  currentTime.value = clamped;
  if (audioRef.value && !audioError.value) {
    try {
      audioRef.value.currentTime = clamped;
    } catch {
      // ignore if metadata not loaded yet
    }
  }
};

const restartTour = () => {
  seekTo(0);
  if (!isPlaying.value) togglePlay();
};

const prevChapter = () => {
  const idx = Math.max(0, currentChapterIndex.value - 1);
  seekTo(activeTour.value.chapters[idx].start + 0.05);
};

const nextChapter = () => {
  const idx = Math.min(activeTour.value.chapters.length - 1, currentChapterIndex.value + 1);
  seekTo(activeTour.value.chapters[idx].start + 0.05);
};

const toggleMute = () => {
  isMuted.value = !isMuted.value;
  if (audioRef.value) audioRef.value.muted = isMuted.value;
};

const onAudioTimeUpdate = () => {
  if (audioRef.value && !audioError.value) {
    currentTime.value = audioRef.value.currentTime;
  }
};

const onAudioLoadedMetadata = () => {
  if (audioRef.value && Number.isFinite(audioRef.value.duration) && audioRef.value.duration > 0) {
    duration.value = audioRef.value.duration;
    audioError.value = false;
    if (currentTime.value > 0 && currentTime.value < audioRef.value.duration) {
      audioRef.value.currentTime = currentTime.value;
    }
  }
};

const onAudioEnded = () => {
  isPlaying.value = false;
  stopFallbackTimer();
};

const onAudioError = () => {
  audioError.value = true;
  if (isPlaying.value) {
    fallbackLastTs = 0;
    fallbackRaf = requestAnimationFrame(runFallbackTimer);
  }
};

// --- CLEANUP ---
const clear3DDecor = () => {
  if (threeDecorGroup && threeGraph) {
    threeGraph.scene().remove(threeDecorGroup);
    threeDecorGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }
  threeDecorGroup = null;
};

const destroyRenderers = () => {
  clear3DDecor();
  if (threeGraph) {
    if (typeof threeGraph._destructor === 'function') threeGraph._destructor();
    threeGraph = null;
  }
  if (visNetwork) {
    visNetwork.destroy();
    visNetwork = null;
  }
  if (panZoomInstance) {
    panZoomInstance.destroy();
    panZoomInstance = null;
  }
};

// --- 3D ENGINE ---
const create3DSprite = (node) => {
  const isArtefact = node.nodeType === 'artefact';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const titleFont = isArtefact
    ? '600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    : 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const subFont = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  ctx.font = titleFont;
  const w1 = ctx.measureText(node.label).width;
  ctx.font = subFont;
  const w2 = ctx.measureText(node.shortLabel).width;

  canvas.width = Math.ceil(Math.max(w1, w2) + 28);
  canvas.height = isArtefact ? 54 : 62;

  const r = isArtefact ? 24 : 9;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = isArtefact ? 'rgba(232, 245, 233, 0.94)' : 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = node.color;
  ctx.lineWidth = isArtefact ? 2.5 : 3.5;

  ctx.beginPath();
  ctx.moveTo(r, 2);
  ctx.lineTo(w - r, 2);
  ctx.quadraticCurveTo(w - 2, 2, w - 2, r);
  ctx.lineTo(w - 2, h - r);
  ctx.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
  ctx.lineTo(r, h - 2);
  ctx.quadraticCurveTo(2, h - 2, 2, h - r);
  ctx.lineTo(2, r);
  ctx.quadraticCurveTo(2, 2, r, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = titleFont;
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.label, w / 2, isArtefact ? 19 : 22);

  ctx.font = subFont;
  ctx.fillStyle = node.color;
  ctx.fillText(node.shortLabel, w / 2, isArtefact ? 39 : 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);

  const scale = isArtefact ? 0.18 : 0.21;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  // Stagger spine artefact labels slightly below the spine so they never collide with process labels above it
  const yOffset = isArtefact && node.pos3d.y === 0 ? -19 : (isArtefact ? 17 : 23);
  sprite.position.set(0, yOffset, 0);
  return sprite;
};

const createZoneBannerSprite = (text, colorHex) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  canvas.width = Math.ceil(tw + 28);
  canvas.height = 38;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.fillStyle = colorHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(canvas.width * 0.26, canvas.height * 0.26, 1);
  return sprite;
};

const add3DZoneGuides = () => {
  if (!threeGraph) return;
  clear3DDecor();
  const group = new THREE.Group();

  const spineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-540, 0, -25),
    new THREE.Vector3(540, 0, -25)
  ]);
  const spineLine = new THREE.Line(
    spineGeo,
    new THREE.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.65 })
  );
  group.add(spineLine);

  const valLabel = createZoneBannerSprite('VALIDATION LOOPS · "Right system?"', '#7c3aed');
  valLabel.position.set(0, 330, -15);
  group.add(valLabel);

  const verLabel = createZoneBannerSprite('VERIFICATION LOOPS · "Built right?"', '#0f766e');
  verLabel.position.set(0, -330, -15);
  group.add(verLabel);

  threeDecorGroup = group;
  threeGraph.scene().add(group);
};

const render3D = () => {
  destroyRenderers();
  if (!threeDiv.value) return;
  threeDiv.value.innerHTML = '';

  const tour = activeTour.value;
  const nodes = tour.nodes.map((n) => ({
    ...n,
    fx: n.pos3d.x,
    fy: n.pos3d.y,
    fz: n.pos3d.z,
    val: n.nodeType === 'artefact' ? 7 : (n.role === 'spine' ? 14 : 18)
  }));

  const links = tour.edges.map((e) => ({ ...e }));

  threeGraph = ForceGraph3D()(threeDiv.value)
    .width(threeDiv.value.clientWidth)
    .height(threeDiv.value.clientHeight)
    .graphData({ nodes, links })
    .backgroundColor('#f8f9fb')
    .nodeRelSize(3.2)
    .nodeThreeObjectExtend(true)
    .nodeThreeObject((node) => (showLabels3D.value ? create3DSprite(node) : null))
    .nodeLabel((node) => `${node.label}: ${node.items.join(', ')}`)
    .linkCurvature((link) => link.curve || 0)
    .linkDirectionalArrowLength(5.5)
    .linkDirectionalArrowRelPos(0.92)
    .linkDirectionalParticleWidth(3.0)
    .linkDirectionalParticleSpeed(0.008)
    .onNodeClick((node) => { selectedNodeInfo.value = node; })
    .onBackgroundClick(() => { selectedNodeInfo.value = null; });

  add3DZoneGuides();
  applyChapterVisuals(true);
};

// --- 2D VIS.JS ENGINE (chosen: false prevents hover font-bold resize jumps) ---
const renderVisJs = () => {
  destroyRenderers();
  if (!visDiv.value) return;

  const tour = activeTour.value;

  visBaseNodes = tour.nodes.map((n) => {
    const isArtefact = n.nodeType === 'artefact';
    return {
      id: n.id,
      label: `${n.label}\n(${n.shortLabel})`,
      x: n.pos2d.x,
      y: n.pos2d.y,
      shape: isArtefact ? 'ellipse' : 'box',
      widthConstraint: isArtefact
        ? { minimum: 145, maximum: 195 }
        : { minimum: 165, maximum: 220 },
      color: {
        background: n.bg,
        border: n.color,
        highlight: { background: n.bg, border: n.color }
      },
      font: {
        face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        size: isArtefact ? 11.5 : 12.5,
        bold: !isArtefact,
        color: '#1e293b'
      },
      borderWidth: isArtefact ? 2 : 2.5,
      margin: isArtefact ? 8 : 11,
      opacity: 1,
      _meta: n
    };
  });

  visBaseEdges = tour.edges.map((e) => {
    const isConstraint = e.kind === 'constraint';
    const baseColor =
      e.kind === 'validation' ? '#7c3aed'
      : e.kind === 'verification' ? '#0f766e'
      : e.kind === 'constraint' ? '#d97706'
      : '#334155';

    return {
      id: e.id,
      from: e.source,
      to: e.target,
      dashes: isConstraint,
      width: 2,
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
      smooth: e.curve
        ? { enabled: true, type: 'curvedCW', roundness: e.curve }
        : { enabled: false },
      color: { color: baseColor, highlight: baseColor },
      _baseColor: baseColor,
      _kind: e.kind
    };
  });

  visNetwork = new Network(
    visDiv.value,
    { nodes: [...visBaseNodes], edges: [...visBaseEdges] },
    {
      physics: { enabled: false },
      nodes: { chosen: false },
      edges: { chosen: false },
      interaction: { hover: true }
    }
  );

  // Subtle horizontal zone bands matching the Handbook diagram
  visNetwork.on('beforeDrawing', (ctx) => {
    ctx.save();
    ctx.fillStyle = 'rgba(124, 58, 237, 0.045)';
    ctx.fillRect(-980, -430, 1960, 315);
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('VALIDATION LOOPS · "Do we have the right system?"', -950, -402);

    ctx.fillStyle = 'rgba(30, 41, 59, 0.03)';
    ctx.fillRect(-980, -85, 1960, 170);

    ctx.fillStyle = 'rgba(15, 118, 110, 0.045)';
    ctx.fillRect(-980, 115, 1960, 315);
    ctx.fillStyle = '#0f766e';
    ctx.fillText('VERIFICATION LOOPS · "Are we building it right?"', -950, 410);
    ctx.restore();
  });

  visNetwork.on('click', (params) => {
    if (params.nodes.length > 0) {
      const node = tour.nodes.find((n) => n.id === params.nodes[0]);
      selectedNodeInfo.value = node || null;
    } else {
      selectedNodeInfo.value = null;
    }
  });

  setTimeout(() => {
    applyChapterVisuals(true);
  }, 60);
};

// --- MERMAID ENGINE (strict class shorthand without leading space) ---
const buildTourMermaidCode = () => {
  const tour = activeTour.value;
  const lines = [
    'flowchart TB',
    'classDef spine fill:#fff8e1,stroke:#d6b656,stroke-width:2px,color:#1e293b;',
    'classDef validation fill:#f3e8ff,stroke:#7c3aed,stroke-width:2.5px,color:#4c1d95,font-weight:bold;',
    'classDef verification fill:#ccfbf1,stroke:#0f766e,stroke-width:2.5px,color:#134e4a,font-weight:bold;',
    'classDef analysis fill:#fef3c7,stroke:#b45309,stroke-width:2px,color:#78350f;',
    'classDef artefact fill:#e8f5e9,stroke:#4caf50,stroke-width:1.8px,color:#1b5e20;',
    '',
    'subgraph sg_val ["VALIDATION · Do we have the right system?"]',
    '  direction LR',
    '  style sg_val fill:#faf5ff,stroke:#c4b5fd,stroke-width:1.5px,color:#6d28d9;',
    '  art_validated_defs(["Validated Needs, Arch &amp; Design<br/>(2 artefacts)"]):::artefact',
    '  proc_validation["Validation<br/>(VAL)"]:::validation',
    '  art_validated_sys(["Validated System &amp; Report<br/>(2 artefacts)"]):::artefact',
    '  art_installed_sys(["Installed System &amp; Report<br/>(2 artefacts)"]):::artefact',
    'end',
    '',
    'subgraph sg_spine ["TRANSFORMATION SPINE · Technical Processes &amp; Intermediate Artefacts"]',
    '  direction LR',
    '  style sg_spine fill:#f8fafc,stroke:#cbd5e1,stroke-width:1.5px,color:#334155;',
    '  stage_concept["Concept &amp; Stakeholder Needs<br/>(BMA + SNRD)"]:::spine',
    '  art_stakeholder_reqs(["Stakeholder Needs &amp; Concepts<br/>(4 artefacts)"]):::artefact',
    '  stage_srd["System Requirements<br/>(SRD)"]:::spine',
    '  art_system_reqs(["System Requirements &amp; Criteria<br/>(3 artefacts)"]):::artefact',
    '  stage_arch["Architecture &amp; Design<br/>(SAD + DD)"]:::spine',
    '  art_arch_design(["Architecture &amp; Design Baseline<br/>(6 artefacts)"]):::artefact',
    '  stage_realise["System Realisation<br/>(IMPL + INT)"]:::spine',
    '  art_integrated_sys(["Integrated System<br/>(4 artefacts)"]):::artefact',
    '  stage_deploy["Deployment, Use &amp; Disposal<br/>(TRAN · OPER · MAINT · DISP)"]:::spine',
    'end',
    '',
    'subgraph sg_ver ["VERIFICATION · Are we building it right?"]',
    '  direction LR',
    '  style sg_ver fill:#f0fdfa,stroke:#99f6e4,stroke-width:1.5px,color:#0f766e;',
    '  proc_sys_analysis["System Analysis<br/>(SA)"]:::analysis',
    '  art_constraints(["Constraints on Solution<br/>(2 artefacts)"]):::artefact',
    '  art_verified_defs(["Verified Reqs, Arch &amp; Design<br/>(2 artefacts)"]):::artefact',
    '  proc_verification["Verification<br/>(VER)"]:::verification',
    '  art_verified_sys(["Verified System &amp; Report<br/>(2 artefacts)"]):::artefact',
    'end',
    ''
  ];

  tour.edges.forEach((e) => {
    const arrow = e.kind === 'constraint' ? '-.->' : '-->';
    lines.push(`${e.source} ${arrow} ${e.target}`);
  });

  tour.nodes.forEach((n) => {
    lines.push(`click ${n.id} call handleTourNodeClick()`);
  });

  return lines.join('\n');
};

window.handleTourNodeClick = (nodeId) => {
  const node = activeTour.value.nodes.find((n) => n.id === nodeId);
  selectedNodeInfo.value = node || null;
};

const MERMAID_SHAPE_SEL = ':scope > rect, :scope > polygon, :scope > circle, :scope > ellipse, :scope > path, .label-container';

const renderMermaid = async () => {
  destroyRenderers();
  if (!mermaidDiv.value) return;
  mermaidDiv.value.innerHTML = '';

  const code = buildTourMermaidCode();
  const renderId = `tour-mermaid-${Date.now()}`;
  const { svg, bindFunctions } = await mermaid.render(renderId, code);
  if (!mermaidDiv.value) return;

  mermaidDiv.value.innerHTML = svg;
  const svgEl = mermaidDiv.value.querySelector('svg');
  if (bindFunctions) bindFunctions(mermaidDiv.value);

  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.style.maxWidth = 'none';
  svgEl.style.width = '100%';
  svgEl.style.height = '100%';
  svgEl.style.display = 'block';

  panZoomInstance = svgPanZoom(svgEl, {
    zoomEnabled: true,
    controlIconsEnabled: false,
    fit: true,
    center: true,
    preventMouseEventsDefault: false
  });
  panZoomInstance.resize();
  panZoomInstance.fit();
  panZoomInstance.center();

  applyChapterVisuals(true);
};

// --- APPLY CHAPTER HIGHLIGHTS & CAMERA ACROSS ALL 3 ENGINES (ZERO REDRAW) ---
const applyChapterVisuals = (forceCamera = false) => {
  const ch = currentChapter.value;
  if (!ch) return;

  const chapterChanged = forceCamera || lastAppliedChapterId !== ch.id;
  lastAppliedChapterId = ch.id;

  const activeNodeSet = new Set(ch.activeNodes || []);
  const activeEdgeSet = new Set(ch.activeEdges || []);

  // 1. 3D Force Graph
  if (activeEngine.value === '3d' && threeGraph) {
    threeGraph
      .nodeColor((n) => (activeNodeSet.has(n.id) ? n.color : '#d5dce4'))
      .nodeVal((n) => {
        if (activeNodeSet.has(n.id)) {
          return n.nodeType === 'artefact' ? 12 : (n.role === 'spine' ? 20 : 24);
        }
        return n.nodeType === 'artefact' ? 4.5 : 8;
      })
      .linkColor((l) => {
        if (!activeEdgeSet.has(l.id)) return '#e2e8f0';
        if (l.kind === 'validation') return '#7c3aed';
        if (l.kind === 'verification') return '#0f766e';
        if (l.kind === 'constraint') return '#d97706';
        return '#1565c0';
      })
      .linkWidth((l) => (activeEdgeSet.has(l.id) ? 3.2 : 0.7))
      .linkDirectionalParticles((l) => (activeEdgeSet.has(l.id) ? 4 : 0))
      .linkDirectionalParticleColor((l) => {
        if (l.kind === 'validation') return '#7c3aed';
        if (l.kind === 'verification') return '#0f766e';
        if (l.kind === 'constraint') return '#d97706';
        return '#2e7d32';
      });

    if (chapterChanged && ch.camera3d) {
      threeGraph.cameraPosition(ch.camera3d.pos, ch.camera3d.lookAt, 950);
    }
  }

  // 2. 2D Vis.js
  if (activeEngine.value === 'visjs' && visNetwork) {
    const nodesDS = visNetwork.body.data.nodes;
    const edgesDS = visNetwork.body.data.edges;

    nodesDS.update(
      visBaseNodes.map((n) => {
        const isActive = activeNodeSet.has(n.id);
        return isActive
          ? {
              ...n,
              borderWidth: n._meta.nodeType === 'artefact' ? 3.2 : 4.2,
              opacity: 1,
              shadow: { enabled: true, color: 'rgba(15, 23, 42, 0.2)', size: 12, x: 0, y: 3 }
            }
          : {
              ...n,
              color: { background: '#f5f7fa', border: '#d8dee6' },
              font: { ...n.font, color: '#94a3b8' },
              borderWidth: 1.5,
              opacity: 0.32,
              shadow: false
            };
      })
    );

    edgesDS.update(
      visBaseEdges.map((e) => {
        const isActive = activeEdgeSet.has(e.id);
        return isActive
          ? {
              ...e,
              width: 3.2,
              color: { color: e._baseColor, highlight: e._baseColor }
            }
          : {
              ...e,
              width: 1,
              color: { color: 'rgba(180, 190, 200, 0.25)' }
            };
      })
    );

    if (chapterChanged) {
      if (Array.isArray(ch.focus2d) && ch.focus2d.length > 0) {
        visNetwork.fit({
          nodes: ch.focus2d,
          animation: { duration: 750, easingFunction: 'easeInOutQuad' }
        });
      } else {
        visNetwork.fit({
          animation: { duration: 750, easingFunction: 'easeInOutQuad' }
        });
      }
    }
  }

  // 3. Mermaid (In-place SVG DOM highlighting — zero redraw)
  if (activeEngine.value === 'mermaid' && mermaidDiv.value) {
    const tour = activeTour.value;
    const nodeElems = mermaidDiv.value.querySelectorAll('.node');
    nodeElems.forEach((el) => {
      const elId = el.getAttribute('id') || '';
      const matched = tour.nodes.find((n) => elId === n.id || elId.startsWith(`flowchart-${n.id}-`));
      if (!matched) return;
      const isActive = activeNodeSet.has(matched.id);

      el.style.opacity = isActive ? '1' : '0.26';
      el.style.filter = isActive ? `drop-shadow(0 0 8px ${matched.color}66)` : 'none';
      el.querySelectorAll(MERMAID_SHAPE_SEL).forEach((shape) => {
        if (isActive) {
          shape.style.setProperty('stroke', matched.color, 'important');
          shape.style.setProperty('stroke-width', '4px', 'important');
          shape.style.setProperty('fill', matched.bg, 'important');
        } else {
          shape.style.removeProperty('stroke');
          shape.style.removeProperty('stroke-width');
          shape.style.removeProperty('fill');
        }
      });
    });

    const edgePaths = mermaidDiv.value.querySelectorAll('.edgePaths path.flowchart-link');
    tour.edges.forEach((e, idx) => {
      const isActive = activeEdgeSet.has(e.id);
      const pathEl = edgePaths[idx];
      const activeColor =
        e.kind === 'validation' ? '#7c3aed'
        : e.kind === 'verification' ? '#0f766e'
        : e.kind === 'constraint' ? '#d97706'
        : '#1565c0';

      if (pathEl) {
        pathEl.style.opacity = isActive ? '1' : '0.16';
        if (isActive) {
          pathEl.style.setProperty('stroke', activeColor, 'important');
          pathEl.style.setProperty('stroke-width', '3.5px', 'important');
        } else {
          pathEl.style.removeProperty('stroke');
          pathEl.style.removeProperty('stroke-width');
        }
      }
    });
  }
};

const fitView = () => {
  if (activeEngine.value === '3d' && threeGraph) {
    threeGraph.cameraPosition({ x: 0, y: 75, z: 980 }, { x: 0, y: 0, z: 0 }, 650);
  } else if (activeEngine.value === 'visjs' && visNetwork) {
    visNetwork.fit({ animation: { duration: 450, easingFunction: 'easeInOutQuad' } });
  } else if (activeEngine.value === 'mermaid' && panZoomInstance) {
    panZoomInstance.resize();
    panZoomInstance.fit();
    panZoomInstance.center();
  }
};

const mountCurrentEngine = async () => {
  selectedNodeInfo.value = null;
  lastAppliedChapterId = null;
  await nextTick();
  if (activeEngine.value === '3d') render3D();
  else if (activeEngine.value === 'visjs') renderVisJs();
  else if (activeEngine.value === 'mermaid') await renderMermaid();
};

watch([activeEngine, showLabels3D, selectedTourId], () => {
  mountCurrentEngine();
});

watch(currentChapterIndex, () => {
  applyChapterVisuals(false);
});

const syncSize = () => {
  if (activeEngine.value === '3d' && threeGraph && threeDiv.value) {
    threeGraph.width(threeDiv.value.clientWidth);
    threeGraph.height(threeDiv.value.clientHeight);
  } else if (activeEngine.value === 'visjs' && visNetwork) {
    visNetwork.setSize('100%', '100%');
    visNetwork.redraw();
  } else if (activeEngine.value === 'mermaid' && panZoomInstance) {
    panZoomInstance.resize();
  }
};

const scheduleResize = () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    syncSize();
    resizeRaf = null;
  });
};

onMounted(async () => {
  window.addEventListener('resize', scheduleResize);
  if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
    resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(stageRef.value);
  }
  await mountCurrentEngine();
});

onUnmounted(() => {
  window.removeEventListener('resize', scheduleResize);
  if (resizeObserver) resizeObserver.disconnect();
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  stopFallbackTimer();
  if (audioRef.value) audioRef.value.pause();
  destroyRenderers();
});
</script>

<template>
  <div class="tours-container" ref="stageRef">
    <!-- Hidden Audio Element driving sync -->
    <audio
      ref="audioRef"
      :src="audioSrc"
      preload="metadata"
      @timeupdate="onAudioTimeUpdate"
      @loadedmetadata="onAudioLoadedMetadata"
      @ended="onAudioEnded"
      @error="onAudioError"
    ></audio>

    <!-- Render Stages -->
    <div v-if="activeEngine === '3d'" ref="threeDiv" class="tour-stage"></div>
    <div v-if="activeEngine === 'visjs'" ref="visDiv" class="tour-stage"></div>
    <div v-if="activeEngine === 'mermaid'" ref="mermaidDiv" class="tour-stage"></div>

    <!-- Top Floating Toolbar -->
    <div class="tour-toolbar">
      <select v-model="selectedTourId" class="tour-select" title="Choose a guided tour">
        <option v-for="t in guidedToursList" :key="t.id" :value="t.id">
          🎬 {{ t.title }}
        </option>
      </select>

      <div class="engine-switch" title="Switch rendering engine live">
        <button :class="['engine-btn', { active: activeEngine === '3d' }]" @click="activeEngine = '3d'">3D</button>
        <button :class="['engine-btn', { active: activeEngine === 'visjs' }]" @click="activeEngine = 'visjs'">Vis.js (2D)</button>
        <button :class="['engine-btn', { active: activeEngine === 'mermaid' }]" @click="activeEngine = 'mermaid'">Mermaid</button>
      </div>

      <button class="toolbar-btn" @click="fitView" title="Fit diagram to viewport">🎯 Fit View</button>

      <label v-if="activeEngine === '3d'" class="toolbar-toggle">
        <input type="checkbox" v-model="showLabels3D" />
        Labels
      </label>

      <label class="toolbar-toggle">
        <input type="checkbox" v-model="showCaptions" />
        CC
      </label>

      <div v-if="currentChapter" class="chapter-pill">
        <span class="chapter-badge">{{ currentChapter.badge }}</span>
        <span class="chapter-title">{{ currentChapter.title }}</span>
      </div>
    </div>

    <!-- Click-to-Inspect Super-Node Card (Processes OR Artefacts) -->
    <div v-if="selectedNodeInfo" class="info-panel">
      <button class="info-close-btn" @click="selectedNodeInfo = null" aria-label="Close">&times;</button>
      <div class="info-badges">
        <span class="info-type-pill" :class="selectedNodeInfo.nodeType">
          {{ selectedNodeInfo.nodeType === 'artefact' ? 'Artefact Super-Node' : 'Process Super-Node' }}
        </span>
        <span class="info-group-tag" :style="{ background: selectedNodeInfo.bg, color: selectedNodeInfo.color }">
          {{ selectedNodeInfo.shortLabel }}
        </span>
      </div>
      <h3>{{ selectedNodeInfo.label }}</h3>
      <p>{{ selectedNodeInfo.description }}</p>
      <div class="info-procs">
        <h4>
          {{ selectedNodeInfo.nodeType === 'artefact' ? 'ISO 15288 Artefacts Included' : 'ISO 15288 Processes Included' }}
          ({{ selectedNodeInfo.items.length }})
        </h4>
        <ul>
          <li v-for="item in selectedNodeInfo.items" :key="item">{{ item }}</li>
        </ul>
      </div>
    </div>

    <!-- Bottom Caption & Audio Player Dock -->
    <div class="player-dock">
      <div v-if="showCaptions && activeSubtitle" class="caption-box">
        {{ activeSubtitle }}
      </div>

      <div class="player-bar">
        <div class="player-controls">
          <button class="p-btn" @click="restartTour" title="Restart tour">⏮</button>
          <button class="p-btn" @click="prevChapter" :disabled="currentChapterIndex === 0" title="Previous chapter">◀</button>
          <button class="p-btn play-main" @click="togglePlay" :title="isPlaying ? 'Pause' : 'Play tour'">
            {{ isPlaying ? '⏸' : '▶' }}
          </button>
          <button
            class="p-btn"
            @click="nextChapter"
            :disabled="currentChapterIndex >= activeTour.chapters.length - 1"
            title="Next chapter"
          >
            ▶
          </button>
          <button class="p-btn" @click="toggleMute" :title="isMuted ? 'Unmute' : 'Mute'">
            {{ isMuted ? '🔇' : '🔊' }}
          </button>
        </div>

        <div class="scrubber-wrap">
          <input
            type="range"
            class="scrubber"
            min="0"
            :max="duration"
            step="0.1"
            :value="currentTime"
            @input="seekTo(Number($event.target.value))"
          />
          <div class="chapter-ticks">
            <span
              v-for="ch in activeTour.chapters"
              :key="ch.id"
              class="tick"
              :style="{ left: `${(ch.start / duration) * 100}%` }"
              :title="`${formatTime(ch.start)} · ${ch.title}`"
              @click="seekTo(ch.start + 0.05)"
            ></span>
          </div>
        </div>

        <span class="time-readout">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      </div>

      <div v-if="audioError" class="audio-fallback-note">
        Silent preview mode (place MP3 at <code>public/{{ activeTour.audioFile }}</code> to enable voiceover)
      </div>
    </div>
  </div>
</template>

<style scoped>
.tours-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #f8f9fb;
  overflow: hidden;
}
.tour-stage {
  width: 100%;
  height: 100%;
  outline: none;
}

.tour-toolbar {
  position: absolute; top: 14px; left: 16px; z-index: 110;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  max-width: calc(100% - 32px);
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #d0d7de; border-radius: 8px;
  padding: 6px 10px; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(4px);
}
.tour-select {
  padding: 5px 8px; border-radius: 6px; border: 1px solid #cbd5e1;
  font-size: 12.5px; font-weight: 600; color: #1e293b; background: #ffffff;
}

.engine-switch {
  display: inline-flex; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;
}
.engine-btn {
  border: none; background: #f8fafc; padding: 5px 10px; font-size: 11.5px;
  font-weight: 600; color: #475569; cursor: pointer; transition: background 0.15s, color 0.15s;
}
.engine-btn:not(:last-child) { border-right: 1px solid #e2e8f0; }
.engine-btn.active { background: #4CAF50; color: #ffffff; }

.toolbar-btn {
  background: #ffffff; border: 1px solid #ccc; border-radius: 6px;
  padding: 5px 10px; font-size: 12px; font-weight: 600; color: #333; cursor: pointer;
}
.toolbar-btn:hover { background: #f0f2f5; }
.toolbar-toggle {
  display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600;
  color: #334155; cursor: pointer; user-select: none;
}

.chapter-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 14px; background: #eef2ff; border: 1px solid #c7d2fe;
  font-size: 11.5px;
}
.chapter-badge { font-weight: 700; color: #4338ca; }
.chapter-title { color: #1e293b; font-weight: 500; }

/* Info Panel */
.info-panel {
  position: absolute; top: 14px; right: 16px; width: 340px; max-height: calc(100% - 150px);
  background: #ffffff; border: 1px solid #d0d7de; border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.16); padding: 18px; overflow-y: auto; z-index: 200;
}
.info-badges {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; padding-right: 26px;
}
.info-type-pill {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;
  padding: 2px 7px; border-radius: 10px;
}
.info-type-pill.process { background: #fff3cd; color: #8a5a00; }
.info-type-pill.artefact { background: #e8f5e9; color: #1b5e20; }
.info-group-tag {
  display: inline-block; padding: 2px 8px;
  font-size: 11px; font-weight: 700; border-radius: 10px;
}
.info-panel h3 { margin: 0 0 10px 0; font-size: 16px; color: #1e293b; }
.info-panel p { margin: 0; font-size: 13px; color: #475569; line-height: 1.55; }
.info-procs { margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
.info-procs h4 { margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: #64748b; }
.info-procs ul { margin: 0; padding-left: 18px; font-size: 12.5px; color: #334155; display: flex; flex-direction: column; gap: 3px; }
.info-close-btn {
  position: absolute; top: 10px; right: 10px; width: 26px; height: 26px;
  border: none; background: none; font-size: 20px; color: #64748b; cursor: pointer; border-radius: 4px;
}
.info-close-btn:hover { background: #f1f5f9; color: #0f172a; }

/* Bottom Player Dock */
.player-dock {
  position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
  width: min(760px, calc(100% - 32px));
  z-index: 150;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}

.caption-box {
  background: rgba(15, 23, 42, 0.86);
  color: #f8fafc;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.45;
  text-align: center;
  max-width: 100%;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
}

.player-bar {
  width: 100%;
  display: flex; align-items: center; gap: 12px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 14px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(6px);
}

.player-controls {
  display: flex; align-items: center; gap: 5px; flex-shrink: 0;
}
.p-btn {
  width: 30px; height: 28px; border-radius: 6px;
  border: 1px solid #cbd5e1; background: #f8fafc; color: #334155;
  cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;
}
.p-btn:hover:not(:disabled) { background: #e2e8f0; }
.p-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.p-btn.play-main {
  width: 36px; background: #4CAF50; color: #ffffff; border-color: #4CAF50; font-size: 13px;
}
.p-btn.play-main:hover { background: #43a047; }

.scrubber-wrap {
  flex: 1; position: relative; display: flex; flex-direction: column; justify-content: center;
}
.scrubber {
  width: 100%; cursor: pointer; accent-color: #4CAF50; margin: 0;
}
.chapter-ticks {
  position: relative; width: 100%; height: 8px; margin-top: 2px;
}
.tick {
  position: absolute; top: 1px; width: 4px; height: 6px; border-radius: 2px;
  background: #94a3b8; transform: translateX(-50%); cursor: pointer;
}
.tick:hover { background: #1565c0; transform: translateX(-50%) scale(1.4); }

.time-readout {
  font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: #475569; flex-shrink: 0; white-space: nowrap;
}

.audio-fallback-note {
  font-size: 11px; color: #92400e; background: #fef3c7; border: 1px solid #fcd34d;
  padding: 3px 10px; border-radius: 6px;
}
</style>
