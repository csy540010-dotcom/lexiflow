import { kvGet, kvSet, getDb } from './db'
import { chatCompletion } from './ai'
import { buildExplainPrompt, buildGradePrompt, extractJson, type GradeResult } from './prompts'
import { applyGradeToMastery, masteryAverage } from './mastery'
import { getWord } from './library'
import { getAiConfig } from './settings'
import type { CustomTaskItem, TodaySummary } from '../shared/types'

function planNumber(meta: 'dailyNew' | 'dailyReviewLimit' | 'dailyMinutes' | 'reviewIntensity'): number {
  try {
    const raw = kvGet('app_settings')
    if (raw) {
      const parsed = JSON.parse(raw) as { plan?: Record<string, number> }
      const v = Number(parsed.plan?.[meta])
      if (Number.isFinite(v) && v > 0) return v
    }
  } catch {
    /* 用默认值 */
  }
  return meta === 'dailyNew' ? 20 : meta === 'dailyReviewLimit' ? 50 : meta === 'dailyMinutes' ? 60 : 3
}

export function selectedBookId(): number | null {
  const v = kvGet('selected_book_id')
  return v ? Number(v) : null
}

export function selectBook(bookId: number): void {
  kvSet('selected_book_id', String(bookId))
}

function bookExists(bookId: number): boolean {
  return !!getDb().prepare('SELECT id FROM books WHERE id = ?').get(bookId)
}

export function resolveBookId(bookId?: number): number {
  if (bookId && bookExists(bookId)) return bookId
  const saved = selectedBookId()
  if (saved && bookExists(saved)) return saved
  const first = getDb().prepare("SELECT id FROM books ORDER BY CASE slug WHEN 'cet4' THEN 1 WHEN 'cet6' THEN 2 ELSE 3 END, id").get() as
    | { id: number }
    | undefined
  if (!first) throw new Error('还没有词书，请先在词汇库导入或新建。')
  return first.id
}

