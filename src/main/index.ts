import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    db = new Database(path.join(dir, 'lexiflow.db'))
    db.pragma('journal_mode = WAL')
    db.exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  }
  return db
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f6f3ea',
    title: 'LexiFlow',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  win.webContents.on('did-finish-load', () => {
    console.log('[lexiflow] renderer loaded')
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[lexiflow] renderer failed to load:', code, desc)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('db:ping', () => {
    const d = getDb()
    const row = d.prepare('SELECT sqlite_version() AS v').get() as { v: string }
    return { sqliteVersion: row.v, dbPath: path.join(app.getPath('userData'), 'lexiflow.db') }
  })

  createWindow()
  console.log('[lexiflow] window created, db ready')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
