<script setup>
import { ref, computed, watch } from 'vue';
import { store, graphData } from '../store/graphStore.js';
import {
  groupOrder,
  groupShortLabels,
  groupColors,
  getProcessGroup,
  getProcessOrderIndex
} from '../core/iso15288Groups.js';

// Scope: 'full' (entire ISO 15288 model) or 'diagram' (processes from current scenario)
const scope = ref(store.renderPayload.nodes.size > 0 ? 'diagram' : 'full');

const availableGroups = ['Technical', 'Technical Management', 'Organizational Project-Enabling', 'Agreement', 'Tailoring', 'Others'];
const activeGroups = ref(new Set(['Technical', 'Technical Management', 'Organizational Project-Enabling', 'Agreement', 'Tailoring']));

const hoveredCell = ref({ row: -1, col: -1 });
const selectedCell = ref(null);

// Auto-switch scope when user generates a new diagram
watch(() => store.renderPayload.nodes.size, (newSize) => {
  if (newSize > 0) scope.value = 'diagram';
  else scope.value = 'full';
  selectedCell.value = null;
});

const toggleGroup = (g) => {
  const next = new Set(activeGroups.value);
  if (next.has(g)) {
    if (next.size > 1) next.delete(g);
  } else {
    next.add(g);
  }
  activeGroups.value = next;
  selectedCell.value = null;
};

// Ordered list of processes to display as rows & columns
const matrixProcesses = computed(() => {
  if (!store.isLoaded) return [];
  const gActive = graphData.gActive();
  if (!gActive) return [];

  let candidateIds = [];
  if (scope.value === 'diagram' && store.renderPayload.nodes.size > 0) {
    candidateIds = Array.from(store.renderPayload.nodes).filter((id) => {
      if (!gActive.hasNode(id)) return false;
      const type = gActive.getNodeAttribute(id, 'type') || '';
      return type.includes('BusinessFunction');
    });
    // Fallback to all processes if diagram only has non-function nodes
    if (candidateIds.length === 0) {
      candidateIds = Object.keys(store.processes);
    }
  } else {
    candidateIds = Object.keys(store.processes);
  }

  return candidateIds
    .map((id) => {
      const name = store.processes[id] || (gActive.hasNode(id) ? gActive.getNodeAttribute(id, 'name') : 'Unknown');
      const group = getProcessGroup(name);
      const doc = gActive.hasNode(id) ? gActive.getNodeAttribute(id, 'doc') || '' : '';
      return {
        id,
        name,
        group,
        shortGroup: groupShortLabels[group] || 'Other',
        color: groupColors[group] || '#546e7a',
        doc,
        orderIdx: getProcessOrderIndex(name)
      };
    })
    .filter((p) => scope.value === 'diagram' || activeGroups.value.has(p.group))
    .sort((a, b) => {
      const gA = groupOrder.indexOf(a.group);
      const gB = groupOrder.indexOf(b.group);
      if (gA !== gB) return gA - gB;
      if (a.orderIdx !== b.orderIdx) return a.orderIdx - b.orderIdx;
      return a.name.localeCompare(b.name);
    });
});

/**
 * Computes exchanged Business Objects between every pair (producer -> consumer).
 * Respects store.settings.useHierarchy (2 steps direct, up to 4 steps with object hierarchy).
 */
