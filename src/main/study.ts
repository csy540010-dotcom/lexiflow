import { kvGet, kvSet, getDb } from './db'
import { chatCompletion } from './ai'
import { buildExplainPrompt, buildGradePrompt, buildGenPromptsPrompt, buildWordProfilePrompt, extractJson, extractJsonObject, extractPrompts, type GradeResult } from './prompts'
import { applyGradeToMastery, masteryAverage } from './mastery'
import { getWord } from './library'
import { getAiConfig } from './settings'
import type { CustomTaskItem, TodaySummary, SentenceFavoriteItem, WordProfile } from '../shared/types'

export function planNumber(meta: 'dailyNew' | 'dailyReviewLimit' | 'dailyMinutes' | 'reviewIntensity'): number {
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
  const practicedToday = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM study_events WHERE kind = 'practice'
           AND json_extract(payload, '$.date') = date('now', 'localtime')`
        )
        .get() as { n: number }
    ).n
  )
  // 今日已学新词（首次从「未学习」进入学习状态时留下 learn 事件），按当前词书统计
  const learnedToday = Number(
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT json_extract(payload, '$.wordId')) AS n FROM study_events
           WHERE kind = 'learn' AND json_extract(payload, '$.date') = ?
             AND json_extract(payload, '$.wordId') IN (SELECT id FROM words WHERE book_id = ?)`
        )
        .get(todayKey(), id) as { n: number }
    ).n
  )
  return {
    bookId: book.id,
    bookName: book.name,
    totalWords: Number(counts.total),
    learnedWords: Number(counts.learned ?? 0),
    newRemaining: Math.max(0, Math.min(dailyNew - learnedToday, unlearned)),
    reviewDue,
    gradedToday,
    dailyNew,
    practicedToday
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
  if (status === 2 && word.status !== 2) {
    // 首次达到「已掌握」：记下时间戳，供统计分析「新掌握词」
    db.prepare('UPDATE words SET mastery = ?, status = ?, mastered_at = ? WHERE id = ?').run(
      JSON.stringify(mastery),
      status,
      todayKey(),
      wordId
    )
  } else {
    db.prepare('UPDATE words SET mastery = ?, status = ? WHERE id = ?').run(JSON.stringify(mastery), status, wordId)
  }
  if (word.status === 0 && status > 0) {
    // 今日新词计数：这个词今天首次从「未学习」进入学习
    db.prepare("INSERT INTO study_events (kind, payload) VALUES ('learn', ?)").run(
      JSON.stringify({ date: todayKey(), wordId })
    )
  }
  return { grade, word: getWord(wordId) }
}

/** 无内置提示时用 AI 现场生成，生成后并入该词的提示列表（与内置提示同等对待）。 */
export async function generatePrompts(wordId: number): Promise<{ prompts: string[] }> {
  const word = getWord(wordId)
  if (!word) throw new Error('词条不存在。')
  if (word.prompts.length > 0) return { prompts: word.prompts }
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')
  const raw = await chatCompletion(cfg, [{ role: 'user', content: buildGenPromptsPrompt(word.headword, word.meaning) }], {
    maxTokens: 500,
    timeoutMs: 45_000
  })
  const prompts = extractPrompts(raw)
  if (prompts.length === 0) throw new Error('AI 返回格式异常，请重试一次。')
  getDb().prepare('UPDATE words SET prompts = ? WHERE id = ?').run(JSON.stringify(prompts), wordId)
  return { prompts }
}

/** 单词详情：AI 结构化学习资料（释义与用法 / 例句 / 搭配 / 相关词 / 词形变化），本地缓存。 */
function normalizeProfile(raw: unknown): WordProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [])
  const objArr = (v: unknown, k1: string, k2: string): Array<Record<string, string>> =>
    Array.isArray(v)
      ? v
          .map((x) => {
            const it = x as Record<string, unknown>
            return { [k1]: String(it?.[k1] ?? '').trim(), [k2]: String(it?.[k2] ?? '').trim() }
          })
          .filter((it) => it[k1])
      : []
  const profile: WordProfile = {
    definitions: strArr(o.definitions),
    examples: objArr(o.examples, 'en', 'zh') as WordProfile['examples'],
    collocations: objArr(o.collocations, 'phrase', 'zh') as WordProfile['collocations'],
    related: objArr(o.related, 'word', 'zh') as WordProfile['related'],
    forms: strArr(o.forms)
  }
  if (profile.definitions.length === 0 && profile.examples.length === 0) return null
  return profile
}

export async function generateWordProfile(wordId: number): Promise<{ profile: WordProfile; cached: boolean }> {
  const word = getWord(wordId)
  if (!word) throw new Error('词条不存在。')
  const db = getDb()
  const existing = db
    .prepare("SELECT payload FROM learning_records WHERE word_id = ? AND kind = 'ai_profile' ORDER BY id DESC LIMIT 1")
    .get(wordId) as { payload: string } | undefined
  if (existing) {
    try {
      const parsed = JSON.parse(existing.payload) as { profile?: unknown }
      const profile = normalizeProfile(parsed.profile)
      if (profile) return { profile, cached: true }
    } catch {
      /* 重新生成 */
    }
  }
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')
  const raw = await chatCompletion(
    cfg,
    [{ role: 'user', content: buildWordProfilePrompt(word.headword, word.phonetic, word.meaning) }],
    { maxTokens: 1600, timeoutMs: 90_000 }
  )
  const profile = normalizeProfile(extractJsonObject(raw))
  if (!profile) throw new Error('AI 返回格式异常，请重试一次。')
  db.prepare("DELETE FROM learning_records WHERE word_id = ? AND kind = 'ai_profile'").run(wordId)
  db.prepare("INSERT INTO learning_records (word_id, kind, payload) VALUES (?, 'ai_profile', ?)").run(
    wordId,
    JSON.stringify({ profile })
  )
  return { profile, cached: false }
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

/* ── 句子收藏 ─────────────── */

function mapFav(r: { id: number; word_id: number; sentence: string; source: string; created_at: string }): SentenceFavoriteItem {
  return { id: r.id, wordId: r.word_id, sentence: r.sentence, source: r.source, createdAt: r.created_at }
}

export function listFavorites(wordId: number): SentenceFavoriteItem[] {
  return (
    getDb()
      .prepare('SELECT id, word_id, sentence, source, created_at FROM sentence_favorites WHERE word_id = ? ORDER BY id DESC')
      .all(Number(wordId))
      .map((r) => mapFav(r as { id: number; word_id: number; sentence: string; source: string; created_at: string }))
  )
}

export function addFavorite(wordId: number, sentence: string, source: string): SentenceFavoriteItem[] {
  const text = sentence.trim()
  if (!text) throw new Error('句子为空，不能收藏。')
  const dup = getDb()
    .prepare('SELECT id FROM sentence_favorites WHERE word_id = ? AND sentence = ?')
    .get(Number(wordId), text)
  if (!dup) {
    getDb()
      .prepare("INSERT INTO sentence_favorites (word_id, sentence, source) VALUES (?, ?, ?)")
      .run(Number(wordId), text, source === 'original' ? 'original' : 'revised')
  }
  return listFavorites(wordId)
}

export function removeFavorite(id: number): SentenceFavoriteItem[] {
  const row = getDb().prepare('SELECT word_id FROM sentence_favorites WHERE id = ?').get(Number(id)) as
    | { word_id: number }
    | undefined
  getDb().prepare('DELETE FROM sentence_favorites WHERE id = ?').run(Number(id))
  return row ? listFavorites(row.word_id) : []
}
