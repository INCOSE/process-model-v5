<script setup>
import { ref, computed, watch } from 'vue';
import { store, graphData } from '../store/graphStore.js';
import {
  groupShortLabels,
  groupColors,
  getProcessGroup,
  getProcessOrderIndex
} from '../core/iso15288Groups.js';

// Canonical group orders
const HANDBOOK_GROUP_ORDER = [
  'External',
  'Agreement',
  'Organizational Project-Enabling',
  'Technical Management',
  'Technical',
  'Tailoring',
  'Others'
];

const DEFAULT_GROUP_ORDER = [
  'Technical',
  'Technical Management',
  'Organizational Project-Enabling',
  'Agreement',
  'Tailoring',
  'External',
  'Others'
];

// Scope: 'full' (entire model) or 'diagram' (processes from active slice)
const scope = ref(store.renderPayload.nodes.size > 0 ? 'diagram' : 'full');

// Dynamic user-reorderable group order
const customGroupOrder = ref([...HANDBOOK_GROUP_ORDER]);
const useHandbookOrder = ref(true);

// Virtual Buses toggle (CTL / ENAB / SIT)
const useVirtualBuses = ref(false);

// Drag-and-drop state for group pills
const draggedGroup = ref(null);
const dragOverGroup = ref(null);

// Active visible groups (External enabled by default; Others enabled if custom model has unmapped processes)
const activeGroups = ref(
  new Set([
    'External',
    'Agreement',
    'Organizational Project-Enabling',
    'Technical Management',
    'Technical',
    'Tailoring',
    'Others'
  ])
);

const hoveredCell = ref({ row: -1, col: -1 });
const selectedCell = ref(null);

// Detect which groups actually exist in the currently loaded model (handles custom XML models cleanly)
const presentGroupsSet = computed(() => {
  const s = new Set();
  Object.values(store.processes || {}).forEach((name) => {
    s.add(getProcessGroup(name));
  });
  return s;
});

const isStandardIsoModel = computed(() => {
  return (
    presentGroupsSet.value.has('Technical') ||
    presentGroupsSet.value.has('Technical Management') ||
    presentGroupsSet.value.has('Agreement')
  );
});

const visibleGroupPills = computed(() => {
  return customGroupOrder.value.filter((g) => presentGroupsSet.value.has(g));
});

// Check whether any Meta-Level Inheritance flag is enabled in Global Model Settings
const hasAnyMetaInheritance = computed(() => {
  const s = store.settings;
  return Boolean(s.includeControls || s.includeEnables || s.includeSituational);
});

// Automatically disable Virtual Buses if all meta-inheritance flags are turned off
watch(hasAnyMetaInheritance, (enabled) => {
  if (!enabled) {
    useVirtualBuses.value = false;
  }
});

// Auto-switch scope when user generates or clears a slice
watch(
  () => store.renderPayload.nodes.size,
  (newSize) => {
    if (newSize > 0) scope.value = 'diagram';
    else scope.value = 'full';
    selectedCell.value = null;
  }
);

// Handbook order checkbox handler
const toggleHandbookOrder = (checked) => {
  useHandbookOrder.value = checked;
  if (checked) {
    customGroupOrder.value = [...HANDBOOK_GROUP_ORDER];
  } else {
    customGroupOrder.value = [...DEFAULT_GROUP_ORDER];
  }
  selectedCell.value = null;
};

// Group visibility toggle
const toggleGroup = (g) => {
  const next = new Set(activeGroups.value);
  if (next.has(g)) {
    const currentlyVisible = visibleGroupPills.value.filter((x) => next.has(x));
    if (currentlyVisible.length > 1) next.delete(g);
  } else {
    next.add(g);
  }
  activeGroups.value = next;
  selectedCell.value = null;
};

// Drag-and-drop handlers for group pills
const onDragStart = (g, event) => {
  draggedGroup.value = g;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', g);
  }
};