const matrixData = computed(() => {
  const procs = matrixProcesses.value;
  const gActive = graphData.gActive();
  if (!gActive || procs.length === 0) return { grid: [], maxCount: 1, totalLinks: 0, feedbackLinks: 0 };

  const procIdSet = new Set(procs.map((p) => p.id));
  const useHierarchy = store.settings.useHierarchy;

  // Map: producerId -> Map(consumerId -> Map(objectId -> { id, name, doc, systemic }))
  const exchangeMap = new Map();
  procs.forEach((p) => exchangeMap.set(p.id, new Map()));

  const isProcessNode = (id) => {
    const t = gActive.getNodeAttribute(id, 'type') || '';
    return t.includes('BusinessFunction') || t.includes('BusinessProcess');
  };

  // For each producer process, find all reachable consumer processes through Business Objects
  procs.forEach((producer) => {
    const prodMap = exchangeMap.get(producer.id);

    // Step 1: Producer -> Object (Write / Output)
    gActive.forEachOutEdge(producer.id, (edge1, attr1, u1, obj1) => {
      if (attr1.access === 'hierarchy_reverse') return;
      if (isProcessNode(obj1)) return;

      const isSys1 = ['Controls', 'Enables', 'Situational'].includes(attr1.subclass || '');

      // Collect reachable objects from obj1 if hierarchy is enabled (e.g., Specific Report -> Project Reports)
      const objectQueue = [{ id: obj1, depth: 0, systemic: isSys1, via: obj1 }];
      const visitedObjs = new Set([obj1]);

      while (objectQueue.length > 0) {
        const curr = objectQueue.shift();

        gActive.forEachOutEdge(curr.id, (edge2, attr2, u2, target) => {
          if (attr2.access === 'hierarchy_reverse') return;
          const isSys2 = curr.systemic || ['Controls', 'Enables', 'Situational'].includes(attr2.subclass || '');

          if (procIdSet.has(target) && target !== producer.id) {
            if (!prodMap.has(target)) prodMap.set(target, new Map());
            const objMap = prodMap.get(target);
            if (!objMap.has(obj1)) {
              objMap.set(obj1, {
                id: obj1,
                name: gActive.getNodeAttribute(obj1, 'name') || 'Unknown',
                doc: gActive.getNodeAttribute(obj1, 'doc') || 'Description is missing in the model.',
                systemic: isSys2,
                viaHierarchy: curr.id !== obj1 ? (gActive.getNodeAttribute(curr.id, 'name') || '') : ''
              });
            }
          } else if (useHierarchy && curr.depth < 2 && !isProcessNode(target) && !visitedObjs.has(target)) {
            const rType = attr2.type || '';
            if (['Specialization', 'Aggregation', 'Composition'].some((x) => rType.includes(x))) {
              visitedObjs.add(target);
              objectQueue.push({ id: target, depth: curr.depth + 1, systemic: isSys2, via: target });
            }
          }
        });
      }
    });
  });

  let maxCount = 1;
  let totalLinks = 0;
  let feedbackLinks = 0;

  const grid = procs.map((rowProc, rIdx) => {
    const prodMap = exchangeMap.get(rowProc.id);
    return procs.map((colProc, cIdx) => {
      if (rIdx === cIdx) {
        return { isDiagonal: true, items: [], count: 0, isFeedback: false };
      }
      const objMap = prodMap?.get(colProc.id);
      const items = objMap ? Array.from(objMap.values()).sort((a, b) => a.name.localeCompare(b.name)) : [];
      const count = items.length;
      const isFeedback = rIdx > cIdx;
      if (count > 0) {
        totalLinks++;
        if (isFeedback) feedbackLinks++;
        if (count > maxCount) maxCount = count;
      }
      return {
        isDiagonal: false,
        items,
        count,
        isFeedback,
        producer: rowProc,
        consumer: colProc
      };
    });
  });

  return { grid, maxCount, totalLinks, feedbackLinks };
});

const getCellStyle = (cell) => {
  if (cell.isDiagonal || cell.count === 0) return {};
  const intensity = Math.min(1, 0.22 + (cell.count / Math.max(matrixData.value.maxCount, 1)) * 0.78);
  if (cell.isFeedback) {
    return {
      backgroundColor: `rgba(230, 126, 34, ${intensity.toFixed(2)})`,
      color: intensity > 0.55 ? '#ffffff' : '#6e3b09'
    };
  }
  return {
    backgroundColor: `rgba(46, 125, 50, ${intensity.toFixed(2)})`,
    color: intensity > 0.55 ? '#ffffff' : '#1b5e20'
  };
};

const selectCell = (cell, rIdx, cIdx) => {
  if (cell.isDiagonal) {
    const p = matrixProcesses.value[rIdx];
    selectedCell.value = {
      type: 'process',
      process: p
    };
    return;
  }
  if (cell.count === 0) {
    selectedCell.value = null;
    return;
  }
  selectedCell.value = {
    type: 'exchange',
    ...cell
  };
};

