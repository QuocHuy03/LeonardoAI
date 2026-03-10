import { app, BrowserWindow, Menu, ipcMain, protocol, net } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { registerIpc } from './ipc'
import { getDb } from './db'

const require2 = createRequire(import.meta.url)
const { autoUpdater } = require2('electron-updater')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Initialize DB before window ──────────────────────────────────────────────
getDb().catch(console.error)

// ── Custom protocol: localfile:// serves arbitrary local files ───────────────
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

// ── Auto-updater setup ───────────────────────────────────────────────────────
function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (event: string, data?: any) => {
    if (!win.isDestroyed()) win.webContents.send('updater:event', { event, data })
  }

  autoUpdater.on('checking-for-update',   () => send('checking'))
  autoUpdater.on('update-available',      (info: any) => send('available', info))
  autoUpdater.on('update-not-available',  () => send('not-available'))
  autoUpdater.on('download-progress',     (p: any)    => send('progress', Math.round(p.percent)))
  autoUpdater.on('update-downloaded',     (info: any) => send('downloaded', info))
  autoUpdater.on('error',                 (err: any)  => send('error', err.message))

  // Allow renderer to trigger install-and-restart
  ipcMain.on('updater:install', () => autoUpdater.quitAndInstall())

  // Check on startup (only in production)
  if (process.env.NODE_ENV !== 'development') {
    setTimeout(() => autoUpdater.checkForUpdates(), 3000)
  }
}

function createWindow() {
  // Resolve logo relative to the project root (works in both dev and prod)
  const iconPath = path.join(__dirname, '../logo.png')

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#13131f',
    title: 'Leonardo AI — Image Generator',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In dev, load from Vite dev server; in prod, load built index.html
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    // win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  setupAutoUpdater(win)
  return win
}


app.whenReady().then(() => {
  // Serve local disk files via localfile:// so renderer can display them
  protocol.handle('localfile', (req) => {
    const filePath = decodeURIComponent(req.url.replace('localfile://', ''))
    return net.fetch(`file://${filePath}`)
  })
  if (process.platform === 'win32') app.setAppUserModelId('Leonardo AI')
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
