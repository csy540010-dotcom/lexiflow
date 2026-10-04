import type { AiPresetId } from './ai-presets'

export interface AiSettingsPublic {
  preset: AiPresetId | string
  baseUrl: string
  model: string
  hasKey: boolean
  keyMasked: string
}

export interface PlanSettings {
  dailyNew: number
  dailyReviewLimit: number
  dailyMinutes: number
  reviewIntensity: number
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system'
}

export interface AppSettings {
  ai: AiSettingsPublic
  plan: PlanSettings
  appearance: AppearanceSettings
  about: {
    appVersion: string
    electronVersion: string
    sqliteVersion: string
  }
}

export interface SettingsPatch {
  ai?: Partial<Pick<AiSettingsPublic, 'preset' | 'baseUrl' | 'model'>>
  plan?: Partial<PlanSettings>
  appearance?: Partial<AppearanceSettings>
}

export interface AiTestResult {
  ok: boolean
  reply?: string
  error?: string
}
