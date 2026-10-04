import { getDb, kvGet, kvSet } from './db'
import type { StatsSummary } from '../shared/types'

/** 本地日期 YYYY-MM-DD */
export function localDate(): string {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function rangeStart(days: number | null): string {
  if (!days) return ''
  const d = new Date()
  d.setDate(d.getDate() - (days - 1))
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

interface GradeRow {
  word_id: number
  headword: string
  payload: string
}

const MCQ_KINDS = new Set(['context', 'collocation', 'synonym'])

export function statsSummary(days: number | null): StatsSummary {
  const db = getDb()
  const since = rangeStart(days)

  // 学习时长（分钟）
  const timeRow = since
    ? (db.prepare('SELECT COALESCE(SUM(seconds),0) AS s FROM study_time WHERE date >= ?').get(since) as { s: number })
    : (db.prepare('SELECT COALESCE(SUM(seconds),0) AS s FROM study_time').get() as { s: number })
  const studyMinutes = Math.round(Number(timeRow.s) / 60)

  // 新掌握词
  const newMastered = Number(
    since
      ? (db.prepare("SELECT COUNT(*) AS n FROM words WHERE mastered_at != '' AND mastered_at >= ?").get(since) as { n: number }).n
      : (db.prepare("SELECT COUNT(*) AS n FROM words WHERE mastered_at != ''").get() as { n: number }).n
  )

  // 批改记录（次数 + 四维均分 + 高频错误词）
  const gradeSql = since
    ? `SELECT r.word_id, w.headword, r.payload FROM learning_records r JOIN words w ON w.id = r.word_id
       WHERE r.kind = 'ai_grade' AND date(r.occurred_at, 'localtime') >= ?`
    : `SELECT r.word_id, w.headword, r.payload FROM learning_records r JOIN words w ON w.id = r.word_id
       WHERE r.kind = 'ai_grade'`
  const gradeRows = (since ? db.prepare(gradeSql).all(since) : db.prepare(gradeSql).all()) as unknown as GradeRow[]
  let gradeSum = 0
  let gradedCount = 0
  const mistakeCount = new Map<string, number>()
  for (const row of gradeRows) {
    try {
      const p = JSON.parse(row.payload) as { grade?: { scores?: Record<string, number>; issues?: unknown[] } }
      const s = p.grade?.scores
      if (s) {
        const vals = [s.usage, s.grammar, s.collocation, s.naturalness].filter((v) => typeof v === 'number') as number[]
        if (vals.length > 0) {
          gradeSum += vals.reduce((a, b) => a + b, 0) / vals.length
          gradedCount++
        }
      }
      const issues = p.grade?.issues
      if (Array.isArray(issues) && issues.length > 0) {
        mistakeCount.set(row.headword, (mistakeCount.get(row.headword) ?? 0) + issues.length)
      }
    } catch {
      /* 坏记录跳过 */
    }
  }
  const gradeAvg = gradedCount > 0 ? Math.round((gradeSum / gradedCount) * 10) / 10 : 0
  const topMistakes = [...mistakeCount.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // 练习准确率（选择题类）
  const mcqRows = since
    ? (db
        .prepare(
          "SELECT payload FROM study_events WHERE kind = 'practice' AND json_extract(payload, '$.date') >= ?"
        )
        .all(since) as unknown as Array<{ payload: string }>)
    : (db.prepare("SELECT payload FROM study_events WHERE kind = 'practice'").all() as unknown as Array<{ payload: string }>)
  let mcqTotal = 0
  let mcqCorrect = 0
  for (const row of mcqRows) {
    try {
      const p = JSON.parse(row.payload) as { type?: string; items?: number; correct?: number }
      if (p.type && MCQ_KINDS.has(p.type)) {
        mcqTotal += Number(p.items ?? 0)
        mcqCorrect += Number(p.correct ?? 0)
      }
    } catch {
      /* 跳过 */
    }
  }

  // 复习完成情况
  const reviewRows = since
    ? (db
        .prepare(
          "SELECT kind, COUNT(*) AS n FROM study_events WHERE kind IN ('review_graduate','review_tape') AND json_extract(payload, '$.date') >= ? GROUP BY kind"
        )
        .all(since) as unknown as Array<{ kind: string; n: number }>)
    : (db
        .prepare("SELECT kind, COUNT(*) AS n FROM study_events WHERE kind IN ('review_graduate','review_tape') GROUP BY kind")
        .all() as unknown as Array<{ kind: string; n: number }>)
  let reviewGraduated = 0
  let reviewTaped = 0
  for (const row of reviewRows) {
    if (row.kind === 'review_graduate') reviewGraduated = Number(row.n)
    else reviewTaped = Number(row.n)
  }

  // 自定义任务打卡（听力/阅读/写作）
  const taskSql = since
    ? `SELECT c.kind, COUNT(*) AS n FROM task_logs l JOIN custom_tasks c ON c.id = l.task_id WHERE l.date >= ? GROUP BY c.kind`
    : `SELECT c.kind, COUNT(*) AS n FROM task_logs l JOIN custom_tasks c ON c.id = l.task_id GROUP BY c.kind`
  const taskRows = (since ? db.prepare(taskSql).all(since) : db.prepare(taskSql).all()) as unknown as Array<{
    kind: string
    n: number
  }>
  const tasksDone = taskRows.map((r) => ({ kind: r.kind, count: Number(r.n) }))

  // 当前掌握度分布（全量快照）
  const distRows = db
    .prepare('SELECT status, COUNT(*) AS n FROM words GROUP BY status')
    .all() as unknown as Array<{ status: number; n: number }>
  const mastery = { unlearned: 0, learning: 0, mastered: 0 }
  for (const row of distRows) {
    if (row.status === 2) mastery.mastered = Number(row.n)
    else if (row.status === 1) mastery.learning = Number(row.n)
    else mastery.unlearned = Number(row.n)
  }

  // 阅读量（打开文章产生 reading 事件）
  const readingRows = since
    ? (db
        .prepare(
          "SELECT json_extract(payload, '$.articleId') AS aid, json_extract(payload, '$.chars') AS chars FROM study_events WHERE kind = 'reading' AND json_extract(payload, '$.date') >= ?"
        )
        .all(since) as unknown as Array<{ aid: number; chars: number }>)
    : (db
        .prepare(
          "SELECT json_extract(payload, '$.articleId') AS aid, json_extract(payload, '$.chars') AS chars FROM study_events WHERE kind = 'reading'"
        )
        .all() as unknown as Array<{ aid: number; chars: number }>)
  const readingArticleSet = new Set<number>()
  let readingChars = 0
  for (const row of readingRows) {
    if (row.aid != null) readingArticleSet.add(Number(row.aid))
    readingChars += Number(row.chars ?? 0)
  }

  // 听力时间
  const listenRow = since
    ? (db.prepare('SELECT COALESCE(SUM(seconds),0) AS s FROM listening_time WHERE date >= ?').get(since) as { s: number })
    : (db.prepare('SELECT COALESCE(SUM(seconds),0) AS s FROM listening_time').get() as { s: number })
  const listeningMinutes = Math.round(Number(listenRow.s) / 60)

  return {
    studyMinutes,
    newMastered,
    gradedCount,
    gradeAvg,
    mcqTotal,
    mcqCorrect,
    reviewGraduated,
    reviewTaped,
    topMistakes,
    tasksDone,
    mastery,
    readingArticles: readingArticleSet.size,
    readingChars,
    listeningMinutes
  }
}

/* ── 自检辅助：seed 带标记的测试数据并在断言后清理 ─────────────── */

const MARKER = '_m5test'
const SEED_FLAG = 'm5test_seeded'

export function seedStats(): { wordId: number } {
  const db = getDb()
  const word = db
    .prepare("SELECT id FROM words WHERE headword = 'improve' ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined
  const wordId = word ? word.id : 1
  const date = localDate()
  kvSet(SEED_FLAG, '1')
  // 选择题练习 5 题对 4
  db.prepare("INSERT INTO study_events (kind, payload) VALUES ('practice', ?)").run(
    JSON.stringify({ type: 'context', items: 5, correct: 4, date, _m5test: MARKER })
  )
  // 造句类练习（不计入选择题准确率）
  db.prepare("INSERT INTO study_events (kind, payload) VALUES ('practice', ?)").run(
    JSON.stringify({ type: 'translate', items: 5, graded: 3, date, _m5test: MARKER })
  )
  // 复习毕业 1 条
  db.prepare("INSERT INTO study_events (kind, payload) VALUES ('review_graduate', ?)").run(
    JSON.stringify({ date, wordId, headword: 'improve', _m5test: MARKER })
  )
  // 批改记录（四维 4 分 + 2 个错误点）
  db.prepare("INSERT INTO learning_records (word_id, kind, payload) VALUES (?, 'ai_grade', ?)").run(
    wordId,
    JSON.stringify({
      sentence: 'test',
      grade: {
        scores: { usage: 4, grammar: 4, collocation: 4, naturalness: 4 },
        revised: '',
        issues: [
          { original: 'a', why: 'b', fix: 'c' },
          { original: 'd', why: 'e', fix: 'f' }
        ],
        comment: ''
      },
      _m5test: MARKER
    })
  )
  // 学习时长 120 秒
  db.prepare(
    'INSERT INTO study_time (date, seconds) VALUES (?, 120) ON CONFLICT(date) DO UPDATE SET seconds = seconds + 120'
  ).run(date)
  return { wordId }
}

export function cleanupStats(): void {
  const db = getDb()
  db.prepare("DELETE FROM study_events WHERE payload LIKE '%_m5test%'").run()
  db.prepare("DELETE FROM learning_records WHERE payload LIKE '%_m5test%'").run()
  // 只有确实 seed 过（标记存在）才扣时长，避免误伤用户的真实学习时间
  if (kvGet(SEED_FLAG) === '1') {
    db.prepare('UPDATE study_time SET seconds = MAX(0, seconds - 120) WHERE date = ?').run(localDate())
    kvSet(SEED_FLAG, '')
  }
}

/** 自检用：回退一段阅读量事件（按 articleId）。 */
export function cleanupReadingEvents(articleId: number): void {
  getDb()
    .prepare("DELETE FROM study_events WHERE kind = 'reading' AND json_extract(payload, '$.articleId') = ?")
    .run(Number(articleId))
}

/** 清理自检复习断言产生的真实事件（按 wordId 删除）。 */
export function cleanupReviewEvents(wordIds: number[]): void {
  const db = getDb()
  const del = db.prepare('DELETE FROM study_events WHERE kind LIKE ? AND json_extract(payload, ?) = ?')
  for (const id of wordIds) {
    del.run('review_%', '$.wordId', id)
  }
}
