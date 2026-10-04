import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import path from 'node:path'
import { getDb, dbFilePath, kvGet, kvSet } from './db'
import { normalizeAi, aiConfigProblem, chatCompletion, presetDefaults } from './ai'
import type { AppSettings, SettingsPatch, AiTestResult } from '../shared/types'
import { runSelfTest } from './selftest'

const KEY_ENC_KEY = 'ai_key_enc'
const KEY_PLAIN_KEY = 'ai_key_plain_fallback'
const SETTINGS_KEY = 'app_settings'

interface StoredSettings {
  ai: { preset: string; baseUrl: string; model: string }
  plan: { dailyNew: number; dailyReviewLimit: number; dailyMinutes: number; reviewIntensity: number }
  appearance: { theme: 'light' | 'dark' | 'system' }
}

const DEFAULT_SETTINGS: StoredSettings = {
  ai: { preset: 'custom', baseUrl: '', model: '' },
  plan: { dailyNew: 20, dailyReviewLimit: 50, dailyMinutes: 60, reviewIntensity: 3 },
  appearance: { theme: 'light' }
}

function storedSettings(): StoredSettings {
  const raw = kvGet(SETTINGS_KEY)
  if (!raw) return structuredClone(DEFAULT_SETTINGS)
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    return {
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.ai ?? {}) },
      plan: { ...DEFAULT_SETTINGS.plan, ...(parsed.plan ?? {}) },
      appearance: { ...DEFAULT_SETTINGS.appearance, ...(parsed.appearance ?? {}) }
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

function maskKey(plain: string): string {
  if (!plain) return ''
  return plain.length <= 4 ? '••••' : '••••' + plain.slice(-4)
}

function storedKey(): string {
  const enc = kvGet(KEY_ENC_KEY)
  if (enc) {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(enc, 'base64'))
      } catch {
        return ''
      }
    }
    return ''
  }
  return kvGet(KEY_PLAIN_KEY) ?? ''
}

function saveAiKey(plain: string): void {
  if (!plain) {
    kvSet(KEY_ENC_KEY, '')
    kvSet(KEY_PLAIN_KEY, '')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    kvSet(KEY_ENC_KEY, safeStorage.encryptString(plain).toString('base64'))
    kvSet(KEY_PLAIN_KEY, '')
  } else {
    kvSet(KEY_PLAIN_KEY, plain)
  }
}

function loadSettings(): AppSettings {
  const stored = storedSettings()
  const plain = storedKey()
  let sqliteVersion = ''
  try {
    sqliteVersion = (
      getDb().prepare('SELECT sqlite_version() AS v').get() as { v: string }
    ).v
  } catch {
    sqliteVersion = ''
  }
  return {
    ai: {
      preset: stored.ai.preset,
      baseUrl: stored.ai.baseUrl,
      model: stored.ai.model,
      hasKey: Boolean(plain),
      keyMasked: maskKey(plain)
    },
    plan: stored.plan,
    appearance: stored.appearance,
    about: {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? '',
      sqliteVersion
    }
  }
}

function saveSettingsPatch(patch: SettingsPatch): AppSettings {
  const current = storedSettings()
  if (patch.ai) {
    const next = { ...current.ai, ...patch.ai }
    // 切换服务商时带入该预设的默认地址与模型（与插件行为一致，仍可手改）。
    if (patch.ai.preset && patch.ai.preset !== current.ai.preset) {
      const defaults = presetDefaults(patch.ai.preset)
      next.baseUrl = defaults.baseUrl
      next.model = defaults.model
    }
    current.ai = next
  }
  if (patch.plan) current.plan = { ...current.plan, ...patch.plan }
  if (patch.appearance) current.appearance = { ...current.appearance, ...patch.appearance }
  kvSet(SETTINGS_KEY, JSON.stringify(current))
  return loadSettings()
}

async function testAi(cfg?: Partial<{ preset: string; baseUrl: string; apiKey: string; model: string }>): Promise<AiTestResult> {
  try {
    const merged = normalizeAi({
      preset: cfg?.preset ?? storedSettings().ai.preset,
      baseUrl: cfg?.baseUrl ?? storedSettings().ai.baseUrl,
      model: cfg?.model ?? storedSettings().ai.model,
      apiKey: cfg?.apiKey ?? storedKey()
    })
    const problem = aiConfigProblem(merged)
    if (problem) return { ok: false, error: problem }
    const reply = await chatCompletion(
      merged,
      [{ role: 'user', content: '连接测试：请原样回复 OK' }],
      { maxTokens: 16, timeoutMs: 30_000 }
    )
    return { ok: true, reply: reply.slice(0, 80) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function createWindow(): BrowserWindow {
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
  return win
}

app.whenReady().then(() => {
  ipcMain.handle('db:ping', () => ({
    sqliteVersion: (getDb().prepare('SELECT sqlite_version() AS v').get() as { v: string }).v,
    dbPath: dbFilePath()
  }))
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_e, patch: SettingsPatch) => saveSettingsPatch(patch))
  ipcMain.handle('ai:key:set', (_e, key: string) => {
    saveAiKey(String(key ?? '').trim())
    return loadSettings().ai
  })
  ipcMain.handle('ai:test', (_e, cfg?: Partial<{ preset: string; baseUrl: string; apiKey: string; model: string }>) =>
    testAi(cfg)
  )

  const win = createWindow()
  console.log('[lexiflow] window created, db ready')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  if (process.env['LEXI_SELFTEST'] === '1') {
    void runSelfTest(win, { loadSettings, saveSettingsPatch, testAi, saveAiKey, storedKey })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
