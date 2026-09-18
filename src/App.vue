<script setup>
import { ref } from 'vue';
import Sidebar from './components/Sidebar.vue';
import GraphCanvas from './components/GraphCanvas.vue';

// Управление шторкой на мобильных устройствах
const isMobileMenuOpen = ref(false);

const toggleMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
};
</script>

<template>
  <div class="app-layout">
    <!-- Кнопка гамбургера для мобильных экранов -->
    <button class="mobile-toggle" @click="toggleMenu">
      ☰ Настройки
    </button>

    <!-- Боковая панель (сайдбар) -->
    <aside :class="['sidebar', { 'is-open': isMobileMenuOpen }]">
      <div class="sidebar-header">
        <h2>ISO 15288 Analyzer</h2>
        <button class="close-btn" @click="toggleMenu">×</button>
      </div>
      <Sidebar />
    </aside>

    <!-- Основная область с графом -->
    <main class="canvas-area">
      <GraphCanvas />
    </main>

    <!-- Затемнение фона при открытом меню на телефоне -->
    <div 
      v-if="isMobileMenuOpen" 
      class="mobile-overlay" 
      @click="toggleMenu"
    ></div>
  </div>
</template>

<style>
/* Базовые стили приложения (вместо Streamlit CSS) */
:root {
  --bg-color: #f8f9fa;
  --sidebar-bg: #ffffff;
  --text-main: #333333;
  --accent: #4CAF50;
  --border: #e0e0e0;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-main);
  overflow: hidden; /* Запрещаем скролл всей страницы */
}

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.sidebar {
  width: 350px;
  flex-shrink: 0; /* not shrinkable */
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
  z-index: 100;
  box-shadow: 2px 0 8px rgba(0,0,0,0.05);
}

.sidebar-header {
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
  flex-grow: 1;
  min-width: 0; /* canvas cannot go beyond the screen */
  position: relative;
  background: #ffffff;
}

.mobile-toggle {
  display: none;
  position: absolute;
  top: 15px;
  left: 15px;
  z-index: 90;
  padding: 8px 12px;
  background: var(--sidebar-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.mobile-overlay {
  display: none;
}

/* Адаптивность для экранов меньше 768px */
@media (max-width: 768px) {
  .mobile-toggle { display: block; }
  .close-btn { display: block; }
  
  .sidebar {
    position: fixed;
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