import { app, BrowserWindow, shell, protocol, session, Menu, systemPreferences } from 'electron'
import { join } from 'path'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#313338',
    // macOS: compact inset title bar keeps traffic lights, hides title text
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    void win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'mediaKeySystem', 'notifications'].includes(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ['media', 'microphone', 'camera'].includes(permission)
  })

  protocol.registerHttpProtocol('openspace', (req) => {
    void req
  })

  // macOS requires explicit system-level microphone permission request.
  // Without this the app silently gets no audio and LiveKit publishes a silent track.
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus !== 'granted') {
      void systemPreferences.askForMediaAccess('microphone')
    }
  }

  // macOS application menu — required for Cmd+Q, Cmd+C/V/X/Z, hide/show, etc.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]))

  createWindow()

  // Re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Keep app alive in dock when all windows are closed (macOS convention)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