const onDragOver = (g, event) => {
  event.preventDefault();
  if (draggedGroup.value && draggedGroup.value !== g) {
    dragOverGroup.value = g;
  }
};

const onDragLeave = (g) => {
  if (dragOverGroup.value === g) dragOverGroup.value = null;
};

const onDrop = (targetGroup, event) => {
  event.preventDefault();
  const srcGroup = draggedGroup.value;
  draggedGroup.value = null;
  dragOverGroup.value = null;

  if (!srcGroup || srcGroup === targetGroup) return;

  const list = [...customGroupOrder.value];
  const fromIdx = list.indexOf(srcGroup);
  const toIdx = list.indexOf(targetGroup);
  if (fromIdx === -1 || toIdx === -1) return;

  list.splice(fromIdx, 1);
  list.splice(toIdx, 0, srcGroup);
  customGroupOrder.value = list;

  // Uncheck Handbook order if custom order diverges from Handbook order
  const matchesHandbook = list.every((g, i) => g === HANDBOOK_GROUP_ORDER[i]);
  useHandbookOrder.value = matchesHandbook;
  selectedCell.value = null;
};

const onDragEnd = () => {
  draggedGroup.value = null;
  dragOverGroup.value = null;
};

// Active virtual buses (only for enabled meta-inheritance categories)
const activeVirtualBuses = computed(() => {
  if (!useVirtualBuses.value || !hasAnyMetaInheritance.value) return [];
  const buses = [];
  if (store.settings.includeControls) {
    buses.push({
      id: '__bus_controls__',
      busTag: 'Controls',
      name: 'Controls (CTL)',
      group: 'Virtual Bus',
      shortGroup: 'CTL',
      color: '#b45309',
      doc: 'Virtual bus aggregating inherited Controls artefacts (as in INCOSE SE Handbook v.5 Figure D.1).',
      isVirtualBus: true
    });
  }
  if (store.settings.includeEnables) {
    buses.push({
      id: '__bus_enables__',
      busTag: 'Enables',
      name: 'Enables (ENAB)',
      group: 'Virtual Bus',
      shortGroup: 'ENAB',
      color: '#0284c7',
      doc: 'Virtual bus aggregating inherited Enablers artefacts (as in INCOSE SE Handbook v.5 Figure D.1).',
      isVirtualBus: true
    });
  }
  if (store.settings.includeSituational) {
    buses.push({
      id: '__bus_situational__',
      busTag: 'Situational',
      name: 'Situational (SIT)',
      group: 'Virtual Bus',
      shortGroup: 'SIT',
      color: '#7c3aed',
      doc: 'Virtual bus aggregating Situational inputs and outputs (as in INCOSE SE Handbook v.5 Figure D.1).',
      isVirtualBus: true
    });
  }
  return buses;
});

// Ordered list of real processes + optional virtual buses
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
    if (candidateIds.length === 0) {
      candidateIds = Object.keys(store.processes);
    }
  } else {
    candidateIds = Object.keys(store.processes);
  }

  const orderArr = customGroupOrder.value;

  const realProcs = candidateIds
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
        orderIdx: getProcessOrderIndex(name),
        isVirtualBus: false
      };
    })
    .filter((p) => scope.value === 'diagram' || activeGroups.value.has(p.group))
    .sort((a, b) => {
      const gA = orderArr.indexOf(a.group);
      const gB = orderArr.indexOf(b.group);
      const idxA = gA === -1 ? 999 : gA;
      const idxB = gB === -1 ? 999 : gB;
      if (idxA !== idxB) return idxA - idxB;
      if (a.orderIdx !== b.orderIdx) return a.orderIdx - b.orderIdx;
      return a.name.localeCompare(b.name);
    });

  const buses = activeVirtualBuses.value;
  if (buses.length === 0) return realProcs;

  // Insert virtual buses right after External (matching Figure D.1: EXT -> CTL -> ENAB -> SIT -> ACQ...)
  // or at the very start if External is not the first group
  const extIdx = realProcs.findIndex((p) => p.group === 'External');
  if (extIdx === 0) {
    return [realProcs[0], ...buses, ...realProcs.slice(1)];
  }
  return [...buses, ...realProcs];
});

