import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { getDb, dbFilePath } from './db'
import { ensureDictionaryImported, ensureBuiltinBooks } from './dictionary'
import {
  listBooks,
  createBook,
  renameBook,
  deleteBook,
  setBookCover,
  queryWords,
  getWord,
  updateWord,
  moveWordToBook,
  addWord,
  type WordQueryArgs
} from './library'
import { detectObsidianData, importObsidianData, removeImportedBooks } from './import-obsidian'
import { ensureUniqueCovers } from './covers'
import { reviewQueue, graduateReview, tapeReview, enqueueReview } from './review'
import { PRACTICE_TYPES, practicePool, redoPool, genMcq, genSentenceTask, recordPractice } from './practice'
import type { PracticeType } from '../shared/types'
import { loadSettings, saveSettingsPatch, saveAiKey, storedKey, testAi } from './settings'
import { applyGradeToMastery, masteryAverage, type GradeScores } from './mastery'
import { parseMcq } from './prompts'
import { statsSummary, localDate, seedStats, cleanupStats, cleanupReviewEvents, cleanupReadingEvents } from './stats'
import {
  listArticles,
  createArticle,
  deleteArticle,
  logReading,
  lookupWord,
  addWordToBook,
  importTextFile,
  translateReading
} from './reading'
import {
  listTracks,
  importAudioFromPath,
  setTrackText,
  setTrackNotes,
  setTrackDuration,
  setTrackCollection,
  listCollections,
  importCover,
  clearSegments,
  setTrackCoverLib,
  extractWordsFromTrack,
  deleteTrack,
  organizeTrack,
  listeningTick,
  unlisteningTick,
  cleanSubtitleText,
  musicDir
} from './music'

// 音频专用协议：让渲染层 <audio> 能播放用户导入的本地文件（仅限 App 数据目录内的 music/）
protocol.registerSchemesAsPrivileged([
  { scheme: 'lexi-media', privileges: { stream: true, supportFetchAPI: true, bypassCSP: false } }
])

// 固定数据目录为 %APPDATA%\lexiflow：无论开发版还是安装版都读写同一份学习数据
app.setPath('userData', path.join(app.getPath('appData'), 'lexiflow'))
import {
  todaySummary,
  todayQueue,
  explainWord,
  generatePrompts,
  generateWordProfile,
  gradeSentence,
  selectBook,
  selectedBookId,
  listTasks,
  addTask,
  removeTask,
  toggleTask,
  listFavorites,
  addFavorite,
  removeFavorite
} from './study'
import type { AppSettings, SettingsPatch, AiTestResult, WordUpdatePatch, SettingsPatch as Patch } from '../shared/types'
import { runSelfTest } from './selftest'

