<script setup>
import { ref, onMounted } from 'vue';
import Sidebar from './components/Sidebar.vue';
import GraphCanvas from './components/GraphCanvas.vue';
import { store, loadDefaultModel, getCaseDefaults, executeActiveCase } from './store/graphStore.js';
import { CaseRegistry } from './cases/caseRegistry.js';
import { parseUrlState } from './core/urlState.js';

// Auto-load default ISO 15288 model and restore any shared URL parameters
onMounted(async () => {
  const urlState = parseUrlState();

  // Apply global settings before XML parsing so inheritance flags take effect immediately
  if (urlState?.settings) {
    Object.assign(store.settings, urlState.settings);
  }
  if (urlState?.activeView) store.activeView = urlState.activeView;
  if (urlState?.activeEngine) store.activeEngine = urlState.activeEngine;
  if (urlState?.is3DLayered !== undefined) store.threeOptions.isLayered = urlState.is3DLayered;
  if (urlState?.show3DLabels !== undefined) store.threeOptions.showLabels = urlState.show3DLabels;
  if (urlState?.selectedChecklistProcessId) {
    store.selectedChecklistProcessId = urlState.selectedChecklistProcessId;
  }
  if (urlState?.activeCaseId && CaseRegistry[urlState.activeCaseId]) {
    store.activeCaseId = urlState.activeCaseId;
  }

  await loadDefaultModel();

  if (urlState?.caseParams) {
    store.caseParams = {
      ...getCaseDefaults(store.activeCaseId),
      ...urlState.caseParams
    };
  } else {
    store.caseParams = getCaseDefaults(store.activeCaseId);
  }

  if (urlState?.autoRun && store.isLoaded) {
    executeActiveCase(store.activeView === 'graph');
  }
});

// Drawer menu management for mobile screens
const isMobileMenuOpen = ref(false);

const toggleMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
};
</script>

<template>
  <div class="app-layout">
    <!-- Hamburger button for mobile screens -->
    <button class="mobile-toggle" @click="toggleMenu">
      ☰ Settings
    </button>

    <!-- Sidebar navigation and options -->
    <aside :class="['sidebar', { 'is-open': isMobileMenuOpen }]">
      <div class="sidebar-header">
        <h2>ISO 15288 Analyzer</h2>
        <button class="close-btn" @click="toggleMenu">×</button>
      </div>
      <Sidebar />
    </aside>

    <!-- Main workspace -->
    <main class="canvas-area">
      <GraphCanvas />
    </main>

    <!-- Dimmed backdrop for mobile overlay -->
    <div
      v-if="isMobileMenuOpen"
      class="mobile-overlay"
      @click="toggleMenu"
    ></div>
  </div>
</template>

<style>
/* Base application layout styles */
:root {
  --bg-color: #f8f9fa;
  --sidebar-bg: #ffffff;
  --text-main: #333333;
  --accent: #4CAF50;
  --border: #e0e0e0;
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden; /* Prevent page-level scroll */
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-main);
}

.app-layout {
  position: fixed;
  inset: 0;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.sidebar {
  width: 350px;
  height: 100%;
  min-height: 0;
  flex-shrink: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: transform 0.3s ease;
  z-index: 100;
  box-shadow: 2px 0 8px rgba(0,0,0,0.05);
}

.sidebar-header {
  flex-shrink: 0;
  padding: 15px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.close-btn {
  display: none;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.canvas-area {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #ffffff;
}

.mobile-toggle {
  display: none;
  position: absolute;
  top: 10px;
  left: 12px;
  z-index: 150;
  padding: 6px 10px;
  background: var(--sidebar-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.mobile-overlay {
  display: none;
}

/* Responsive layout for mobile screens (< 768px) */
@media (max-width: 768px) {
  .mobile-toggle { display: block; }
  .close-btn { display: block; }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    height: 100%;
    transform: translateX(-100%);
  }

  .sidebar.is-open {
    transform: translateX(0);
  }

  .mobile-overlay {
    display: block;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 99;
  }
}
</style>
