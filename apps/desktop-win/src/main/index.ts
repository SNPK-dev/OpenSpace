import { app, BrowserWindow, shell, session, ipcMain, desktopCapturer } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { developmentCSP, isTrustedRendererURL, productionCSP, safeExternalURL } from './security'
import { autoUpdater } from 'electron-updater'

// Playwright launches the unpackaged Electron binary. This explicit test-only
// switch exercises the packaged file:// and CSP path without weakening builds.
const isDev = !app.isPackaged && process.env.OPENSPACE_ELECTRON_TEST_PACKAGED !== '1'
const rendererEntry = join(__dirname, '../renderer/index.html')
const rendererEntryURL = pathToFileURL(rendererEntry).href

function isTrusted(rawURL: string | null | undefined): boolean {
  return isTrustedRendererURL(rawURL, isDev, rendererEntryURL)
}

function createWindow(): void {
  const iconPath = isDev
    ? join(__dirname, '../../src/renderer/public/assets/logo.png')
    : join(__dirname, '../renderer/assets/logo.png')

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#313338',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev,
    },
  })

  if (isDev) win.webContents.on('before-input-event', (_event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools()
      else win.webContents.openDevTools()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    const external = safeExternalURL(url)
    if (external) void shell.openExternal(external)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isTrusted(url)) return
    event.preventDefault()
    const external = safeExternalURL(url)
    if (external) void shell.openExternal(external)
  })

  if (isDev) {
    void win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    void win.loadFile(rendererEntry)
  }
}

function registerScreenSourceHandler(): void {
  ipcMain.handle('get-screen-sources', async (event) => {
    if (!isTrusted(event.senderFrame?.url)) throw new Error('untrusted_renderer')
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 300, height: 200 },
    })
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      display_id: source.display_id,
    }))
  })
}

app.whenReady().then(() => {
  const policy = isDev ? developmentCSP : productionCSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...(details.responseHeaders ?? {}) }
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-security-policy') delete headers[key]
    }
    headers['Content-Security-Policy'] = [policy]
    callback({ responseHeaders: headers })
  })

  registerScreenSourceHandler()
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isTrusted(webContents.getURL()) && permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return webContents !== null && isTrusted(webContents.getURL()) && ['media', 'microphone', 'camera'].includes(permission)
  })

  createWindow()
  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.checkForUpdatesAndNotify().catch(error => {
      console.error('[updater] update check failed', error)
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
