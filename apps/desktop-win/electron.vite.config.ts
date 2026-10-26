import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    define: {
      __CLIENT_TYPE__: JSON.stringify('windows'),
    },
    plugins: [react()],
    build: {
      rollupOptions: { output: { manualChunks(id) {
        if (id.includes('livekit')) return 'rtc-livekit'
        if (id.includes('react-router')) return 'vendor-router'
        if (id.includes('node_modules/react')) return 'vendor-react'
      } } },
    },
  },
})
