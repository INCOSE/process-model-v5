<script setup>
import { ref, computed, watch } from 'vue';
import { store, graphData } from '../store/graphStore.js';
import { getProcessGroup, groupColors, groupOrder, getProcessOrderIndex } from '../core/iso15288Groups.js';
import SearchableSelect from './SearchableSelect.vue';

const activeTab = ref('checklist'); // 'checklist' | 'hotspots' | 'dictionary'

// --- TAB 1: PROCESS CHECKLIST (SIPOC / ICOM) ---
const selectedProcessId = ref('');
const checkedItems = ref({}); // key -> boolean (default true)

const processOptions = computed(() => {
  return Object.entries(store.processes)
    .map(([id, name]) => ({
      id,
      name,
      group: getProcessGroup(name),
      orderIdx: getProcessOrderIndex(name)
    }))
    .sort((a, b) => {
      const gA = groupOrder.indexOf(a.group);
      const gB = groupOrder.indexOf(b.group);
      if (gA !== gB) return gA - gB;
      if (a.orderIdx !== b.orderIdx) return a.orderIdx - b.orderIdx;
      return a.name.localeCompare(b.name);
    });
});

// Pick a sensible default process when model loads
watch(
  processOptions,
  (opts) => {
    if (!selectedProcessId.value && opts.length > 0) {
      selectedProcessId.value = opts[0].id;
    }
  },
  { immediate: true }
);

watch(selectedProcessId, () => {
  checkedItems.value = {};
});

const isChecked = (key) => checkedItems.value[key] !== false;
const toggleCheck = (key) => {
  checkedItems.value = { ...checkedItems.value, [key]: !isChecked(key) };
};

const processDetails = computed(() => {
  const pId = selectedProcessId.value;
  const gActive = graphData.gActive();
  const gFull = graphData.gFull;
  if (!pId || !gActive || !gActive.hasNode(pId)) return null;

  const name = gActive.getNodeAttribute(pId, 'name') || 'Unknown';
  const doc = gActive.getNodeAttribute(pId, 'doc') || 'Description is missing in the model.';
  const group = getProcessGroup(name);
  const color = groupColors[group] || '#546e7a';

  const isProcNode = (id) => {
    const t = gFull.getNodeAttribute(id, 'type') || '';
    return t.includes('BusinessFunction') || t.includes('BusinessProcess');
  };

  // Internal activities via Composition in gFull
  const activities = [];
  gFull.forEachOutEdge(pId, (edge, attr, u, v) => {
    const t = gFull.getNodeAttribute(v, 'type') || '';
    if (attr.type?.includes('Composition') && t.includes('BusinessProcess')) {
      activities.push({
        id: v,
        name: gFull.getNodeAttribute(v, 'name') || 'Unnamed activity',
        doc: gFull.getNodeAttribute(v, 'doc') || ''
      });
    }
  });

  const inputsMap = new Map();
  const controlsMap = new Map();
  const enablesMap = new Map();
  const outputsMap = new Map();

  // Incoming edges to pId
  gActive.forEachInEdge(pId, (edge, attr, src) => {
    if (attr.access === 'hierarchy_reverse' || attr.type?.includes('Composition')) return;
    if (isProcNode(src)) return;

    const objName = gActive.getNodeAttribute(src, 'name') || 'Unknown';
    const objDoc = gActive.getNodeAttribute(src, 'doc') || '';
    const sub = attr.subclass || '';

    // Find upstream producers of this input
    const producers = [];
    gFull.forEachInEdge(src, (e2, a2, pSrc) => {
      if (a2.access === 'hierarchy_reverse') return;
      const t = gFull.getNodeAttribute(pSrc, 'type') || '';
      if (t.includes('BusinessFunction') && pSrc !== pId) {
        producers.push(gFull.getNodeAttribute(pSrc, 'name') || pSrc);
      }
    });

    const record = { id: src, name: objName, doc: objDoc, subclass: sub, peers: Array.from(new Set(producers)).sort() };
    if (sub === 'Controls') controlsMap.set(src, record);
    else if (sub === 'Enables') enablesMap.set(src, record);
    else inputsMap.set(src, record);
  });

  // Outgoing edges from pId
  gActive.forEachOutEdge(pId, (edge, attr, u, tgt) => {
    if (attr.access === 'hierarchy_reverse' || attr.type?.includes('Composition')) return;
    if (isProcNode(tgt)) return;

    const objName = gActive.getNodeAttribute(tgt, 'name') || 'Unknown';
    const objDoc = gActive.getNodeAttribute(tgt, 'doc') || '';
    const sub = attr.subclass || '';

    // Find downstream consumers of this output
    const consumers = [];
    gFull.forEachOutEdge(tgt, (e2, a2, oSrc, pTgt) => {
      if (a2.access === 'hierarchy_reverse') return;
      const t = gFull.getNodeAttribute(pTgt, 'type') || '';
      if (t.includes('BusinessFunction') && pTgt !== pId) {
        consumers.push(gFull.getNodeAttribute(pTgt, 'name') || pTgt);
      }
    });

    outputsMap.set(tgt, {
      id: tgt,
      name: objName,
      doc: objDoc,
      subclass: sub,
      peers: Array.from(new Set(consumers)).sort()
    });
  });

  const sortByName = (arr) => arr.sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: pId,
    name,
    doc,
    group,
    color,
    activities,
    inputs: sortByName(Array.from(inputsMap.values())),
    outputs: sortByName(Array.from(outputsMap.values())),
    controls: sortByName(Array.from(controlsMap.values())),
    enables: sortByName(Array.from(enablesMap.values()))
  };
});