export function todaySummary(bookId?: number): TodaySummary {
  const db = getDb()
  const id = resolveBookId(bookId)
  const book = db.prepare('SELECT id, name FROM books WHERE id = ?').get(id) as { id: number; name: string }
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status > 0 THEN 1 ELSE 0 END) AS learned
       FROM words WHERE book_id = ?`
    )
    .get(id) as { total: number; learned: number | null }
  const unlearned = Number(counts.total) - Number(counts.learned ?? 0)
  const dailyNew = planNumber('dailyNew')
  const reviewDue = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM review_queue rq JOIN words w ON w.id = rq.word_id
           WHERE w.book_id = ? AND rq.due_date <= date('now', 'localtime')`
        )
        .get(id) as { n: number }
    ).n
  )
  const gradedToday = Number(
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT r.word_id) AS n FROM learning_records r
           JOIN words w ON w.id = r.word_id
           WHERE r.kind = 'ai_grade' AND date(r.occurred_at, 'localtime') = date('now', 'localtime')`
        )
        .get() as { n: number }
    ).n
  )
  return {
    bookId: book.id,
    bookName: book.name,
    totalWords: Number(counts.total),
    learnedWords: Number(counts.learned ?? 0),
    newRemaining: Math.max(0, Math.min(dailyNew, unlearned)),
    reviewDue,
    gradedToday,
    dailyNew
  }
}

/** 今日新词队列：当前词书里 status=0 的前 dailyNew 个（按加入顺序）。 */
export function todayQueue(bookId?: number): number[] {
  const id = resolveBookId(bookId)
  const rows = getDb()
    .prepare('SELECT id FROM words WHERE book_id = ? AND status = 0 ORDER BY id LIMIT ?')
    .all(id, planNumber('dailyNew')) as unknown as Array<{ id: number }>
  return rows.map((r) => r.id)
}

export async function explainWord(wordId: number): Promise<{ content: string; cached: boolean }> {
  const word = getWord(wordId)
  if (!word) throw new Error('词条不存在。')
  const db = getDb()
  const existing = db
    .prepare("SELECT payload FROM learning_records WHERE word_id = ? AND kind = 'ai_explain' ORDER BY id DESC")
    .get(wordId) as { payload: string } | undefined
  if (existing) {
    try {
      const parsed = JSON.parse(existing.payload) as { content?: string }
      if (parsed.content) return { content: parsed.content, cached: true }
    } catch {
      /* 重新生成 */
    }
  }
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')
  const content = await chatCompletion(cfg, [{ role: 'user', content: buildExplainPrompt(word.headword, word.phonetic, word.meaning) }], {
    maxTokens: 900,
    timeoutMs: 60_000
  })
  db.prepare("DELETE FROM learning_records WHERE word_id = ? AND kind = 'ai_explain'").run(wordId)
  db.prepare("INSERT INTO learning_records (word_id, kind, payload) VALUES (?, 'ai_explain', ?)").run(
    wordId,
    JSON.stringify({ content })
  )
  return { content, cached: false }
}

export async function gradeSentence(wordId: number, sentence: string): Promise<{ grade: GradeResult; word: ReturnType<typeof getWord> }> {
  const word = getWord(wordId)
  if (!word) throw new Error('词条不存在。')
  const trimmed = sentence.trim()
  if (!trimmed) throw new Error('先写一个句子再提交批改。')
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')

  const raw = await chatCompletion(cfg, [{ role: 'user', content: buildGradePrompt(word.headword, trimmed) }], {
    maxTokens: 1200,
    timeoutMs: 90_000
  })
  const grade = extractJson(raw)
  if (!grade) throw new Error('AI 返回格式异常，请重试一次。')

  const db = getDb()
  db.prepare("INSERT INTO learning_records (word_id, kind, payload) VALUES (?, 'ai_grade', ?)").run(
    wordId,
    JSON.stringify({ sentence: trimmed, grade })
  )
  const mastery = applyGradeToMastery(word.mastery, grade.scores)
  const avg = masteryAverage(mastery)
  const status = avg >= 4.5 ? 2 : word.status === 0 ? 1 : word.status
  db.prepare('UPDATE words SET mastery = ?, status = ? WHERE id = ?').run(JSON.stringify(mastery), status, wordId)
  return { grade, word: getWord(wordId) }
}

/* ── 自定义任务（听力 / 阅读 / 写作…） ─────────────── */

interface TaskRow {
  id: number
  kind: string
  title: string
  target: string
  doneToday: number
}

function todayKey(): string {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export function listTasks(): CustomTaskItem[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.kind, t.title, t.target,
              (SELECT COUNT(*) FROM task_logs l WHERE l.task_id = t.id AND l.date = ?) AS doneToday
       FROM custom_tasks t ORDER BY t.id`
    )
    .all(todayKey()) as unknown as TaskRow[]
  return rows.map((r) => ({ ...r, doneToday: Number(r.doneToday) > 0 }))
}

export function addTask(kind: string, title: string, target: string): CustomTaskItem[] {
  const t = title.trim()
  if (!t) throw new Error('任务名称不能为空。')
  getDb()
    .prepare("INSERT INTO custom_tasks (kind, title, target) VALUES (?, ?, ?)")
    .run(['listening', 'reading', 'writing', 'custom'].includes(kind) ? kind : 'custom', t, target.trim())
  return listTasks()
}

export function removeTask(id: number): CustomTaskItem[] {
  getDb().prepare('DELETE FROM custom_tasks WHERE id = ?').run(Number(id))
  return listTasks()
}

export function toggleTask(id: number, done: boolean): CustomTaskItem[] {
  if (done) {
    getDb()
      .prepare('INSERT OR IGNORE INTO task_logs (task_id, date) VALUES (?, ?)')
      .run(Number(id), todayKey())
  } else {
    getDb()
      .prepare('DELETE FROM task_logs WHERE task_id = ? AND date = ?')
      .run(Number(id), todayKey())
  }
  return listTasks()
}
