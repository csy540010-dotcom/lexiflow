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
  ImportResult
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
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDir')
}

export type LexiApi = typeof api

contextBridge.exposeInMainWorld('lexi', api)
