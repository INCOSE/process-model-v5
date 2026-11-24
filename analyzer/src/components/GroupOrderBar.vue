<script setup>
import { ref } from 'vue';
import { groupShortLabels, groupColors } from '../core/iso15288Groups.js';

const props = defineProps({
  groups: { type: Array, required: true },
  activeGroups: { type: Object, default: null }, // Optional Set for toggleable visibility (used in N2)
  prefixLabel: { type: String, default: '' }
});

const emit = defineEmits(['reorder', 'toggle']);

const draggedGroup = ref(null);
const dragOverGroup = ref(null);

const isGroupActive = (g) => {
  if (!props.activeGroups) return true;
  return props.activeGroups.has(g);
};

const handleClick = (g) => {
  if (props.activeGroups) {
    emit('toggle', g);
  }
};

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
  if (srcGroup && srcGroup !== targetGroup) {
    emit('reorder', srcGroup, targetGroup);
  }
};

const onDragEnd = () => {
  draggedGroup.value = null;
  dragOverGroup.value = null;
};
</script>

<template>
  <div class="group-order-bar">
    <span v-if="prefixLabel" class="order-prefix">{{ prefixLabel }}</span>
    <button
      v-for="g in groups"
      :key="g"
      type="button"
      draggable="true"
      :class="[
        'group-pill',
        {
          active: isGroupActive(g),
          dragging: draggedGroup === g,
          'drag-over': dragOverGroup === g
        }
      ]"
      :style="isGroupActive(g) ? { borderColor: groupColors[g] || '#546e7a', color: groupColors[g] || '#546e7a', background: '#ffffff' } : {}"
      @click="handleClick(g)"
      @dragstart="onDragStart(g, $event)"
      @dragover="onDragOver(g, $event)"
      @dragleave="onDragLeave(g)"
      @drop="onDrop(g, $event)"
      @dragend="onDragEnd"
      :title="activeGroups ? 'Click to toggle · Drag left/right to reorder' : 'Drag left/right to reorder process groups'"
    >
      <span class="drag-grip" aria-hidden="true">⋮⋮</span>
      <span class="dot" :style="{ background: groupColors[g] || '#546e7a' }"></span>
      {{ groupShortLabels[g] || g }}
    </button>
  </div>
</template>

<style scoped>
.group-order-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.order-prefix {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-right: 2px;
  white-space: nowrap;
}

.group-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 6px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 14px;
  border: 1px solid #d0d7de;
  background: #f0f2f5;
  color: #888;
  cursor: grab;
  user-select: none;
  transition: transform 0.12s, opacity 0.12s, box-shadow 0.12s;
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
.drag-grip {
  font-size: 9px;
  letter-spacing: -1px;
  opacity: 0.45;
  line-height: 1;
}
.group-pill .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}
</style>
