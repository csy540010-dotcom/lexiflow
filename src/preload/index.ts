import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  SettingsPatch,
  AiTestResult,
  AiSettingsPublic,
  BookSummary,
  WordDetailData,
  WordListResult,
  WordQueryArgs,
  WordUpdatePatch,
  ImportPreview,
  ImportResult,
  TodaySummary,
  ExplainResult,
  GradeResponse,
  CustomTaskItem,
  SentenceFavoriteItem,
  ReviewQueueResult,
  PracticeType,
  McqResponse,
  PracticePoolItem,
  StatsSummary,
  ArticleItem,
  DictLookup,
  TrackItem
} from '../shared/types'

const api = {
  dbPing: (): Promise<{ sqliteVersion: string; dbPath: string }> => ipcRenderer.invoke('db:ping'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: SettingsPatch): Promise<AppSettings> => ipcRenderer.invoke('settings:save', patch),
  setAiKey: (key: string): Promise<AiSettingsPublic> => ipcRenderer.invoke('ai:key:set', key),
  testAi: (cfg?: Partial<{ preset: string; baseUrl: string; apiKey: string; model: string }>): Promise<AiTestResult> =>
    ipcRenderer.invoke('ai:test', cfg),

  listBooks: (): Promise<BookSummary[]> => ipcRenderer.invoke('library:books:list'),
  createBook: (name: string): Promise<number> => ipcRenderer.invoke('library:books:create', name),
  renameBook: (id: number, name: string): Promise<void> => ipcRenderer.invoke('library:books:rename', id, name),
  deleteBook: (id: number): Promise<void> => ipcRenderer.invoke('library:books:delete', id),
  queryWords: (args: WordQueryArgs): Promise<WordListResult> => ipcRenderer.invoke('library:words:query', args),
  getWord: (id: number): Promise<WordDetailData | null> => ipcRenderer.invoke('library:words:get', id),
  updateWord: (id: number, patch: WordUpdatePatch): Promise<WordDetailData | null> =>
    ipcRenderer.invoke('library:words:update', id, patch),
  addWord: (bookId: number, headword: string): Promise<WordDetailData> =>
    ipcRenderer.invoke('library:words:add', bookId, headword),

  importDetect: (dir: string): Promise<ImportPreview> => ipcRenderer.invoke('import:obsidian:detect', dir),
  importRun: (dir: string): Promise<ImportResult> => ipcRenderer.invoke('import:obsidian:run', dir),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDir'),

  studySummary: (bookId?: number): Promise<TodaySummary> => ipcRenderer.invoke('study:summary', bookId),
  studyQueue: (bookId?: number): Promise<number[]> => ipcRenderer.invoke('study:queue', bookId),
  selectBook: (bookId: number): Promise<void> => ipcRenderer.invoke('study:selectBook', bookId),
  selectedBook: (): Promise<number | null> => ipcRenderer.invoke('study:selectedBook'),
  explainWord: (wordId: number): Promise<ExplainResult> => ipcRenderer.invoke('study:explain', wordId),
  genPrompts: (wordId: number): Promise<{ prompts: string[] }> => ipcRenderer.invoke('study:genPrompts', wordId),
  gradeSentence: (wordId: number, sentence: string): Promise<GradeResponse> =>
    ipcRenderer.invoke('study:submit', wordId, sentence),
  listTasks: (): Promise<CustomTaskItem[]> => ipcRenderer.invoke('tasks:list'),
  addTask: (kind: string, title: string, target: string): Promise<CustomTaskItem[]> =>
    ipcRenderer.invoke('tasks:add', kind, title, target),
  removeTask: (id: number): Promise<CustomTaskItem[]> => ipcRenderer.invoke('tasks:remove', id),
  toggleTask: (id: number, done: boolean): Promise<CustomTaskItem[]> => ipcRenderer.invoke('tasks:toggle', id, done),

  listFavorites: (wordId: number): Promise<SentenceFavoriteItem[]> => ipcRenderer.invoke('fav:list', wordId),
  addFavorite: (wordId: number, sentence: string, source: string): Promise<SentenceFavoriteItem[]> =>
    ipcRenderer.invoke('fav:add', wordId, sentence, source),
  removeFavorite: (id: number): Promise<SentenceFavoriteItem[]> => ipcRenderer.invoke('fav:remove', id),

  reviewQueue: (): Promise<ReviewQueueResult> => ipcRenderer.invoke('review:queue'),
  graduateReview: (wordId: number): Promise<void> => ipcRenderer.invoke('review:graduate', wordId),
  tapeReview: (wordId: number): Promise<void> => ipcRenderer.invoke('review:tape', wordId),
  enqueueReview: (wordId: number, dueDate: string): Promise<void> => ipcRenderer.invoke('review:enqueue', wordId, dueDate),

  practiceTypes: (): Promise<Array<{ id: PracticeType; label: string; engine: string; desc: string }>> =>
    ipcRenderer.invoke('practice:types'),
  practicePool: (limit?: number): Promise<PracticePoolItem[]> => ipcRenderer.invoke('practice:pool', limit),
  redoPool: (limit?: number): Promise<PracticePoolItem[]> => ipcRenderer.invoke('practice:redoPool', limit),
  genMcq: (wordId: number, type: PracticeType): Promise<McqResponse> => ipcRenderer.invoke('practice:mcq', wordId, type),
  genSentenceTask: (wordId: number, type: PracticeType): Promise<{ instruction: string; cached: boolean }> =>
    ipcRenderer.invoke('practice:task', wordId, type),
  recordPractice: (type: PracticeType, payload: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('practice:record', type, payload),

  statsSummary: (days: number | null): Promise<StatsSummary> => ipcRenderer.invoke('stats:summary', days),
  statsTick: (seconds: number): Promise<void> => ipcRenderer.invoke('stats:tick', seconds),

  listArticles: (): Promise<ArticleItem[]> => ipcRenderer.invoke('reading:list'),
  createArticle: (title: string, content: string, source: string): Promise<ArticleItem> =>
    ipcRenderer.invoke('reading:create', title, content, source),
  deleteArticle: (id: number): Promise<void> => ipcRenderer.invoke('reading:delete', id),
  logReading: (id: number): Promise<void> => ipcRenderer.invoke('reading:log', id),
  lookupWord: (word: string, bookId?: number): Promise<DictLookup> => ipcRenderer.invoke('reading:lookup', word, bookId),
  addWordToBook: (headword: string, bookId?: number): Promise<{ word: WordDetailData | null; added: boolean }> =>
    ipcRenderer.invoke('reading:addWord', headword, bookId),
  translateReading: (text: string): Promise<{ translated: string; cached: boolean }> =>
    ipcRenderer.invoke('reading:translate', text),
  importArticleFile: (): Promise<ArticleItem | null> => ipcRenderer.invoke('reading:importFile'),

  listTracks: (): Promise<TrackItem[]> => ipcRenderer.invoke('music:list'),
  importAudio: (): Promise<TrackItem | null> => ipcRenderer.invoke('music:import'),
  setTrackText: (id: number, text: string): Promise<TrackItem> => ipcRenderer.invoke('music:setText', id, text),
  deleteTrack: (id: number): Promise<TrackItem[]> => ipcRenderer.invoke('music:delete', id),
  organizeTrack: (id: number): Promise<TrackItem> => ipcRenderer.invoke('music:organize', id),
  listeningTick: (seconds: number): Promise<void> => ipcRenderer.invoke('music:tick', seconds)
}

export type LexiApi = typeof api

contextBridge.exposeInMainWorld('lexi', api)