const exportCsv = () => {
  const procs = matrixProcesses.value;
  if (procs.length === 0) return;

  const escapeCsv = (val) => `"${String(val).replace(/"/g, '""')}"`;
  const header = ['Producer \ Consumer', ...procs.map((p) => p.name)].map(escapeCsv).join(',');

  const rows = matrixData.value.grid.map((rowCells, rIdx) => {
    const rowTitle = escapeCsv(procs[rIdx].name);
    const values = rowCells.map((cell) => {
      if (cell.isDiagonal) return '"-"';
      if (cell.count === 0) return '""';
      return escapeCsv(cell.items.map((i) => i.name).join('; '));
    });
    return [rowTitle, ...values].join(',');
  });

  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ISO15288_N2_Matrix_${scope.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="n2-wrapper">
    <!-- Top Controls Bar -->
    <div class="n2-toolbar">
      <div class="n2-toolbar-left">
        <div class="scope-switch">
          <button
            :class="['scope-btn', { active: scope === 'full' }]"
            @click="scope = 'full'"
          >
            Full ISO 15288 Model
          </button>
          <button
            :class="['scope-btn', { active: scope === 'diagram' }]"
            :disabled="store.renderPayload.nodes.size === 0"
            @click="scope = 'diagram'"
            title="Show only processes from the active analysis scenario"
          >
            Current Diagram
          </button>
        </div>

        <div v-if="scope === 'full'" class="group-filters">
          <button
            v-for="g in availableGroups"
            :key="g"
            :class="['group-pill', { active: activeGroups.has(g) }]"
            :style="activeGroups.has(g) ? { borderColor: groupColors[g], color: groupColors[g], background: '#ffffff' } : {}"
            @click="toggleGroup(g)"
          >
            <span class="dot" :style="{ background: groupColors[g] }"></span>
            {{ groupShortLabels[g] }}
          </button>
        </div>
      </div>

      <div class="n2-toolbar-right">
        <span class="n2-stat">
          <strong>{{ matrixProcesses.length }}</strong> processes ·
          <strong>{{ matrixData.totalLinks }}</strong> interfaces
          (<span class="fb-text">{{ matrixData.feedbackLinks }} feedback</span>)
        </span>
        <button class="csv-btn" @click="exportCsv" :disabled="matrixProcesses.length === 0">
          📊 Export CSV
        </button>
      </div>
    </div>

    <!-- Main Body: Scrollable Matrix + Detail Inspector -->
    <div class="n2-body">
      <div class="n2-scroll-area">
        <div v-if="matrixProcesses.length === 0" class="n2-empty">
          No processes available for the current filter.
        </div>

        <table v-else class="n2-table" @mouseleave="hoveredCell = { row: -1, col: -1 }">
          <thead>
            <tr>
              <th class="corner-cell">
                <div class="corner-labels">
                  <span class="corner-col">Consumer →</span>
                  <span class="corner-row">↓ Producer</span>
                </div>
              </th>
              <th
                v-for="(colProc, cIdx) in matrixProcesses"
                :key="colProc.id"
                :class="['col-header', { highlighted: hoveredCell.col === cIdx }]"
                :title="`${colProc.name} (${colProc.group})`"
              >
                <div class="col-header-inner">
                  <span class="col-index" :style="{ color: colProc.color }">{{ cIdx + 1 }}</span>
                  <span class="col-name">{{ colProc.name }}</span>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="(rowProc, rIdx) in matrixProcesses"
              :key="rowProc.id"
              :class="{ 'row-highlighted': hoveredCell.row === rIdx }"
            >
              <th
                class="row-header"
                :style="{ borderLeft: `4px solid ${rowProc.color}` }"
                :title="`${rowProc.name} (${rowProc.group})`"
                @click="selectCell({ isDiagonal: true }, rIdx, rIdx)"
              >
                <span class="row-index">{{ rIdx + 1 }}.</span>
                <span class="row-name">{{ rowProc.name }}</span>
              </th>

              <td
                v-for="(cell, cIdx) in matrixData.grid[rIdx]"
                :key="cIdx"
                :class="[
                  'matrix-cell',
                  {
                    diagonal: cell.isDiagonal,
                    clickable: cell.isDiagonal || cell.count > 0,
                    crosshair: hoveredCell.row === rIdx || hoveredCell.col === cIdx,
                    selected:
                      selectedCell &&
                      selectedCell.type === 'exchange' &&
                      selectedCell.producer.id === rowProc.id &&
                      selectedCell.consumer.id === matrixProcesses[cIdx].id
                  }
                ]"
                :style="getCellStyle(cell)"
                @mouseenter="hoveredCell = { row: rIdx, col: cIdx }"
                @click="selectCell(cell, rIdx, cIdx)"
                :title="
                  cell.isDiagonal
                    ? rowProc.name
                    : cell.count > 0
                      ? `${rowProc.name} → ${matrixProcesses[cIdx].name}: ${cell.count} artefact(s)`
                      : ''
                "
              >
                <span v-if="cell.isDiagonal" class="diag-mark">{{ rIdx + 1 }}</span>
                <span v-else-if="cell.count > 0" class="cell-count">{{ cell.count }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Right Detail Drawer -->
      <div v-if="selectedCell" class="n2-inspector">
        <button class="inspector-close" @click="selectedCell = null" aria-label="Close">&times;</button>

        <template v-if="selectedCell.type === 'process'">
          <span class="badge" :style="{ background: selectedCell.process.color }">
            {{ selectedCell.process.group }}
          </span>
          <h3>{{ selectedCell.process.name }}</h3>
          <p class="inspector-doc">{{ selectedCell.process.doc || 'Description is missing in the model.' }}</p>
        </template>

        <template v-else>
          <span :class="['badge', selectedCell.isFeedback ? 'badge-feedback' : 'badge-forward']">
            {{ selectedCell.isFeedback ? 'Feedback Loop (Below Diagonal)' : 'Feedforward Flow (Above Diagonal)' }}
          </span>
          <div class="exchange-route">
            <div class="route-node"><strong>From:</strong> {{ selectedCell.producer.name }}</div>
            <div class="route-arrow">↓</div>
            <div class="route-node"><strong>To:</strong> {{ selectedCell.consumer.name }}</div>
          </div>

          <h4>Exchanged Artefacts ({{ selectedCell.count }})</h4>
          <ul class="artefact-list">
            <li v-for="item in selectedCell.items" :key="item.id" class="artefact-card">
              <div class="artefact-header">
                <span class="artefact-name">{{ item.name }}</span>
                <span v-if="item.systemic" class="sys-tag">Systemic</span>
              </div>
              <div v-if="item.viaHierarchy" class="hierarchy-note">
                via hierarchy: <em>{{ item.viaHierarchy }}</em>
              </div>
              <p class="artefact-doc">{{ item.doc }}</p>
            </li>
          </ul>
        </template>
      </div>
    </div>

    <!-- Bottom Legend -->
    <div class="n2-legend">
      <div class="n2-legend-item">
        <span class="swatch swatch-forward"></span> Above diagonal: Feedforward (lifecycle progression)
      </div>
      <div class="n2-legend-item">
        <span class="swatch swatch-feedback"></span> Below diagonal: Feedback / iteration loop
      </div>
      <div class="n2-legend-item">
        Click any numbered cell to inspect exchanged artefacts.
      </div>
    </div>
  </div>
</template>

<style scoped>
.n2-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #f8f9fb;
  overflow: hidden;
}

.n2-toolbar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #ffffff;
  border-bottom: 1px solid #e0e4e8;
}