/**
 * Computes exchanged Business Objects between every pair (producer -> consumer).
 * When Virtual Buses are active, routes Controls / Enables / Situational exchanges
 * through their dedicated bus rows/columns instead of duplicating them across all process pairs.
 */
const matrixData = computed(() => {
  const entries = matrixProcesses.value;
  const gActive = graphData.gActive();
  if (!gActive || entries.length === 0) return { grid: [], maxCount: 1, totalLinks: 0, feedbackLinks: 0 };

  const realProcs = entries.filter((p) => !p.isVirtualBus);
  const realProcIdSet = new Set(realProcs.map((p) => p.id));
  const useHierarchy = store.settings.useHierarchy;

  const activeBusByTag = {};
  activeVirtualBuses.value.forEach((b) => {
    activeBusByTag[b.busTag] = b.id;
  });

  // Map: producerId -> Map(consumerId -> Map(objectId -> artefactRecord))
  const exchangeMap = new Map();
  entries.forEach((p) => exchangeMap.set(p.id, new Map()));

  const recordExchange = (fromId, toId, objId, tagsSet, viaHierarchyName = '') => {
    if (fromId === toId) return;
    if (!exchangeMap.has(fromId)) return;
    const prodMap = exchangeMap.get(fromId);
    if (!prodMap.has(toId)) prodMap.set(toId, new Map());
    const objMap = prodMap.get(toId);
    const existing = objMap.get(objId);

    if (!existing) {
      objMap.set(objId, {
        id: objId,
        name: gActive.getNodeAttribute(objId, 'name') || 'Unknown',
        doc: gActive.getNodeAttribute(objId, 'doc') || 'Description is missing in the model.',
        isSituational: tagsSet.has('Situational'),
        isControls: tagsSet.has('Controls'),
        isEnables: tagsSet.has('Enables'),
        viaHierarchy: viaHierarchyName
      });
    } else {
      if (tagsSet.has('Situational')) existing.isSituational = true;
      if (tagsSet.has('Controls')) existing.isControls = true;
      if (tagsSet.has('Enables')) existing.isEnables = true;
    }
  };

  const isProcessNode = (id) => {
    const t = gActive.getNodeAttribute(id, 'type') || '';
    return t.includes('BusinessFunction') || t.includes('BusinessProcess');
  };

  const getEdgeTag = (attr) => {
    const sub = attr?.subclass || attr?.name || '';
    if (sub === 'Situational' || sub === 'Controls' || sub === 'Enables') return sub;
    return '';
  };

  realProcs.forEach((producer) => {
    // Step 1: Producer -> Object (Write / Output)
    gActive.forEachOutEdge(producer.id, (edge1, attr1, u1, obj1) => {
      if (attr1.access === 'hierarchy_reverse') return;
      if (isProcessNode(obj1)) return;

      const tag1 = getEdgeTag(attr1);

      const objectQueue = [{ id: obj1, depth: 0, tags: tag1 ? [tag1] : [] }];
      const visitedObjs = new Set([obj1]);

      while (objectQueue.length > 0) {
        const curr = objectQueue.shift();

        gActive.forEachOutEdge(curr.id, (edge2, attr2, u2, target) => {
          if (attr2.access === 'hierarchy_reverse') return;
          const tag2 = getEdgeTag(attr2);
          const mergedTags = new Set(curr.tags);
          if (tag2) mergedTags.add(tag2);

          if (realProcIdSet.has(target) && target !== producer.id) {
            const viaName = curr.id !== obj1 ? (gActive.getNodeAttribute(curr.id, 'name') || '') : '';

            // Check if this exchange should be routed through an active Virtual Bus
            let routedThroughBus = false;
            ['Controls', 'Enables', 'Situational'].forEach((busTag) => {
              const busId = activeBusByTag[busTag];
              if (busId && mergedTags.has(busTag)) {
                const tagOnly = new Set([busTag]);
                recordExchange(producer.id, busId, obj1, tagOnly, viaName);
                recordExchange(busId, target, obj1, tagOnly, viaName);
                routedThroughBus = true;
              }
            });

            if (!routedThroughBus) {
              recordExchange(producer.id, target, obj1, mergedTags, viaName);
            }
          } else if (useHierarchy && curr.depth < 2 && !isProcessNode(target) && !visitedObjs.has(target)) {
            const rType = attr2.type || '';
            if (['Specialization', 'Aggregation', 'Composition'].some((x) => rType.includes(x))) {
              visitedObjs.add(target);
              objectQueue.push({ id: target, depth: curr.depth + 1, tags: Array.from(mergedTags) });
            }
          }
        });
      }
    });
  });

  let maxCount = 1;
  let totalLinks = 0;
  let feedbackLinks = 0;

  const grid = entries.map((rowProc, rIdx) => {
    const prodMap = exchangeMap.get(rowProc.id);
    return entries.map((colProc, cIdx) => {
      if (rIdx === cIdx) {
        return {
          isDiagonal: true,
          isBusCell: rowProc.isVirtualBus,
          items: [],
          count: 0,
          isFeedback: false,
          hasSituational: false,
          hasControls: false,
          hasEnables: false
        };
      }
      const objMap = prodMap?.get(colProc.id);
      const items = objMap ? Array.from(objMap.values()).sort((a, b) => a.name.localeCompare(b.name)) : [];
      const count = items.length;
      const isFeedback = rIdx > cIdx;
      const hasSituational = items.some((i) => i.isSituational);
      const hasControls = items.some((i) => i.isControls);
      const hasEnables = items.some((i) => i.isEnables);
      const isBusCell = rowProc.isVirtualBus || colProc.isVirtualBus;

      if (count > 0) {
        totalLinks++;
        if (isFeedback) feedbackLinks++;
        if (count > maxCount) maxCount = count;
      }
      return {
        isDiagonal: false,
        isBusCell,
        items,
        count,
        isFeedback,
        hasSituational,
        hasControls,
        hasEnables,
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
  if (cell.isBusCell) {
    return {
      backgroundColor: `rgba(71, 85, 105, ${(0.18 + intensity * 0.62).toFixed(2)})`,
      color: intensity > 0.45 ? '#ffffff' : '#1e293b'
    };
  }
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

const getCellTooltip = (cell, rowProc, colProc) => {
  if (cell.isDiagonal) return rowProc.name;
  if (cell.count === 0) return '';
  const tags = [];
  if (cell.hasEnables) tags.push('Enables');
  if (cell.hasSituational) tags.push('Situational');
  if (cell.hasControls) tags.push('Controls');
  const tagNote = tags.length ? ` [${tags.join(', ')}]` : '';
  return `${rowProc.name} → ${colProc.name}: ${cell.count} artefact(s)${tagNote}`;
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
      return escapeCsv(
        cell.items
          .map((i) => {
            const tags = [];
            if (i.isSituational) tags.push('Situational');
            if (i.isControls) tags.push('Controls');
            if (i.isEnables) tags.push('Enables');
            return tags.length ? `${i.name} [${tags.join(', ')}]` : i.name;
          })
          .join('; ')
      );
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
            Full Model
          </button>
          <button
            :class="['scope-btn', { active: scope === 'diagram' }]"
            :disabled="store.renderPayload.nodes.size === 0"
            @click="scope = 'diagram'"
            title="Show only processes from the active analysis slice"
          >
            Active Slice
          </button>
        </div>

        <!-- Reorderable & Toggleable Group Pills -->
        <div v-if="scope === 'full' && visibleGroupPills.length > 0" class="group-filters">
          <button
            v-for="g in visibleGroupPills"
            :key="g"
            draggable="true"
            :class="[
              'group-pill',
              {
                active: activeGroups.has(g),
                dragging: draggedGroup === g,
                'drag-over': dragOverGroup === g
              }
            ]"
            :style="activeGroups.has(g) ? { borderColor: groupColors[g], color: groupColors[g], background: '#ffffff' } : {}"
            @click="toggleGroup(g)"
            @dragstart="onDragStart(g, $event)"
            @dragover="onDragOver(g, $event)"
            @dragleave="onDragLeave(g)"
            @drop="onDrop(g, $event)"
            @dragend="onDragEnd"
            title="Click to toggle visibility · Drag left/right to reorder groups in the matrix"
          >
            <span class="dot" :style="{ background: groupColors[g] }"></span>
            {{ groupShortLabels[g] || g }}
          </button>
        </div>

        <span v-if="isStandardIsoModel" class="toolbar-divider" aria-hidden="true"></span>

        <!-- Handbook Order Toggle -->
        <label
          v-if="isStandardIsoModel"
          class="n2-checkbox"
          title="Sort groups as in INCOSE SE Handbook v.5 Figure D.1 (External → Agreement → Org → Tech Mgmt → Technical → Tailoring)"
        >
          <input
            type="checkbox"
            :checked="useHandbookOrder"
            @change="toggleHandbookOrder($event.target.checked)"
          />
          Handbook order
        </label>

        <!-- Virtual Buses (CTL / ENAB / SIT) Toggle -->
        <label
          :class="['n2-checkbox', { disabled: !hasAnyMetaInheritance }]"
          :title="
            hasAnyMetaInheritance
              ? 'Group Controls, Enables, and Situational flows into dedicated virtual bus rows/columns (as in Handbook Figure D.1)'
              : 'Enable Inherit Controls, Inherit Enables, or Inherit Situational in Global Model Settings (left panel) to use virtual buses'
          "
        >
          <input
            type="checkbox"
            v-model="useVirtualBuses"
            :disabled="!hasAnyMetaInheritance"
          />
          Virtual buses (CTL/ENAB/SIT)
        </label>
      </div>

      <div class="n2-toolbar-right">
        <span class="n2-stat">
          <strong>{{ matrixProcesses.length }}</strong> rows ·
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
                :class="['col-header', { highlighted: hoveredCell.col === cIdx, 'is-bus': colProc.isVirtualBus }]"
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
              :class="{ 'row-highlighted': hoveredCell.row === rIdx, 'bus-row': rowProc.isVirtualBus }"
            >
              <th
                :class="['row-header', { 'is-bus': rowProc.isVirtualBus }]"
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
                    'bus-diagonal': cell.isDiagonal && cell.isBusCell,
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
                :title="getCellTooltip(cell, rowProc, matrixProcesses[cIdx])"
              >
                <span v-if="cell.isDiagonal" class="diag-mark">{{ rIdx + 1 }}</span>
                <template v-else-if="cell.count > 0">
                  <template v-if="!cell.isBusCell">
                    <span v-if="cell.hasEnables" class="corner-badge badge-e">E</span>
                    <span v-if="cell.hasSituational" class="corner-badge badge-s">S</span>
                    <span v-if="cell.hasControls" class="corner-badge badge-c">C</span>
                  </template>
                  <span class="cell-count">{{ cell.count }}</span>
                </template>
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
          <span :class="['badge', selectedCell.isBusCell ? 'badge-bus' : (selectedCell.isFeedback ? 'badge-feedback' : 'badge-forward')]">
            {{
              selectedCell.isBusCell
                ? 'Virtual Bus Exchange'
                : (selectedCell.isFeedback ? 'Feedback Loop (Below Diagonal)' : 'Feedforward Flow (Above Diagonal)')
            }}
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
                <div class="artefact-tags">
                  <span v-if="item.isEnables" class="en-tag">Enables</span>
                  <span v-if="item.isSituational" class="sit-tag">Situational</span>
                  <span v-if="item.isControls" class="ctrl-tag">Controls</span>
                </div>
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
        <span class="swatch swatch-forward"></span> Feedforward (above diagonal)
      </div>
      <div class="n2-legend-item">
        <span class="swatch swatch-feedback"></span> Feedback (below diagonal)
      </div>
      <div v-if="useVirtualBuses" class="n2-legend-item">
        <span class="swatch swatch-bus"></span> Virtual bus (CTL / ENAB / SIT)
      </div>
      <template v-else>
        <div class="n2-legend-item"><span class="en-tag">E</span> Enables</div>
        <div class="n2-legend-item"><span class="sit-tag">S</span> Situational</div>
        <div class="n2-legend-item"><span class="ctrl-tag">C</span> Controls</div>
      </template>
      <div class="n2-legend-item">
        Drag group pills to reorder · Click any numbered cell to inspect artefacts.
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
  gap: 8px;
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
  padding: 6px 11px;
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
  gap: 5px;
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
  cursor: grab;
  user-select: none;
  transition: all 0.15s;
}
.group-pill:active {
  cursor: grabbing;
}
.group-pill.dragging {
  opacity: 0.4;
}
.group-pill.drag-over {
  box-shadow: -3px 0 0 #1565c0;
  transform: translateX(2px);
}
.group-pill .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #cbd5e1;
  margin: 0 2px;
}

.n2-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.n2-checkbox.disabled {
  color: #94a3b8;
  cursor: not-allowed;
}
.n2-checkbox input {
  margin: 0;
  cursor: pointer;
}
.n2-checkbox.disabled input {
  cursor: not-allowed;
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
  width: 36px;
  min-width: 36px;
  max-width: 36px;
  vertical-align: bottom;
  font-weight: 500;
}
.col-header.is-bus {
  background: #f1f5f9;
  font-weight: 700;
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
.row-header.is-bus {
  background: #f8fafc;
  font-weight: 700;
  font-style: italic;
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
  position: relative;
  width: 36px;
  height: 34px;
  min-width: 36px;
  text-align: center;
  vertical-align: middle;
  border-right: 1px solid #edf2f7;
  border-bottom: 1px solid #edf2f7;
  font-weight: 700;
  font-size: 11px;
  padding: 0;
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
.matrix-cell.bus-diagonal {
  background: #e2e8f0;
  color: #334155;
}
.matrix-cell.clickable {
  cursor: pointer;
}
.matrix-cell.selected {
  outline: 2px solid #1565c0;
  outline-offset: -2px;
}

.cell-count {
  position: relative;
  z-index: 1;
}

/* Corner indicators inside matrix cells (no background box) */
.corner-badge {
  position: absolute;
  font-size: 7.5px;
  font-weight: 700;
  line-height: 1;
  color: inherit;
  opacity: 0.72;
  pointer-events: none;
  z-index: 2;
}
.badge-e { top: 2px; left: 3px; }
.badge-s { top: 2px; right: 3px; }
.badge-c { bottom: 2px; left: 3px; }

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
.badge-bus { background: #475569; }

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
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 4px;
}
.artefact-name {
  font-weight: 600;
  font-size: 13px;
  color: #1e293b;
}
.artefact-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
}
.en-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 8px;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
}
.sit-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 8px;
  background: #f3e5f5;
  color: #6a1b9a;
  border: 1px solid #ce93d8;
}
.ctrl-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 8px;
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fcd34d;
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
  gap: 14px;
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
.swatch-bus { background: rgba(71, 85, 105, 0.65); }
</style>
