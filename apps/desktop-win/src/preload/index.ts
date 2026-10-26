import { contextBridge, ipcRenderer } from 'electron'

// Injected by electron.vite.config.ts define; only accessible at build time in renderer.
// Here in the preload we pass runtime values the renderer can't access directly.
contextBridge.exposeInMainWorld('electronAPI', {
  // Server URLs can be overridden by the operator at build time via env vars
  // (OPENSPACE_API_URL / OPENSPACE_WS_URL). The renderer reads these via Vite define.
  // This call provides a hook for future runtime config (e.g. a settings dialog).
  getConfig: () => ({
    apiUrl: process.env.OPENSPACE_API_URL ?? 'http://localhost:8080',
    wsUrl: process.env.OPENSPACE_WS_URL ?? 'ws://localhost:4000',
  }),
  platform: process.platform,
  getScreenSources: (): Promise<Array<{ id: string; name: string; thumbnail: string; display_id: string }>> =>
    ipcRenderer.invoke('get-screen-sources'),
})