.n2-toolbar-left, .n2-toolbar-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.scope-switch {
  display: inline-flex;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  overflow: hidden;
}

.scope-btn {
  border: none;
  background: #f6f8fa;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #444;
  cursor: pointer;
  transition: background 0.15s;
}
.scope-btn.active {
  background: #4CAF50;
  color: #ffffff;
}
.scope-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.group-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.group-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 14px;
  border: 1px solid #d0d7de;
  background: #f0f2f5;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}
.group-pill .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.n2-stat {
  font-size: 12px;
  color: #555;
}
.fb-text {
  color: #d35400;
  font-weight: 600;
}

.csv-btn {
  background: #ffffff;
  border: 1px solid #ccc;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.csv-btn:hover:not(:disabled) {
  background: #f0f2f5;
}

.n2-body {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.n2-scroll-area {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.n2-empty {
  padding: 40px;
  text-align: center;
  color: #666;
}

.n2-table {
  border-collapse: separate;
  border-spacing: 0;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  font-size: 12px;
}

.corner-cell {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 30;
  background: #f1f5f9;
  border-right: 2px solid #cbd5e1;
  border-bottom: 2px solid #cbd5e1;
  min-width: 220px;
  padding: 8px 10px;
  vertical-align: bottom;
}

.corner-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #475569;
}
.corner-col { text-align: right; }
.corner-row { text-align: left; }

.col-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  border-bottom: 2px solid #cbd5e1;
  padding: 6px 2px;
  height: 155px;
  width: 32px;
  min-width: 32px;
  max-width: 32px;
  vertical-align: bottom;
  font-weight: 500;
}
.col-header.highlighted {
  background: #e8f0fe;
}

