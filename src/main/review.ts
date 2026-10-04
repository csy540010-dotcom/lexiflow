import { getDb } from './db'
import { getWord } from './library'
import { resolveBookId } from './study'
import type { WordDetailData } from '../shared/types'

/**
 * 复习巩固（胶带即测试的 LexiFlow 版）：
 * - 到期词按薄弱类型分组决定「练什么」，不是重新看一遍单词；
 * - 批改四维均分 ≥ 3.5 → 毕业出队（毕业词不自动回队）；
 * - 批改不达标或用户点「还是不熟」→ 明天再来。
 */

export type ReviewReason = 'relearn' | 'usage' | 'collocation' | 'transfer'

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  relearn: '需要重新理解',
  usage: '需要重新使用',
  collocation: '搭配薄弱',
  transfer: '迁移测试'
}

export interface ReviewItem {
  wordId: number
  headword: string
  reason: ReviewReason
}

export interface ReviewQueueResult {
  items: ReviewItem[]
  counts: Record<ReviewReason, number>
  total: number
}

const REASON_ORDER: ReviewReason[] = ['relearn', 'usage', 'collocation', 'transfer']

function shuffle<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 从最近一次批改成绩判断薄弱类型。 */
export function weaknessOf(word: WordDetailData): ReviewReason {
  const gradeRec = [...word.records].reverse().find((r) => r.kind === 'ai_grade')
  if (!gradeRec) return 'relearn'
  const payload = gradeRec.payload as {
    grade?: { scores?: { usage?: number; grammar?: number; collocation?: number; naturalness?: number } }
  }
  const s = payload.grade?.scores
  if (!s) return 'relearn'
  if ((s.usage ?? 5) <= 2) return 'usage'
  if ((s.collocation ?? 5) <= 2) return 'collocation'
  const avg = ((s.usage ?? 5) + (s.grammar ?? 5) + (s.collocation ?? 5) + (s.naturalness ?? 5)) / 4
  if (avg < 4) return 'transfer'
  return 'transfer'
}

export function reviewQueue(bookId?: number): ReviewQueueResult {
  const id = resolveBookId(bookId)
  const rows = getDb()
    .prepare(
      `SELECT w.id, w.headword FROM review_queue rq JOIN words w ON w.id = rq.word_id
       WHERE w.book_id = ? AND rq.due_date <= date('now', 'localtime')
       ORDER BY rq.due_date, w.id`
    )
    .all(id) as unknown as Array<{ id: number; headword: string }>

  const buckets: Record<ReviewReason, ReviewItem[]> = { relearn: [], usage: [], collocation: [], transfer: [] }
  for (const row of rows) {
    const word = getWord(row.id)
    if (!word) continue
    buckets[weaknessOf(word)].push({ wordId: row.id, headword: row.headword, reason: 'relearn' })
  }
  // reason 在上面只能先占位，逐桶回填真实类型
  for (const reason of REASON_ORDER) {
    for (const item of buckets[reason]) item.reason = reason
  }
  const items = REASON_ORDER.flatMap((reason) => shuffle(buckets[reason]))
  const counts = { relearn: buckets.relearn.length, usage: buckets.usage.length, collocation: buckets.collocation.length, transfer: buckets.transfer.length }
  return { items, counts, total: items.length }
}

/** 复习事件留痕（统计分析用）。 */
function logReviewEvent(kind: 'review_graduate' | 'review_tape', wordId: number): void {
  const d = new Date()
  const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const headword = (
    getDb().prepare('SELECT headword FROM words WHERE id = ?').get(Number(wordId)) as { headword: string } | undefined
  )?.headword
  getDb()
    .prepare("INSERT INTO study_events (kind, payload) VALUES (?, ?)")
    .run(kind, JSON.stringify({ date, wordId: Number(wordId), headword: headword ?? '' }))
}

/** 毕业出队：毕业词不自动回队，只能靠学习时再点「不熟」回来。 */
export function graduateReview(wordId: number): void {
  getDb().prepare('DELETE FROM review_queue WHERE word_id = ?').run(Number(wordId))
  logReviewEvent('review_graduate', wordId)
}

/** 还不会：明天再来。 */
export function tapeReview(wordId: number): void {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const due = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  getDb()
    .prepare(
      `INSERT INTO review_queue (word_id, due_date, reason, added_at) VALUES (?, ?, 'tape', date('now','localtime'))
       ON CONFLICT(word_id) DO UPDATE SET due_date = excluded.due_date, reason = 'tape'`
    )
    .run(Number(wordId), due)
  logReviewEvent('review_tape', wordId)
}

/** 学习时点胶带 = 不熟 → 入队（复习语义之外，供学习会话复用）。 */
export function enqueueReview(wordId: number, dueDate: string): void {
  getDb()
    .prepare(
      `INSERT INTO review_queue (word_id, due_date, reason, added_at) VALUES (?, ?, 'tape', date('now','localtime'))
       ON CONFLICT(word_id) DO UPDATE SET due_date = excluded.due_date`
    )
    .run(Number(wordId), dueDate)
}
