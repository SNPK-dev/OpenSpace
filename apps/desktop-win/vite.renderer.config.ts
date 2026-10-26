import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.OPENSPACE_E2E_API_PROXY ?? 'http://127.0.0.1:8080'
const wsProxyTarget = process.env.OPENSPACE_E2E_WS_PROXY ?? 'ws://127.0.0.1:3001'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5176,
    proxy: {
      '/api': { target: apiProxyTarget, changeOrigin: true },
      '/ws': { target: wsProxyTarget, ws: true, changeOrigin: true },
    },
  },
  define: {
    __API_BASE__: JSON.stringify(''),
    __WS_BASE__: JSON.stringify('ws://localhost:3001'),
  },
})
