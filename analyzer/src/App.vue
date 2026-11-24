<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import Sidebar from './components/Sidebar.vue';
import GraphCanvas from './components/GraphCanvas.vue';
import { store, loadDefaultModel, getCaseDefaults, executeActiveCase } from './store/graphStore.js';
import { CaseRegistry } from './cases/caseRegistry.js';
import { parseUrlState, buildShareUrl } from './core/urlState.js';

const projectionTabs = [
  { id: 'graph', label: '🕸️ 2D Diagram' },
  { id: 'space3d', label: '🌐 3D Space' },
  { id: 'n2', label: '🔢 N2 Matrix' }
];

const referenceTabs = [
  { id: 'checklist', label: '📋 Checklist' },
  { id: 'hotspots', label: '🔥 Hotspots' },
  { id: 'dictionary', label: '🔍 Dictionary' }
];

const tourTabs = [
  { id: 'tours', label: '🎬 Guided Tours' }
];

const isSidebarCollapsed = ref(false);
const isMobileMenuOpen = ref(false);
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
const shareStatus = ref('');

const updateViewportFlag = () => {
  isMobile.value = window.innerWidth <= 768;
  if (!isMobile.value) {
    isMobileMenuOpen.value = false;
  }
};

const toggleSidebar = () => {
  if (isMobile.value) {
    isMobileMenuOpen.value = !isMobileMenuOpen.value;
  } else {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }
};

const copyShareLink = async () => {
  const shareUrl = buildShareUrl(store);
  try {
    window.history.replaceState(null, '', shareUrl);
  } catch {
    // Ignore history restrictions in sandboxed environments
  }

  try {
    await navigator.clipboard.writeText(shareUrl);
    shareStatus.value = '✓ Link Copied!';
  } catch {
    window.prompt('Copy shareable link:', shareUrl);
    shareStatus.value = 'Link Ready';
  }
  setTimeout(() => { shareStatus.value = ''; }, 2400);
};

// Auto-load default ISO 15288 model and restore any shared URL parameters
onMounted(async () => {
  window.addEventListener('resize', updateViewportFlag);

  const urlState = parseUrlState();

  if (urlState?.settings) {
    Object.assign(store.settings, urlState.settings);
  }
  if (urlState?.activeView) store.activeView = urlState.activeView;
  if (urlState?.activeEngine) store.activeEngine = urlState.activeEngine;
  if (urlState?.scope2d) store.visOptions.scope = urlState.scope2d;
  if (urlState?.use2DRings !== undefined) store.visOptions.useRings = urlState.use2DRings;
  if (urlState?.scope3d) store.threeOptions.scope = urlState.scope3d;
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
    executeActiveCase(false);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportFlag);
});
</script>