.col-header-inner {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  display: flex;
  align-items: center;
  gap: 4px;
  max-height: 145px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0 auto;
  font-size: 11px;
  color: #334155;
}
.col-index {
  font-weight: 700;
}

.row-header {
  position: sticky;
  left: 0;
  z-index: 15;
  background: #ffffff;
  border-right: 2px solid #cbd5e1;
  border-bottom: 1px solid #e2e8f0;
  padding: 5px 10px;
  text-align: left;
  font-weight: 500;
  color: #1e293b;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
tr.row-highlighted .row-header {
  background: #e8f0fe;
}
.row-index {
  display: inline-block;
  width: 22px;
  color: #64748b;
  font-weight: 600;
}

.matrix-cell {
  width: 32px;
  height: 30px;
  min-width: 32px;
  text-align: center;
  vertical-align: middle;
  border-right: 1px solid #edf2f7;
  border-bottom: 1px solid #edf2f7;
  font-weight: 700;
  font-size: 11px;
  transition: transform 0.1s;
}
.matrix-cell.crosshair {
  box-shadow: inset 0 0 0 1px rgba(21, 101, 192, 0.25);
}
.matrix-cell.diagonal {
  background: #eef2f6;
  color: #64748b;
  font-weight: 600;
}
.matrix-cell.clickable {
  cursor: pointer;
}
.matrix-cell.selected {
  outline: 2px solid #1565c0;
  outline-offset: -2px;
}

/* Inspector Drawer */
.n2-inspector {
  flex-shrink: 0;
  width: 340px;
  height: 100%;
  background: #ffffff;
  border-left: 1px solid #d0d7de;
  padding: 18px;
  overflow-y: auto;
  position: relative;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.05);
}

.inspector-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  font-size: 22px;
  color: #888;
  cursor: pointer;
  border-radius: 4px;
}
.inspector-close:hover {
  background: #f0f0f0;
  color: #222;
}

.badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 10px;
}
.badge-forward { background: #2e7d32; }
.badge-feedback { background: #d35400; }

.n2-inspector h3 {
  margin: 0 0 10px 0;
  padding-right: 28px;
  font-size: 16px;
  color: #1e293b;
}
.n2-inspector h4 {
  margin: 16px 0 10px 0;
  font-size: 13px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.inspector-doc {
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}

.exchange-route {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
}
.route-arrow {
  text-align: center;
  color: #64748b;
  font-weight: bold;
  margin: 4px 0;
}

.artefact-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.artefact-card {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px;
  background: #ffffff;
}
.artefact-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.artefact-name {
  font-weight: 600;
  font-size: 13px;
  color: #1e293b;
}
.sys-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  background: #eceff1;
  color: #546e7a;
}
.hierarchy-note {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
}
.artefact-doc {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: #555;
}

.n2-legend {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
  padding: 8px 16px;
  background: #ffffff;
  border-top: 1px solid #e0e4e8;
  font-size: 12px;
  color: #555;
}
.n2-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  display: inline-block;
}
.swatch-forward { background: rgba(46, 125, 50, 0.7); }
.swatch-feedback { background: rgba(230, 126, 34, 0.75); }
</style>
