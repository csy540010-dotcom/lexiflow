import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { getDb, dbFilePath } from './db'
import { ensureDictionaryImported, ensureBuiltinBooks } from './dictionary'
import {
  listBooks,
  createBook,
  renameBook,
  deleteBook,
  queryWords,
  getWord,
  updateWord,
  addWord,
  type WordQueryArgs
} from './library'
import { detectObsidianData, importObsidianData, removeImportedBooks } from './import-obsidian'
import { loadSettings, saveSettingsPatch, saveAiKey, storedKey, testAi } from './settings'
import { applyGradeToMastery, masteryAverage, type GradeScores } from './mastery'
import {
  todaySummary,
  todayQueue,
  explainWord,
  gradeSentence,
  selectBook,
  selectedBookId,
  listTasks,
  addTask,
  removeTask,
  toggleTask
} from './study'
import type { AppSettings, SettingsPatch, AiTestResult, WordUpdatePatch, SettingsPatch as Patch } from '../shared/types'
import { runSelfTest } from './selftest'

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
  // 数据底座：词典入库（一次性）+ 内置四六级书（首次运行建好 4544+3991 词）
  try {
    const dict = ensureDictionaryImported()
    const books = ensureBuiltinBooks()
    console.log(
      `[lexiflow] dictionary ${dict.imported ? `imported ${dict.words} entries` : 'ready'}, builtin books ${books.created ? `seeded ${books.words} words` : 'ready'}`
    )
  } catch (err) {
    console.error('[lexiflow] 词典/内置书初始化失败:', err)
  }

  ipcMain.handle('db:ping', () => ({
    sqliteVersion: (getDb().prepare('SELECT sqlite_version() AS v').get() as { v: string }).v,
    dbPath: dbFilePath()
  }))
  ipcMain.handle('settings:get', (): AppSettings => loadSettings())
  ipcMain.handle('settings:save', (_e, patch: SettingsPatch) => saveSettingsPatch(patch))
  ipcMain.handle('ai:key:set', (_e, key: string) => {
    saveAiKey(String(key ?? '').trim())
    return loadSettings().ai
  })
  ipcMain.handle('ai:test', (_e, cfg?: Partial<{ preset: string; baseUrl: string; apiKey: string; model: string }>) =>
    testAi(cfg)
  )

  ipcMain.handle('library:books:list', () => listBooks())
  ipcMain.handle('library:books:create', (_e, name: string) => createBook(String(name ?? '')))
  ipcMain.handle('library:books:rename', (_e, id: number, name: string) => renameBook(Number(id), String(name ?? '')))
  ipcMain.handle('library:books:delete', (_e, id: number) => deleteBook(Number(id)))
  ipcMain.handle('library:words:query', (_e, args: WordQueryArgs) => queryWords(args))
  ipcMain.handle('library:words:get', (_e, id: number) => getWord(Number(id)))
  ipcMain.handle('library:words:update', (_e, id: number, patch: WordUpdatePatch) => updateWord(Number(id), patch))
  ipcMain.handle('library:words:add', (_e, bookId: number, headword: string) => addWord(Number(bookId), String(headword ?? '')))

  ipcMain.handle('import:obsidian:detect', (_e, dir: string) => detectObsidianData(String(dir ?? '')))
  ipcMain.handle('import:obsidian:run', (_e, dir: string) => importObsidianData(String(dir ?? '')))
  ipcMain.handle('dialog:pickDir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Obsidian 插件的 data 目录',
      properties: ['openDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('study:summary', (_e, bookId?: number) => todaySummary(bookId ? Number(bookId) : undefined))
  ipcMain.handle('study:queue', (_e, bookId?: number) => todayQueue(bookId ? Number(bookId) : undefined))
  ipcMain.handle('study:selectBook', (_e, bookId: number) => selectBook(Number(bookId)))
  ipcMain.handle('study:selectedBook', () => selectedBookId())
  ipcMain.handle('study:explain', (_e, wordId: number) => explainWord(Number(wordId)))
  ipcMain.handle('study:submit', (_e, wordId: number, sentence: string) => gradeSentence(Number(wordId), String(sentence ?? '')))
  ipcMain.handle('tasks:list', () => listTasks())
  ipcMain.handle('tasks:add', (_e, kind: string, title: string, target: string) => addTask(String(kind ?? 'custom'), String(title ?? ''), String(target ?? '')))
  ipcMain.handle('tasks:remove', (_e, id: number) => removeTask(Number(id)))
  ipcMain.handle('tasks:toggle', (_e, id: number, done: boolean) => toggleTask(Number(id), Boolean(done)))

  const win = createWindow()
  console.log('[lexiflow] window created, db ready')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  if (process.env['LEXI_SELFTEST'] === '1') {
    void runSelfTest(win, {
      loadSettings,
      saveSettingsPatch,
      testAi,
      saveAiKey,
      storedKey,
      library: {
        listBooks,
        queryWords,
        getWord,
        updateWord,
        createBook,
        deleteBook
      },
      import: {
        detect: detectObsidianData,
        run: importObsidianData,
        cleanup: removeImportedBooks
      },
      study: {
        summary: todaySummary,
        queue: todayQueue,
        selectBook,
        tasks: { list: listTasks, add: addTask, toggle: toggleTask, remove: removeTask }
      },
      mastery: { applyGradeToMastery, average: masteryAverage }
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 保持 Patch 类型引用（设置补丁在 settings.ts 内实现）
void (0 as unknown as Patch | undefined)