const exportChecklistMarkdown = () => {
  const d = processDetails.value;
  if (!d) return;

  const lines = [
    `# Process Tailoring Checklist: ${d.name}`,
    `**Group:** ${d.group}`,
    '',
    `> ${d.doc}`,
    '',
    '## Internal Activities',
    ...(d.activities.length
      ? d.activities.map((a) => `- [${isChecked('act_' + a.id) ? 'x' : ' '}] ${a.name}`)
      : ['- *(No internal activities modelled)*']),
    '',
    '## Inputs',
    ...(d.inputs.length
      ? d.inputs.map((i) => {
          const src = i.peers.length ? ` *(from: ${i.peers.join(', ')})*` : '';
          return `- [${isChecked('in_' + i.id) ? 'x' : ' '}] ${i.name}${src}`;
        })
      : ['- *(None)*']),
    '',
    '## Outputs',
    ...(d.outputs.length
      ? d.outputs.map((o) => {
          const checked = isChecked('out_' + o.id);
          const impact = !checked && o.peers.length ? ` — **WARNING: impacts ${o.peers.join(', ')}**` : '';
          return `- [${checked ? 'x' : ' '}] ${o.name}${impact}`;
        })
      : ['- *(None)*'])
  ];

  if (d.controls.length || d.enables.length) {
    lines.push('', '## Controls & Enablers');
    d.controls.forEach((c) => lines.push(`- [Controls] ${c.name}`));
    d.enables.forEach((e) => lines.push(`- [Enables] ${e.name}`));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Checklist_${d.name.replace(/[^a-z0-9]+/gi, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

// --- TAB 2: STRUCTURAL HOTSPOTS ---
const hotspots = computed(() => {
  const gActive = graphData.gActive();
  if (!store.isLoaded || !gActive) return { hubs: [], sharedOutputs: [], feedbackLoops: [] };

  const isFunc = (id) => (gActive.getNodeAttribute(id, 'type') || '').includes('BusinessFunction');
  const isProcOrFunc = (id) => {
    const t = gActive.getNodeAttribute(id, 'type') || '';
    return t.includes('BusinessFunction') || t.includes('BusinessProcess');
  };

  const hubs = [];
  const sharedOutputs = [];

  Object.entries(store.businessObjects).forEach(([objId, name]) => {
    if (!gActive.hasNode(objId)) return;
    const writers = new Set();
    const readers = new Set();

    gActive.forEachInEdge(objId, (e, attr, src) => {
      if (attr.access === 'hierarchy_reverse') return;
      if (isFunc(src)) writers.add(gActive.getNodeAttribute(src, 'name') || src);
    });
    gActive.forEachOutEdge(objId, (e, attr, src, tgt) => {
      if (attr.access === 'hierarchy_reverse') return;
      if (isFunc(tgt)) readers.add(gActive.getNodeAttribute(tgt, 'name') || tgt);
    });

    const total = writers.size + readers.size;
    if (total > 0) {
      hubs.push({
        id: objId,
        name,
        writers: Array.from(writers).sort(),
        readers: Array.from(readers).sort(),
        total
      });
    }
    if (writers.size > 1) {
      sharedOutputs.push({
        id: objId,
        name,
        writers: Array.from(writers).sort(),
        readersCount: readers.size
      });
    }
  });

  hubs.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  sharedOutputs.sort((a, b) => b.writers.length - a.writers.length || a.name.localeCompare(b.name));

  // Direct mutual feedback loops (Process A -> Obj -> Process B AND Process B -> Obj -> Process A)
  const procPairs = new Map(); // "idA|idB" -> Set(objNames)
  Object.keys(store.processes).forEach((pA) => {
    if (!gActive.hasNode(pA)) return;
    gActive.forEachOutEdge(pA, (e1, a1, u1, obj) => {
      if (a1.access === 'hierarchy_reverse' || isProcOrFunc(obj)) return;
      const objName = gActive.getNodeAttribute(obj, 'name') || obj;
      gActive.forEachOutEdge(obj, (e2, a2, u2, pB) => {
        if (a2.access === 'hierarchy_reverse' || !isFunc(pB) || pB === pA) return;
        const key = `${pA}|||${pB}`;
        if (!procPairs.has(key)) procPairs.set(key, new Set());
        procPairs.get(key).add(objName);
      });
    });
  });

  const feedbackLoops = [];
  const seenPairs = new Set();
  procPairs.forEach((abObjs, key) => {
    const [pA, pB] = key.split('|||');
    const revKey = `${pB}|||${pA}`;
    const canonical = pA < pB ? `${pA}|||${pB}` : `${pB}|||${pA}`;
    if (procPairs.has(revKey) && !seenPairs.has(canonical)) {
      seenPairs.add(canonical);
      feedbackLoops.push({
        id: canonical,
        processA: store.processes[pA] || pA,
        processB: store.processes[pB] || pB,
        aToB: Array.from(abObjs).sort(),
        bToA: Array.from(procPairs.get(revKey)).sort()
      });
    }
  });

  feedbackLoops.sort((a, b) => (b.aToB.length + b.bToA.length) - (a.aToB.length + a.bToA.length));

  return {
    hubs: hubs.slice(0, 15),
    sharedOutputs,
    feedbackLoops
  };
});

// --- TAB 3: DICTIONARY & FULL-TEXT DOC SEARCH ---
const dictQuery = ref('');
const dictFilter = ref('all'); // 'all' | 'process' | 'activity' | 'object'

const dictionaryItems = computed(() => {
  const gFull = graphData.gFull;
  if (!store.isLoaded || !gFull) return [];

  const q = dictQuery.value.trim().toLowerCase();
  const results = [];

  gFull.forEachNode((id, attr) => {
    const type = attr.type || '';
    let category = 'object';
    let categoryLabel = 'Business Object';
    if (type.includes('BusinessFunction')) {
      category = 'process';
      categoryLabel = getProcessGroup(attr.name || '');
    } else if (type.includes('BusinessProcess')) {
      category = 'activity';
      categoryLabel = 'Internal Activity';
    }

    if (dictFilter.value !== 'all' && dictFilter.value !== category) return;

    const name = attr.name || 'Unnamed';
    const doc = attr.doc || '';

    if (q && !name.toLowerCase().includes(q) && !doc.toLowerCase().includes(q)) return;

    results.push({ id, name, doc, category, categoryLabel });
  });

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
});

const openInChecklist = (procId) => {
  selectedProcessId.value = procId;
  activeTab.value = 'checklist';
};
</script>

<template>
  <div class="insights-wrapper">
    <!-- Top Tabs -->
    <div class="insights-header">
      <div class="tab-bar">
        <button :class="['tab-btn', { active: activeTab === 'checklist' }]" @click="activeTab = 'checklist'">
          📋 Process Checklist (SIPOC)
        </button>
        <button :class="['tab-btn', { active: activeTab === 'hotspots' }]" @click="activeTab = 'hotspots'">
          🔥 Structural Hotspots
        </button>
        <button :class="['tab-btn', { active: activeTab === 'dictionary' }]" @click="activeTab = 'dictionary'">
          🔍 Dictionary & Search
        </button>
      </div>
    </div>

    <!-- Scrollable Workspace -->
    <div class="insights-body">

      <!-- TAB 1: PROCESS CHECKLIST -->
      <div v-if="activeTab === 'checklist'" class="tab-panel">
        <div class="checklist-toolbar">
          <div class="process-picker">
            <label>Inspect & Tailor Process:</label>
            <SearchableSelect
              v-model="selectedProcessId"
              :options="processOptions"
              :multiple="false"
              placeholder="Select a process..."
            />
          </div>
          <button v-if="processDetails" class="export-md-btn" @click="exportChecklistMarkdown">
            📝 Export Checklist (.md)
          </button>
        </div>

        <div v-if="processDetails" class="process-sheet">
          <div class="process-hero" :style="{ borderLeft: `5px solid ${processDetails.color}` }">
            <span class="group-badge" :style="{ background: processDetails.color }">{{ processDetails.group }}</span>
            <h2>{{ processDetails.name }}</h2>
            <p>{{ processDetails.doc }}</p>
          </div>

          <div class="sipoc-grid">
            <!-- Inputs -->
            <div class="sipoc-card">
              <h3>Inputs ({{ processDetails.inputs.length }})</h3>
              <p class="card-hint">Uncheck inputs unavailable in your organisation.</p>
              <div v-if="processDetails.inputs.length === 0" class="empty-note">No direct inputs in active graph.</div>
              <ul class="check-list">
                <li v-for="item in processDetails.inputs" :key="item.id" :class="{ unchecked: !isChecked('in_' + item.id) }">
                  <label class="check-row">
                    <input type="checkbox" :checked="isChecked('in_' + item.id)" @change="toggleCheck('in_' + item.id)" />
                    <div class="check-text">
                      <span class="item-name">{{ item.name }}</span>
                      <span v-if="item.peers.length" class="peer-note">From: {{ item.peers.join(', ') }}</span>
                    </div>
                  </label>
                </li>
              </ul>
            </div>

            <!-- Internal Activities -->
            <div class="sipoc-card">
              <h3>Internal Activities ({{ processDetails.activities.length }})</h3>
              <p class="card-hint">Standard ISO 15288 sub-activities for this process.</p>
              <div v-if="processDetails.activities.length === 0" class="empty-note">No internal activities modelled.</div>
              <ul class="check-list">
                <li v-for="act in processDetails.activities" :key="act.id" :class="{ unchecked: !isChecked('act_' + act.id) }">
                  <label class="check-row">
                    <input type="checkbox" :checked="isChecked('act_' + act.id)" @change="toggleCheck('act_' + act.id)" />
                    <div class="check-text">
                      <span class="item-name">{{ act.name }}</span>
                    </div>
                  </label>
                </li>
              </ul>
            </div>

            <!-- Outputs with Live Downstream Impact -->
            <div class="sipoc-card">
              <h3>Outputs ({{ processDetails.outputs.length }})</h3>
              <p class="card-hint">Uncheck an output to see which downstream processes lose it.</p>
              <div v-if="processDetails.outputs.length === 0" class="empty-note">No direct outputs in active graph.</div>
              <ul class="check-list">
                <li v-for="item in processDetails.outputs" :key="item.id" :class="{ unchecked: !isChecked('out_' + item.id) }">
                  <label class="check-row">
                    <input type="checkbox" :checked="isChecked('out_' + item.id)" @change="toggleCheck('out_' + item.id)" />
                    <div class="check-text">
                      <span class="item-name">{{ item.name }}</span>
                      <span v-if="item.peers.length && isChecked('out_' + item.id)" class="peer-note">
                        Used by: {{ item.peers.join(', ') }}
                      </span>
                      <div v-if="!isChecked('out_' + item.id) && item.peers.length" class="impact-alert">
                        ⚠ Missing input for: {{ item.peers.join(', ') }}
                      </div>
                    </div>
                  </label>
                </li>
              </ul>
            </div>
          </div>

          <!-- Controls & Enablers strip -->
          <div class="meta-strip">
            <div class="meta-box">
              <h4>Controls ({{ processDetails.controls.length }})</h4>
              <div v-if="processDetails.controls.length === 0" class="empty-note">
                Enable "Inherit Controls" in the sidebar to view inherited process controls.
              </div>
              <div v-else class="chip-wrap">
                <span v-for="c in processDetails.controls" :key="c.id" class="meta-chip">{{ c.name }}</span>
              </div>
            </div>
            <div class="meta-box">
              <h4>Enablers ({{ processDetails.enables.length }})</h4>
              <div v-if="processDetails.enables.length === 0" class="empty-note">
                Enable "Inherit Enables" in the sidebar to view inherited process enablers.
              </div>
              <div v-else class="chip-wrap">
                <span v-for="e in processDetails.enables" :key="e.id" class="meta-chip">{{ e.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: STRUCTURAL HOTSPOTS -->
      <div v-else-if="activeTab === 'hotspots'" class="tab-panel">
        <div class="hotspot-grid">
          <!-- Hub Artefacts -->
          <div class="hotspot-card">
            <h3>🏆 Top Hub Artefacts (Highest Coupling)</h3>
            <p class="card-hint">Artefacts touched by the most processes — prime candidates for strict configuration & version control.</p>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Artefact</th>
                  <th>Writers</th>
                  <th>Readers</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="hub in hotspots.hubs" :key="hub.id">
                  <td class="bold-cell">{{ hub.name }}</td>
                  <td :title="hub.writers.join(', ')">{{ hub.writers.length }}</td>
                  <td :title="hub.readers.join(', ')">{{ hub.readers.length }}</td>
                  <td><span class="count-pill">{{ hub.total }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Shared Outputs -->
          <div class="hotspot-card">
            <h3>⚠ Shared Outputs ({{ hotspots.sharedOutputs.length }})</h3>
            <p class="card-hint">Artefacts written by multiple processes — high risk of ambiguous ownership.</p>
            <div v-if="hotspots.sharedOutputs.length === 0" class="empty-note">No shared outputs found.</div>
            <ul class="hotspot-list">
              <li v-for="so in hotspots.sharedOutputs" :key="so.id" class="hotspot-item">
                <div class="hotspot-item-title">
                  <span>{{ so.name }}</span>
                  <span class="warn-pill">{{ so.writers.length }} producers</span>
                </div>
                <div class="hotspot-item-sub">Written by: {{ so.writers.join(', ') }}</div>
              </li>
            </ul>
          </div>

          <!-- Feedback Loops -->
          <div class="hotspot-card full-width">
            <h3>🔄 Direct Process Feedback Loops ({{ hotspots.feedbackLoops.length }})</h3>
            <p class="card-hint">Process pairs exchanging artefacts in both directions — iterative handoffs rather than waterfall stages.</p>
            <div v-if="hotspots.feedbackLoops.length === 0" class="empty-note">No direct mutual feedback loops detected.</div>
            <div class="loops-grid">
              <div v-for="loop in hotspots.feedbackLoops" :key="loop.id" class="loop-card">
                <div class="loop-title">{{ loop.processA }} ⇄ {{ loop.processB }}</div>
                <div class="loop-dir"><strong>→</strong> {{ loop.aToB.join(', ') }}</div>
                <div class="loop-dir"><strong>←</strong> {{ loop.bToA.join(', ') }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: DICTIONARY & DOC SEARCH -->
      <div v-else-if="activeTab === 'dictionary'" class="tab-panel">
        <div class="dict-toolbar">
          <input
            type="text"
            v-model="dictQuery"
            class="dict-search"
            placeholder="Search across all process names, artefacts, and ISO 15288 descriptions (e.g. baseline, interface, waiver)..."
          />
          <div class="dict-filters">
            <button :class="['filter-pill', { active: dictFilter === 'all' }]" @click="dictFilter = 'all'">All</button>
            <button :class="['filter-pill', { active: dictFilter === 'process' }]" @click="dictFilter = 'process'">Processes</button>
            <button :class="['filter-pill', { active: dictFilter === 'activity' }]" @click="dictFilter = 'activity'">Activities</button>
            <button :class="['filter-pill', { active: dictFilter === 'object' }]" @click="dictFilter = 'object'">Artefacts</button>
          </div>
          <span class="dict-count">{{ dictionaryItems.length }} match(es)</span>
        </div>

        <div class="dict-list">
          <div v-for="item in dictionaryItems" :key="item.id" class="dict-card">
            <div class="dict-card-top">
              <div>
                <span :class="['cat-badge', item.category]">{{ item.categoryLabel }}</span>
                <h4>{{ item.name }}</h4>
              </div>
              <button v-if="item.category === 'process'" class="jump-btn" @click="openInChecklist(item.id)">
                Open Checklist →
              </button>
            </div>
            <p class="dict-doc">{{ item.doc || 'No documentation text in the XML model.' }}</p>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.insights-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #f8f9fb;
  overflow: hidden;
}

.insights-header {
  flex-shrink: 0;
  background: #ffffff;
  border-bottom: 1px solid #e0e4e8;
  padding: 10px 20px;
}

.tab-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tab-btn {
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid #d0d7de;
  background: #f6f8fa;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.tab-btn:hover { background: #eaeef2; }
.tab-btn.active {
  background: #4CAF50;
  color: #ffffff;
  border-color: #4CAF50;
}

.insights-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
}

.tab-panel {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* Checklist Tab */
.checklist-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  background: #ffffff;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid #e0e4e8;
}
.process-picker {
  flex: 1;
  min-width: 260px;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}
.export-md-btn {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.export-md-btn:hover { background: #f1f5f9; }

.process-hero {
  background: #ffffff;
  padding: 18px 20px;
  border-radius: 8px;
  border: 1px solid #e0e4e8;
  margin-bottom: 16px;
}
.group-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 8px;
}
.process-hero h2 { margin: 0 0 8px 0; font-size: 20px; color: #1e293b; }
.process-hero p { margin: 0; font-size: 14px; line-height: 1.55; color: #475569; }

.sipoc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.sipoc-card {
  background: #ffffff;
  border: 1px solid #e0e4e8;
  border-radius: 8px;
  padding: 16px;
}
.sipoc-card h3 { margin: 0 0 4px 0; font-size: 15px; color: #1e293b; }
.card-hint { margin: 0 0 12px 0; font-size: 12px; color: #64748b; }
.empty-note { font-size: 12px; color: #94a3b8; font-style: italic; }

.check-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.check-list li {
  padding: 8px 10px;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid #edf2f7;
}
.check-list li.unchecked {
  background: #fff5f5;
  border-color: #fed7d7;
}
.check-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}
.check-row input { margin-top: 3px; }
.check-text { display: flex; flex-direction: column; gap: 3px; }
.item-name { font-size: 13px; font-weight: 600; color: #1e293b; }
.unchecked .item-name { text-decoration: line-through; color: #94a3b8; }
.peer-note { font-size: 11px; color: #64748b; }
.impact-alert {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 600;
  color: #c53030;
  background: #ffe5e5;
  padding: 3px 7px;
  border-radius: 4px;
}

.meta-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}
.meta-box {
  background: #ffffff;
  border: 1px solid #e0e4e8;
  border-radius: 8px;
  padding: 14px 16px;
}
.meta-box h4 { margin: 0 0 10px 0; font-size: 13px; color: #475569; text-transform: uppercase; }
.chip-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
.meta-chip {
  font-size: 12px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 3px 9px;
  border-radius: 12px;
}

/* Hotspots Tab */
.hotspot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 16px;
}
.hotspot-card {
  background: #ffffff;
  border: 1px solid #e0e4e8;
  border-radius: 8px;
  padding: 16px;
}
.hotspot-card.full-width { grid-column: 1 / -1; }
.hotspot-card h3 { margin: 0 0 4px 0; font-size: 15px; color: #1e293b; }

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.data-table th, .data-table td {
  padding: 7px 8px;
  border-bottom: 1px solid #edf2f7;
  text-align: left;
}
.data-table th { color: #64748b; font-weight: 600; background: #f8fafc; }
.bold-cell { font-weight: 600; color: #1e293b; }
.count-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  background: #e8f5e9;
  color: #2e7d32;
  font-weight: 700;
}

.hotspot-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 440px;
  overflow-y: auto;
}
.hotspot-item {
  padding: 9px 11px;
  border-radius: 6px;
  background: #fffaf0;
  border: 1px solid #feebc8;
}
.hotspot-item-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}
.warn-pill {
  font-size: 11px;
  background: #ed8936;
  color: #ffffff;
  padding: 2px 7px;
  border-radius: 10px;
  flex-shrink: 0;
}
.hotspot-item-sub { margin-top: 4px; font-size: 11px; color: #744210; }

.loops-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}
.loop-card {
  padding: 10px 12px;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 12px;
}
.loop-title { font-weight: 700; color: #1e293b; margin-bottom: 6px; }
.loop-dir { color: #475569; margin-bottom: 3px; line-height: 1.4; }

/* Dictionary Tab */
.dict-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  background: #ffffff;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid #e0e4e8;
}
.dict-search {
  flex: 1;
  min-width: 240px;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.dict-search:focus { border-color: #4CAF50; }
.dict-filters { display: flex; gap: 6px; }
.filter-pill {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 14px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
}
.filter-pill.active {
  background: #4CAF50;
  color: #ffffff;
  border-color: #4CAF50;
}
.dict-count { font-size: 12px; color: #64748b; font-weight: 600; }

.dict-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dict-card {
  background: #ffffff;
  border: 1px solid #e0e4e8;
  border-radius: 8px;
  padding: 14px 16px;
}
.dict-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 6px;
}
.dict-card h4 { margin: 4px 0 0 0; font-size: 15px; color: #1e293b; }
.cat-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 10px;
}
.cat-badge.process { background: #fff2cc; color: #8a5a00; }
.cat-badge.activity { background: #e3f2fd; color: #1565c0; }
.cat-badge.object { background: #d5e8d4; color: #2e7d32; }
.jump-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  flex-shrink: 0;
}
.jump-btn:hover { background: #e2e8f0; }
.dict-doc { margin: 0; font-size: 13px; line-height: 1.5; color: #475569; }
</style>
