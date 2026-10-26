import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.OPENSPACE_E2E_API_PROXY ?? 'http://127.0.0.1:8080'
const wsProxyTarget = process.env.OPENSPACE_E2E_WS_PROXY ?? 'ws://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('livekit')) return 'rtc-livekit'
      if (id.includes('react-router')) return 'vendor-router'
      if (id.includes('node_modules/react')) return 'vendor-react'
    } } },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/api': { target: apiProxyTarget, changeOrigin: true },
      '/ws': { target: wsProxyTarget, ws: true, changeOrigin: true },
    },
  },
})
