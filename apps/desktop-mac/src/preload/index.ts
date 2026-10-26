import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ({
    apiUrl: process.env.OPENSPACE_API_URL ?? 'http://localhost:8080',
    wsUrl: process.env.OPENSPACE_WS_URL ?? 'ws://localhost:4000',
  }),
  platform: process.platform,
})
