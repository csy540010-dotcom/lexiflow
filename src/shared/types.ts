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
  coverId: string
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
  practicedToday: number
}

/* ── 复习巩固 + 单词练习（M4） ─────────────── */

export type ReviewReason = 'relearn' | 'usage' | 'collocation' | 'transfer'

export interface ReviewItem {
  wordId: number
  headword: string
  reason: ReviewReason
}

export interface ReviewQueueResult {
  items: ReviewItem[]
  counts: Record<ReviewReason, number>
  total: number
  graduateLine: number
}

export type PracticeType = 'translate' | 'free' | 'redo' | 'context' | 'collocation' | 'synonym'

export interface McqQuestion {
  stem: string
  options: string[]
  answer: number
  explanation: string
}

export interface McqResponse extends McqQuestion {
  word: string
  cached: boolean
}

export interface PracticePoolItem {
  wordId: number
  headword: string
  sentence?: string
}

/* ── 统计分析（M5） ─────────────── */

export interface StatsSummary {
  studyMinutes: number
  newMastered: number
  gradedCount: number
  gradeAvg: number
  mcqTotal: number
  mcqCorrect: number
  reviewGraduated: number
  reviewTaped: number
  topMistakes: Array<{ word: string; count: number }>
  tasksDone: Array<{ kind: string; count: number }>
  mastery: { unlearned: number; learning: number; mastered: number }
  readingArticles: number
  readingChars: number
  listeningMinutes: number
}

/* ── 阅读 + 音乐听力（M6） ─────────────── */

export interface ArticleItem {
  id: number
  title: string
  content: string
  source: string
  createdAt: string
  lastReadAt: string
  chars: number
}

export interface DictLookup {
  word: string
  found: boolean
  phonetic: string
  meaning: string
  inBook: boolean
  wordId?: number
  bookId: number
}

export interface TrackItem {
  id: number
  title: string
  audioFile: string
  textContent: string
  segments: string[]
  notes: string
  duration: number
  collection: string
  coverFile: string
  coverId: string
  createdAt: string
}

/* ── 封面库（书 + 听力共用） ─────────────── */

/** 封面库总数：8 种场景 × 4 种配色。 */
export const COVER_LIBRARY_SIZE = 32

/** 封面库 ID：c00 - c31。 */
export function coverIdAt(index: number): string {
  const n = ((index % COVER_LIBRARY_SIZE) + COVER_LIBRARY_SIZE) % COVER_LIBRARY_SIZE
  return 'c' + String(n).padStart(2, '0')
}

/* ── 单词详情增强（M6.5） ─────────────── */

export interface WordProfile {
  definitions: string[]
  examples: Array<{ en: string; zh: string }>
  collocations: Array<{ phrase: string; zh: string }>
  related: Array<{ word: string; zh: string }>
  forms: string[]
}

export interface MusicWordItem {
  word: string
  phonetic: string
  meaning: string
  inBook: boolean
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

export interface SentenceFavoriteItem {
  id: number
  wordId: number
  sentence: string
  source: string
  createdAt: string
}

