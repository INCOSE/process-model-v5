import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/process-model-v5/analyzer/',
  plugins: [vue()],
})

