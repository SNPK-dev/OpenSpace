declare const __CLIENT_TYPE__: 'web' | 'windows' | 'mac' | 'mobile'

interface ScreenSource {
  id: string
  name: string
  thumbnail: string
  display_id: string
}

interface ElectronAPI {
  getConfig: () => { apiUrl: string; wsUrl: string }
  platform: string
  getScreenSources: () => Promise<ScreenSource[]>
}

interface Window {
  electronAPI?: ElectronAPI
}