<template>
  <div class="app-shell">
    <!-- Unified Top Header Bar -->
    <header class="app-topbar">
      <div class="topbar-brand" :class="{ collapsed: !isMobile && isSidebarCollapsed }">
        <button
          class="sidebar-toggle-btn"
          @click="toggleSidebar"
          :title="isMobile ? 'Toggle settings panel' : (isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar')"
          :aria-expanded="isMobile ? isMobileMenuOpen : !isSidebarCollapsed"
        >
          <span v-if="isMobile">☰</span>
          <span v-else>{{ isSidebarCollapsed ? '☰' : '◧' }}</span>
        </button>
        <h2 class="app-title">ISO 15288 Analyzer</h2>
      </div>

      <div class="topbar-workspace">
        <nav class="workspace-tabs">
          <div class="tab-group">
            <button
              v-for="tab in projectionTabs"
              :key="tab.id"
              :class="['ws-tab', { active: store.activeView === tab.id }]"
              :disabled="!store.isLoaded && tab.id !== 'graph'"
              @click="store.activeView = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <span class="tab-divider" aria-hidden="true"></span>

          <div class="tab-group">
            <button
              v-for="tab in referenceTabs"
              :key="tab.id"
              :class="['ws-tab', { active: store.activeView === tab.id }]"
              :disabled="!store.isLoaded"
              @click="store.activeView = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <span class="tab-divider" aria-hidden="true"></span>

          <div class="tab-group">
            <button
              v-for="tab in tourTabs"
              :key="tab.id"
              :class="['ws-tab', { active: store.activeView === tab.id }]"
              @click="store.activeView = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </nav>

        <div class="workspace-actions">
          <button
            class="share-btn"
            :disabled="!store.isLoaded"
            @click="copyShareLink"
            title="Copy a direct link to this view, global settings, and current slice"
          >
            {{ shareStatus || '🔗 Share Link' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Main Body: Collapsible Settings & Slice Sidebar + Full-Width View Stage -->
    <div class="app-body">
      <aside
        :class="[
          'sidebar',
          {
            'is-collapsed': !isMobile && isSidebarCollapsed,
            'is-open': isMobile && isMobileMenuOpen
          }
        ]"
      >
        <div v-if="isMobile" class="mobile-sidebar-header">
          <span>Settings &amp; Slices</span>
          <button class="close-btn" @click="isMobileMenuOpen = false">×</button>
        </div>
        <Sidebar />
      </aside>

      <main class="canvas-area">
        <GraphCanvas />
      </main>

      <div
        v-if="isMobile && isMobileMenuOpen"
        class="mobile-overlay"
        @click="isMobileMenuOpen = false"
      ></div>
    </div>
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
  --topbar-height: 52px;
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-main);
}

.app-shell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Unified Top Header */
.app-topbar {
  flex-shrink: 0;
  min-height: var(--topbar-height);
  display: flex;
  align-items: stretch;
  background: #ffffff;
  border-bottom: 1px solid var(--border);
  z-index: 120;
}

.topbar-brand {
  width: 350px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-right: 1px solid var(--border);
  transition: width 0.2s ease;
}

.topbar-brand.collapsed {
  width: auto;
  padding-right: 16px;
}

.sidebar-toggle-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #f6f8fa;
  color: #334155;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.sidebar-toggle-btn:hover {
  background: #eaeef2;
  border-color: #94a3b8;
}

.app-title {
  margin: 0;
  font-size: 1.08rem;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
}

.topbar-workspace {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
}

.workspace-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.tab-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tab-divider {
  width: 1px;
  height: 22px;
  background: #cbd5e1;
  margin: 0 2px;
}

.ws-tab {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d0d7de;
  background: #f6f8fa;
  color: #334155;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.ws-tab:hover:not(:disabled) { background: #eaeef2; }
.ws-tab.active {
  background: #4CAF50;
  color: #ffffff;
  border-color: #4CAF50;
}
.ws-tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.workspace-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1e293b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.share-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.share-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Main Body Row */
.app-body {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  position: relative;
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
  transition: width 0.22s ease, opacity 0.18s ease, transform 0.25s ease;
  z-index: 100;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04);
}

.sidebar.is-collapsed {
  width: 0;
  border-right: none;
  box-shadow: none;
  opacity: 0;
  pointer-events: none;
}

.mobile-sidebar-header {
  flex-shrink: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
  font-size: 0.95rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
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

.mobile-overlay {
  display: none;
}

@media (max-width: 768px) {
  .topbar-brand {
    width: auto;
    border-right: none;
  }
  .app-title {
    font-size: 0.95rem;
  }
  .tab-divider {
    display: none;
  }
  .sidebar {
    position: fixed;
    top: var(--topbar-height);
    left: 0;
    bottom: 0;
    height: calc(100% - var(--topbar-height));
    width: 320px;
    max-width: 88vw;
    transform: translateX(-100%);
  }
  .sidebar.is-open {
    transform: translateX(0);
  }
  .mobile-overlay {
    display: block;
    position: fixed;
    top: var(--topbar-height);
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 99;
  }
}
</style>
