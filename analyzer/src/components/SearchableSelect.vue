<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Array], default: () => [] },
  options: { type: Array, required: true }, // Array of { id, name, group }
  multiple: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Select option...' }
});

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const searchQuery = ref('');
const dropdownRef = ref(null);

// Grouping and sorting order
const groupOrder = [
  'Technical', 
  'Technical Management', 
  'Organizational Project-Enabling', 
  'Agreement', 
  'Tailoring', 
  'Others',
  'Business Objects' // For artifacts
];

// Computed property to filter, sort, and group options
const filteredGroups = computed(() => {
  const query = searchQuery.value.toLowerCase();
  
  // 1. Filter by search query
  const filtered = props.options.filter(opt => opt.name.toLowerCase().includes(query));
  
  // 2. Group items
  const groups = {};
  filtered.forEach(opt => {
    const g = opt.group || 'Others';
    if (!groups[g]) groups[g] = [];
    groups[g].push(opt);
  });
  
  // 3. Sort items alphabetically within groups
  Object.values(groups).forEach(list => {
    list.sort((a, b) => a.name.localeCompare(b.name));
  });
  
  // 4. Sort groups by predefined ISO 15288 order
  return Object.keys(groups)
    .sort((a, b) => {
       const idxA = groupOrder.indexOf(a);
       const idxB = groupOrder.indexOf(b);
       const orderA = idxA === -1 ? 999 : idxA;
       const orderB = idxB === -1 ? 999 : idxB;
       return orderA - orderB;
    })
    .map(name => ({ name, items: groups[name] }));
});

// Display text on the closed dropdown button
const displayText = computed(() => {
  if (props.multiple) {
    const count = Array.isArray(props.modelValue) ? props.modelValue.length : 0;
    return count > 0 ? `${count} selected` : props.placeholder;
  } else {
    if (!props.modelValue) return props.placeholder;
    const selectedOpt = props.options.find(o => o.id === props.modelValue);
    return selectedOpt ? selectedOpt.name : props.placeholder;
  }
});

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value) searchQuery.value = ''; // Reset search on open
};

const selectOption = (opt) => {
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
    const index = current.indexOf(opt.id);
    if (index === -1) current.push(opt.id);
    else current.splice(index, 1);
    emit('update:modelValue', current);
  } else {
    emit('update:modelValue', opt.id);
    isOpen.value = false;
  }
};

const isSelected = (id) => {
  if (props.multiple) return Array.isArray(props.modelValue) && props.modelValue.includes(id);
  return props.modelValue === id;
};

// Close dropdown when clicking outside of it
const handleClickOutside = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false;
  }
};

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>

<template>
  <div class="custom-select" ref="dropdownRef">
    <div class="select-header" @click="toggleDropdown" :class="{ 'is-open': isOpen }">
      <span class="selected-text">{{ displayText }}</span>
      <span class="arrow">▼</span>
    </div>

    <div v-if="isOpen" class="select-dropdown">
      <input 
        type="text" 
        v-model="searchQuery" 
        class="search-input" 
        placeholder="Type to filter..." 
        @click.stop
      />
      
      <div class="options-list">
        <div v-if="filteredGroups.length === 0" class="no-results">No matches found.</div>
        
        <div v-for="group in filteredGroups" :key="group.name" class="group-container">
          <div class="group-title">{{ group.name }}</div>
          
          <div 
            v-for="opt in group.items" 
            :key="opt.id" 
            class="option-item" 
            :class="{ selected: isSelected(opt.id) }"
            @click.stop="selectOption(opt)"
          >
            <input v-if="multiple" type="checkbox" :checked="isSelected(opt.id)" class="opt-checkbox" />
            <span class="opt-name">{{ opt.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-select { position: relative; width: 100%; font-size: 13px; }
.select-header { 
  display: flex; justify-content: space-between; align-items: center; 
  padding: 8px 12px; background: white; border: 1px solid #ccc; 
  border-radius: 4px; cursor: pointer; transition: all 0.2s;
}
.select-header:hover { border-color: #888; }
.select-header.is-open { border-color: #4CAF50; box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2); }
.selected-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; }
.arrow { font-size: 10px; color: #888; }

.select-dropdown { 
  position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; 
  background: white; border: 1px solid #ccc; border-radius: 4px; 
  box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; 
  display: flex; flex-direction: column; max-height: 300px;
}
.search-input { 
  margin: 8px; padding: 6px 10px; border: 1px solid #ddd; 
  border-radius: 4px; font-size: 13px; outline: none;
}
.search-input:focus { border-color: #4CAF50; }

.options-list { overflow-y: auto; flex-grow: 1; padding-bottom: 8px; }
.no-results { padding: 10px; color: #888; text-align: center; }

.group-title { 
  padding: 6px 10px; background: #f0f0f0; color: #555; 
  font-weight: 600; font-size: 11px; text-transform: uppercase; 
  letter-spacing: 0.5px; position: sticky; top: 0; z-index: 1;
}
.option-item { 
  display: flex; align-items: center; padding: 8px 10px; 
  cursor: pointer; transition: background 0.1s;
}
.option-item:hover { background: #f5f9f5; }
.option-item.selected { background: #e8f5e9; color: #2e7d32; font-weight: 500; }
.opt-checkbox { margin-right: 8px; pointer-events: none; }
.opt-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>