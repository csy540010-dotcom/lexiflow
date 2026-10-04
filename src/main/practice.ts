import { getDb, kvGet } from './db'
import { chatCompletion } from './ai'
import { buildMcqPrompt, buildSentenceTaskPrompt, parseMcq } from './prompts'
import { getWord } from './library'
import { resolveBookId } from './study'
import { getAiConfig } from './settings'
import type { McqQuestion, PracticeType } from '../shared/types'

/**
 * 单词练习（专项能力训练）：
 * - 造句类 translate / free / redo → 用户写英文，复用批改引擎判分
 * - 选择类 context / collocation / synonym → AI 出四选一，本地判分
 */

export const PRACTICE_TYPES: Array<{ id: PracticeType; label: string; engine: 'mcq' | 'sentence'; desc: string }> = [
  { id: 'translate', label: '中译英', engine: 'sentence', desc: 'AI 给中文句子，你翻译成英文' },
  { id: 'free', label: '自由表达', engine: 'sentence', desc: '围绕场景自由写句子' },
  { id: 'redo', label: '错误重练', engine: 'sentence', desc: '把之前批改出错的句子重新写对' },
  { id: 'context', label: '语境选词', engine: 'mcq', desc: '例句挖空，选出正确的词' },
  { id: 'collocation', label: '搭配辨析', engine: 'mcq', desc: '选出地道的搭配' },
  { id: 'synonym', label: '近义词辨析', engine: 'mcq', desc: '近义词里选最合适的' }
]

export function practiceEngine(type: PracticeType): 'mcq' | 'sentence' {
  return PRACTICE_TYPES.find((t) => t.id === type)?.engine ?? 'mcq'
}

function planDailyNew(): number {
  try {
    const raw = kvGet('app_settings')
    if (raw) {
      const v = Number((JSON.parse(raw) as { plan?: { dailyNew?: number } }).plan?.dailyNew)
      if (Number.isFinite(v) && v > 0) return v
    }
  } catch {
    /* 默认 */
  }
  return 20
}

/** 练习词池：当前词书最近开始学的词（status>0，取最新的一批）。 */
export function practicePool(limit = 8): Array<{ wordId: number; headword: string }> {
  const id = resolveBookId()
  return (
    getDb()
      .prepare('SELECT id, headword FROM words WHERE book_id = ? AND status > 0 ORDER BY id DESC LIMIT ?')
      .all(id, Math.max(1, Math.min(20, limit))) as unknown as Array<{ id: number; headword: string }>
  ).map((r) => ({ wordId: r.id, headword: r.headword }))
}

/** 错误重练池：最近一次批改有错误点的词。 */
export function redoPool(limit = 6): Array<{ wordId: number; headword: string; sentence: string }> {
  const rows = getDb()
    .prepare(
      `SELECT r.word_id, w.headword, r.payload FROM learning_records r
       JOIN words w ON w.id = r.word_id
       WHERE r.kind = 'ai_grade' ORDER BY r.id DESC LIMIT 60`
    )
    .all() as unknown as Array<{ word_id: number; headword: string; payload: string }>
  const out: Array<{ wordId: number; headword: string; sentence: string }> = []
  const seen = new Set<number>()
  for (const row of rows) {
    if (seen.has(row.word_id)) continue
    try {
      const p = JSON.parse(row.payload) as { grade?: { issues?: unknown[] } }
      if (p.grade?.issues && p.grade.issues.length > 0) {
        seen.add(row.word_id)
        out.push({ wordId: row.word_id, headword: row.headword, sentence: '' })
      }
    } catch {
      /* 跳过坏记录 */
    }
    if (out.length >= limit) break
  }
  return out
}

function cachedMcq(wordId: number, type: PracticeType): McqQuestion | null {
  const rows = getDb()
    .prepare("SELECT payload FROM learning_records WHERE word_id = ? AND kind = 'mcq' ORDER BY id DESC LIMIT 8")
    .all(Number(wordId)) as unknown as Array<{ payload: string }>
  for (const row of rows) {
    try {
      const p = JSON.parse(row.payload) as McqQuestion & { type?: string }
      if (p.type === type && p.stem && Array.isArray(p.options) && p.options.length === 4) {
        return { stem: p.stem, options: p.options, answer: p.answer, explanation: p.explanation }
      }
    } catch {
      /* 跳过坏记录 */
    }
  }
  return null
}

