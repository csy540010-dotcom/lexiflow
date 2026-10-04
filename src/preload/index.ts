import { contextBridge, ipcRenderer } from 'electron'

const api = {
  dbPing: (): Promise<{ sqliteVersion: string; dbPath: string }> => ipcRenderer.invoke('db:ping')
}

export type LexiApi = typeof api

contextBridge.exposeInMainWorld('lexi', api)
