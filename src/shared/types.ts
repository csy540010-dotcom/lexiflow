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

/* ── 词汇库（M2） ─────────────────────── */

export interface BookSummary {
  id: number
  slug: string
  name: string
  source: string
  total: number
  learning: number
  mastered: number
  favorites: number
  due: number
}

export type WordFilter = 'all' | 'unlearned' | 'learning' | 'mastered' | 'favorite'

export interface WordListItem {
  id: number
  headword: string
  phonetic: string
  meaning: string
  status: 0 | 1 | 2
  favorite: 0 | 1
  masteryLevel: number
}

export interface WordQueryArgs {
  bookId: number
  query?: string
  filter?: WordFilter
  page?: number
  pageSize?: number
}

export interface WordListResult {
  total: number
  items: WordListItem[]
}

export interface MasteryData {
  recognition?: number
  comprehension?: number
  production?: number
  transfer?: number
}

export interface LearningRecordItem {
  id: number
  kind: string
  payload: unknown
  occurredAt: string
}

export interface WordDetailData {
  id: number
  bookId: number
  bookName: string
  headword: string
  phonetic: string
  meaning: string
  prompts: string[]
  status: 0 | 1 | 2
  favorite: 0 | 1
  notes: string
  mastery: MasteryData
  dueDate: string | null
  records: LearningRecordItem[]
}

export interface WordUpdatePatch {
  favorite?: 0 | 1
  notes?: string
  status?: 0 | 1 | 2
}

export interface ImportPreview {
  found: boolean
  version?: string
  books: Array<{ slug: string; name: string; wordCount: number }>
  reviewQueue: number
  translationWords: number
  warnings: string[]
}

export interface ImportResult extends ImportPreview {
  addedWords: number
  addedReviews: number
  addedRecords: number
  skippedWords: number
}

/* ── 学习（M3） ─────────────────────── */

export interface GradeScores {
  usage: number
  grammar: number
  collocation: number
  naturalness: number
}

export interface GradeIssue {
  original: string
  why: string
  fix: string
}

export interface GradePayload {
  scores: GradeScores
  revised: string
  issues: GradeIssue[]
  comment: string
}

export interface TodaySummary {
  bookId: number
  bookName: string
  totalWords: number
  learnedWords: number
  newRemaining: number
  reviewDue: number
  gradedToday: number
  dailyNew: number
}

export interface ExplainResult {
  content: string
  cached: boolean
}

export interface GradeResponse {
  grade: GradePayload
  word: WordDetailData | null
}

export interface CustomTaskItem {
  id: number
  kind: string
  title: string
  target: string
  doneToday: boolean
}

