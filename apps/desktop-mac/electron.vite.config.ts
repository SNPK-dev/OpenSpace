import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    // Share the renderer source from desktop-win — zero duplication.
    // Only the build-time constant __CLIENT_TYPE__ differs.
    root: resolve(__dirname, '../desktop-win/src/renderer'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, '../desktop-win/src/renderer/index.html'),
      },
    },
    define: {
      __CLIENT_TYPE__: JSON.stringify('mac'),
    },
    plugins: [react()],
  },
})