export async function genMcq(wordId: number, type: PracticeType): Promise<McqQuestion & { word: string; cached: boolean }> {
  const word = getWord(wordId)
  if (!word) throw new Error('词条不存在。')
  const cached = cachedMcq(wordId, type)
  if (cached) return { ...cached, word: word.headword, cached: true }
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')
  const basePrompt = buildMcqPrompt(word.headword, word.meaning, type)
  const raw = await chatCompletion(cfg, [{ role: 'user', content: basePrompt }], {
    maxTokens: 700,
    timeoutMs: 60_000
  })
  let q = parseMcq(raw)
  if (!q) {
    // 弱模型偶发输出杂文：用更严格的提示重试一次，仍失败再报错
    const raw2 = await chatCompletion(
      cfg,
      [{ role: 'user', content: basePrompt + '\n\n上一次输出无法解析。这次请只输出一个 JSON 对象，不要任何解释、围栏或额外文字。' }],
      { maxTokens: 700, timeoutMs: 60_000 }
    )
    q = parseMcq(raw2)
  }
  if (!q) throw new Error('AI 连续两次返回格式异常，请稍后重试。')
  getDb()
    .prepare("INSERT INTO learning_records (word_id, kind, payload) VALUES (?, 'mcq', ?)")
    .run(wordId, JSON.stringify({ type, ...q }))
  return { ...q, word: word.headword, cached: false }
}

/** 造句类练习的任务说明（中译英给中文句 / 自由表达给场景；错误重练由前端直接取历史错误）。 */
export async function genSentenceTask(wordId: number, type: PracticeType): Promise<{ instruction: string; cached: boolean }> {
  if (type !== 'translate' && type !== 'free') throw new Error('该练习类型不需要生成任务。')
  const word = getWord(wordId)
  if (!word) throw new Error('词条不存在。')
  const kind = 'task_' + type
  const existing = getDb()
    .prepare('SELECT payload FROM learning_records WHERE word_id = ? AND kind = ? ORDER BY id DESC LIMIT 1')
    .get(wordId, kind) as { payload: string } | undefined
  if (existing) {
    try {
      const p = JSON.parse(existing.payload) as { instruction?: string }
      if (p.instruction) return { instruction: p.instruction, cached: true }
    } catch {
      /* 重新生成 */
    }
  }
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')
  const content = await chatCompletion(cfg, [{ role: 'user', content: buildSentenceTaskPrompt(word.headword, word.meaning, type) }], {
    maxTokens: 300,
    timeoutMs: 45_000
  })
  const instruction = content.trim().split('\n')[0].slice(0, 300)
  if (!instruction) throw new Error('AI 返回格式异常，请重试一次。')
  getDb()
    .prepare('INSERT INTO learning_records (word_id, kind, payload) VALUES (?, ?, ?)')
    .run(wordId, kind, JSON.stringify({ instruction }))
  return { instruction, cached: false }
}

/** 练习结果留痕（统计分析 M5 用）。 */
export function recordPractice(type: PracticeType, payload: Record<string, unknown>): void {
  getDb()
    .prepare("INSERT INTO study_events (kind, payload) VALUES ('practice', ?)")
    .run(JSON.stringify({ type, date: new Date().toISOString().slice(0, 10), ...payload }))
}

export function practicedToday(): number {
  return Number(
    (
      getDb()
        .prepare(
          `SELECT COUNT(*) AS n FROM study_events WHERE kind = 'practice'
           AND json_extract(payload, '$.date') = date('now', 'localtime')`
        )
        .get() as { n: number }
    ).n
  )
}

export function todayPracticeGroupSize(): number {
  return Math.max(3, Math.min(10, Math.round(planDailyNew() / 4)))
}