let mainWin: BrowserWindow | null = null

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
  win.on('closed', () => {
    if (mainWin === win) mainWin = null
  })
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
  // 注册 lexi-media:// 处理器（仅允许访问 userData/music/ 下的文件）
  protocol.handle('lexi-media', (request) => {
    try {
      const url = new URL(request.url)
      const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const base = musicDir()
      const filePath = path.resolve(base, name)
      if (!filePath.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(filePath)) {
        return new Response('forbidden', { status: 403 })
      }
      // 支持 Range 请求（音频拖动进度必需）
      const range = request.headers.get('range')
      const stat = fs.statSync(filePath)
      const mime = filePath.endsWith('.mp3')
        ? 'audio/mpeg'
        : filePath.endsWith('.m4a')
          ? 'audio/mp4'
          : filePath.endsWith('.wav')
            ? 'audio/wav'
            : filePath.endsWith('.ogg')
              ? 'audio/ogg'
              : 'application/octet-stream'
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        const start = m && m[1] ? Number(m[1]) : 0
        const end = m && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1
        const stream = fs.createReadStream(filePath, { start, end })
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes'
          }
        })
      }
      const stream = fs.createReadStream(filePath)
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 200,
        headers: { 'Content-Type': mime, 'Content-Length': String(stat.size), 'Accept-Ranges': 'bytes' }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })

  // 数据底座：词典入库（一次性）+ 内置四六级书（首次运行建好 4544+3991 词）
  try {
    const dict = ensureDictionaryImported()
    const books = ensureBuiltinBooks()
    ensureUniqueCovers()
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
  ipcMain.handle('library:books:setCover', (_e, id: number, coverId: string) =>
    setBookCover(Number(id), String(coverId ?? ''))
  )
  ipcMain.handle('library:words:query', (_e, args: WordQueryArgs) => queryWords(args))
  ipcMain.handle('library:words:get', (_e, id: number) => getWord(Number(id)))
  ipcMain.handle('library:words:update', (_e, id: number, patch: WordUpdatePatch) => updateWord(Number(id), patch))
  ipcMain.handle('library:words:move', (_e, id: number, bookId: number) => moveWordToBook(Number(id), Number(bookId)))
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
  ipcMain.handle('study:genPrompts', (_e, wordId: number) => generatePrompts(Number(wordId)))
  ipcMain.handle('study:profile', (_e, wordId: number) => generateWordProfile(Number(wordId)))
  ipcMain.handle('study:submit', (_e, wordId: number, sentence: string) => gradeSentence(Number(wordId), String(sentence ?? '')))
  ipcMain.handle('tasks:list', () => listTasks())
  ipcMain.handle('tasks:add', (_e, kind: string, title: string, target: string) => addTask(String(kind ?? 'custom'), String(title ?? ''), String(target ?? '')))
  ipcMain.handle('tasks:remove', (_e, id: number) => removeTask(Number(id)))
  ipcMain.handle('tasks:toggle', (_e, id: number, done: boolean) => toggleTask(Number(id), Boolean(done)))

  ipcMain.handle('fav:list', (_e, wordId: number) => listFavorites(Number(wordId)))
  ipcMain.handle('fav:add', (_e, wordId: number, sentence: string, source: string) =>
    addFavorite(Number(wordId), String(sentence ?? ''), String(source ?? 'revised'))
  )
  ipcMain.handle('fav:remove', (_e, id: number) => removeFavorite(Number(id)))

  ipcMain.handle('review:queue', () => reviewQueue())
  ipcMain.handle('review:graduate', (_e, wordId: number) => graduateReview(Number(wordId)))
  ipcMain.handle('review:tape', (_e, wordId: number) => tapeReview(Number(wordId)))
  ipcMain.handle('review:enqueue', (_e, wordId: number, dueDate: string) => enqueueReview(Number(wordId), String(dueDate ?? '')))

  ipcMain.handle('practice:types', () => PRACTICE_TYPES)
  ipcMain.handle('practice:pool', (_e, limit?: number) => practicePool(limit ? Number(limit) : undefined))
  ipcMain.handle('practice:redoPool', (_e, limit?: number) => redoPool(limit ? Number(limit) : undefined))
  ipcMain.handle('practice:mcq', (_e, wordId: number, type: PracticeType) => genMcq(Number(wordId), type))
  ipcMain.handle('practice:task', (_e, wordId: number, type: PracticeType) => genSentenceTask(Number(wordId), type))
  ipcMain.handle('practice:record', (_e, type: PracticeType, payload: Record<string, unknown>) =>
    recordPractice(type, payload ?? {})
  )

  ipcMain.handle('stats:summary', (_e, days: number | null) => statsSummary(days ? Number(days) : null))
  ipcMain.handle('stats:tick', (_e, seconds: number) => {
    const s = Math.max(1, Math.min(600, Number(seconds) || 30))
    getDb()
      .prepare('INSERT INTO study_time (date, seconds) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET seconds = seconds + excluded.seconds')
      .run(localDate(), s)
  })

  ipcMain.handle('reading:list', () => listArticles())
  ipcMain.handle('reading:create', (_e, title: string, content: string, source: string) =>
    createArticle(String(title ?? ''), String(content ?? ''), String(source ?? 'paste'))
  )
  ipcMain.handle('reading:delete', (_e, id: number) => deleteArticle(Number(id)))
  ipcMain.handle('reading:log', (_e, id: number) => logReading(Number(id)))
  ipcMain.handle('reading:lookup', (_e, word: string, bookId?: number) => lookupWord(String(word ?? ''), bookId ? Number(bookId) : undefined))
  ipcMain.handle('reading:addWord', (_e, headword: string, bookId?: number) =>
    addWordToBook(String(headword ?? ''), bookId ? Number(bookId) : undefined)
  )
  ipcMain.handle('reading:translate', (_e, text: string) => translateReading(String(text ?? '')))
  ipcMain.handle('reading:importFile', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入文章',
      properties: ['openFile'],
      filters: [{ name: '文本', extensions: ['txt', 'md', 'markdown'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importTextFile(result.filePaths[0])
  })

  ipcMain.handle('music:list', () => listTracks())
  ipcMain.handle('music:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入音频',
      properties: ['openFile'],
      filters: [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importAudioFromPath(result.filePaths[0])
  })
  ipcMain.handle('music:setText', (_e, id: number, text: string) => setTrackText(Number(id), String(text ?? '')))
  ipcMain.handle('music:setNotes', (_e, id: number, notes: string) => setTrackNotes(Number(id), String(notes ?? '')))
  ipcMain.handle('music:setDuration', (_e, id: number, seconds: number) =>
    setTrackDuration(Number(id), Number(seconds))
  )
  ipcMain.handle('music:setCollection', (_e, id: number, name: string) =>
    setTrackCollection(Number(id), String(name ?? ''))
  )
  ipcMain.handle('music:collections', () => listCollections())
  ipcMain.handle('music:pickCover', async (_e, id: number) => {
    const result = await dialog.showOpenDialog({
      title: '选择封面图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importCover(Number(id), result.filePaths[0])
  })
  ipcMain.handle('music:clearSegments', (_e, id: number) => clearSegments(Number(id)))
  ipcMain.handle('music:setCoverLib', (_e, id: number, coverId: string) =>
    setTrackCoverLib(Number(id), String(coverId ?? ''))
  )
  ipcMain.handle('music:words', (_e, id: number) => extractWordsFromTrack(Number(id)))
  ipcMain.handle('music:delete', (_e, id: number) => deleteTrack(Number(id)))
  ipcMain.handle('music:organize', (_e, id: number) =>
    organizeTrack(Number(id), (done, total) => {
      try {
        mainWin?.webContents.send('music:organize-progress', { id: Number(id), done, total })
      } catch {
        /* 窗口已关 */
      }
    })
  )
  ipcMain.handle('music:tick', (_e, seconds: number) => listeningTick(Number(seconds)))

  const win = createWindow()
  mainWin = win
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
        move: moveWordToBook,
        createBook,
        deleteBook,
        setCover: setBookCover
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
        genPrompts: generatePrompts,
        profile: generateWordProfile,
        tasks: { list: listTasks, add: addTask, toggle: toggleTask, remove: removeTask },
        favs: { list: listFavorites, add: addFavorite, remove: removeFavorite }
      },
      review: {
        queue: reviewQueue,
        graduate: graduateReview,
        tape: tapeReview,
        seed: enqueueReview
      },
      parse: { mcq: parseMcq },
      stats: {
        summary: statsSummary,
        seed: seedStats,
        cleanup: cleanupStats,
        cleanupReviewEvents,
        cleanupReading: cleanupReadingEvents
      },
      reading: {
        list: listArticles,
        create: createArticle,
        delete: deleteArticle,
        log: logReading,
        lookup: lookupWord,
        addWord: addWordToBook,
        translate: translateReading
      },
      music: {
        list: listTracks,
        importFromPath: importAudioFromPath,
        setText: setTrackText,
        setNotes: setTrackNotes,
        setDuration: setTrackDuration,
        setCollection: setTrackCollection,
        collections: listCollections,
        importCover,
        setCoverLib: setTrackCoverLib,
        clearSegments,
        words: extractWordsFromTrack,
        clean: cleanSubtitleText,
        remove: deleteTrack,
        tick: listeningTick,
        untick: unlisteningTick
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
