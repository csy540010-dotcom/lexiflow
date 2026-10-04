import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, SettingsPatch, AiTestResult, AiSettingsPublic } from '../shared/types'

const api = {
  dbPing: (): Promise<{ sqliteVersion: string; dbPath: string }> => ipcRenderer.invoke('db:ping'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: SettingsPatch): Promise<AppSettings> => ipcRenderer.invoke('settings:save', patch),
  setAiKey: (key: string): Promise<AiSettingsPublic> => ipcRenderer.invoke('ai:key:set', key),
  testAi: (cfg?: Partial<{ preset: string; baseUrl: string; apiKey: string; model: string }>): Promise<AiTestResult> =>
    ipcRenderer.invoke('ai:test', cfg)
}

export type LexiApi = typeof api

contextBridge.exposeInMainWorld('lexi', api)
