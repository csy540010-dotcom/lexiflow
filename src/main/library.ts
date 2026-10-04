import { getDb } from './db'
import { lookupDictionary } from './dictionary'
import { nextFreeCoverId } from './covers'
import type {
  BookSummary,
  WordDetailData,
  WordFilter,
  WordListItem,
  WordListResult,
  WordUpdatePatch,
  MasteryData,
  LearningRecordItem
} from '../shared/types'

interface BookCountRow {
  id: number
  slug: string
  name: string
  source: string
  cover_id: string
  total: number
  learning: number
  mastered: number
  favorites: number
  due: number
}

export function listBooks(): BookSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT b.id, b.slug, b.name, b.source, b.cover_id,
              (SELECT COUNT(*) FROM words w WHERE w.book_id = b.id) AS total,
              (SELECT COUNT(*) FROM words w WHERE w.book_id = b.id AND w.status > 0) AS learning,
              (SELECT COUNT(*) FROM words w WHERE w.book_id = b.id AND w.status = 2) AS mastered,
              (SELECT COUNT(*) FROM words w WHERE w.book_id = b.id AND w.favorite = 1) AS favorites,
              (SELECT COUNT(*) FROM review_queue rq JOIN words w2 ON w2.id = rq.word_id
                WHERE w2.book_id = b.id AND rq.due_date <= date('now', 'localtime')) AS due
       FROM books b
       ORDER BY CASE b.slug WHEN 'cet4' THEN 1 WHEN 'cet6' THEN 2 ELSE 3 END, b.id`
    )
    .all() as unknown as BookCountRow[]
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    source: r.source,
    coverId: r.cover_id ?? '',
    total: Number(r.total) || 0,
    learning: Number(r.learning) || 0,
    mastered: Number(r.mastered) || 0,
    favorites: Number(r.favorites) || 0,
    due: Number(r.due) || 0
  }))
}

/** 手动指定词书封面（从封面库选）。 */
export function setBookCover(id: number, coverId: string): void {
  const info = getDb().prepare('UPDATE books SET cover_id = ? WHERE id = ?').run(String(coverId ?? '').trim(), Number(id))
  if (info.changes === 0) throw new Error('词书不存在。')
}

function uniqueSlug(name: string): string {
  const base = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
  const db = getDb()
  let slug = base || 'custom-book'
  let n = 2
  while (db.prepare('SELECT id FROM books WHERE slug = ?').get(slug)) slug = base + '-' + n++
  return slug
}

export function createBook(name: string): BookSummary['id'] {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('词书名称不能为空。')
  return Number(
    getDb()
      .prepare("INSERT INTO books (slug, name, source, cover_id) VALUES (?, ?, 'local', ?)")
      .run(uniqueSlug(trimmed), trimmed, nextFreeCoverId('books')).lastInsertRowid
  )
}

export function renameBook(id: number, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('词书名称不能为空。')
  const info = getDb().prepare('UPDATE books SET name = ? WHERE id = ?').run(trimmed, id)
  if (info.changes === 0) throw new Error('词书不存在。')
}

export function deleteBook(id: number): void {
  getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
}

export interface WordQueryArgs {
  bookId: number
  query?: string
  filter?: WordFilter
  page?: number
  pageSize?: number
}

function masteryLevel(masteryJson: string): number {
  let m: MasteryData = {}
  try {
    m = JSON.parse(masteryJson || '{}') as MasteryData
  } catch {
    m = {}
  }
  const dims = [m.recognition ?? 0, m.comprehension ?? 0, m.production ?? 0, m.transfer ?? 0]
  const avg = dims.reduce((a, b) => a + b, 0) / dims.length
  return Math.round((avg / 5) * 4)
}

export function queryWords(args: WordQueryArgs): WordListResult {
  const db = getDb()
  const page = Math.max(1, args.page ?? 1)
  const pageSize = Math.min(200, Math.max(10, args.pageSize ?? 50))
  const where: string[] = ['book_id = @bookId']
  const params: Record<string, unknown> = { bookId: args.bookId }
  const q = (args.query ?? '').trim()
  if (q) {
    where.push('(headword LIKE @like OR meaning LIKE @like)')
    params.like = '%' + q + '%'
  }
  if (args.filter === 'unlearned') where.push('status = 0')
  else if (args.filter === 'learning') where.push('status = 1')
  else if (args.filter === 'mastered') where.push('status = 2')
  else if (args.filter === 'favorite') where.push('favorite = 1')
  const clause = where.join(' AND ')

  const total = Number(
    (
      db.prepare(`SELECT COUNT(*) AS n FROM words WHERE ${clause}`).get(params) as { n: number }
    ).n
  )
  const rows = db
    .prepare(
      `SELECT id, headword, phonetic, meaning, status, favorite, mastery FROM words
       WHERE ${clause} ORDER BY id LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as unknown as Array<
    { id: number; headword: string; phonetic: string; meaning: string; status: number; favorite: number; mastery: string }
  >
  const items: WordListItem[] = rows.map((r) => ({
    id: r.id,
    headword: r.headword,
    phonetic: r.phonetic,
    meaning: r.meaning,
    status: r.status as 0 | 1 | 2,
    favorite: r.favorite as 0 | 1,
    masteryLevel: masteryLevel(r.mastery)
  }))
  return { total, items }
}

function parseMastery(raw: string): MasteryData {
  try {
    return JSON.parse(raw || '{}') as MasteryData
  } catch {
    return {}
  }
}

export function getWord(id: number): WordDetailData | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT w.*, b.name AS book_name,
              (SELECT due_date FROM review_queue rq WHERE rq.word_id = w.id) AS due_date
       FROM words w JOIN books b ON b.id = w.book_id WHERE w.id = ?`
    )
    .get(id) as unknown as
    | {
        id: number
        book_id: number
        book_name: string
        headword: string
        phonetic: string
        meaning: string
        prompts: string
        status: number
        favorite: number
        notes: string
        mastery: string
        due_date: string | null
      }
    | undefined
  if (!row) return null

  const recordRows = db
    .prepare('SELECT id, kind, payload, occurred_at FROM learning_records WHERE word_id = ? ORDER BY id')
    .all(id) as unknown as Array<{ id: number; kind: string; payload: string; occurred_at: string }>
  const records: LearningRecordItem[] = recordRows.map((r) => {
    let payload: unknown = r.payload
    try {
      payload = JSON.parse(r.payload)
    } catch {
      /* 原样保留 */
    }
    return { id: r.id, kind: r.kind, payload, occurredAt: r.occurred_at }
  })

  let prompts: string[] = []
  try {
    prompts = JSON.parse(row.prompts || '[]') as string[]
  } catch {
    prompts = []
  }

  return {
    id: row.id,
    bookId: row.book_id,
    bookName: row.book_name,
    headword: row.headword,
    phonetic: row.phonetic,
    meaning: row.meaning,
    prompts,
    status: row.status as 0 | 1 | 2,
    favorite: row.favorite as 0 | 1,
    notes: row.notes,
    mastery: parseMastery(row.mastery),
    dueDate: row.due_date,
    records
  }
}

export function updateWord(id: number, patch: WordUpdatePatch): WordDetailData | null {
  const db = getDb()
  const word = db.prepare('SELECT id FROM words WHERE id = ?').get(id)
  if (!word) throw new Error('词条不存在。')
  if (patch.favorite !== undefined) db.prepare('UPDATE words SET favorite = ? WHERE id = ?').run(patch.favorite ? 1 : 0, id)
  if (patch.notes !== undefined) db.prepare('UPDATE words SET notes = ? WHERE id = ?').run(patch.notes, id)
  if (patch.status !== undefined) {
    const s = Math.min(2, Math.max(0, patch.status))
    db.prepare('UPDATE words SET status = ? WHERE id = ?').run(s, id)
    if (s === 2) {
      // 手动标记已掌握：补时间戳，让统计「新掌握词」也算上
      const d = new Date()
      const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
      db.prepare("UPDATE words SET mastered_at = ? WHERE id = ? AND mastered_at = ''").run(today, id)
    }
  }
  return getWord(id)
}

/** 把词条移动到另一本词书（学习记录随 word_id 保留）；目标书已有同词时报错。 */
export function moveWordToBook(wordId: number, bookId: number): WordDetailData {
  const db = getDb()
  const word = db.prepare('SELECT id, headword, book_id FROM words WHERE id = ?').get(Number(wordId)) as
    | { id: number; headword: string; book_id: number }
    | undefined
  if (!word) throw new Error('词条不存在。')
  if (word.book_id === Number(bookId)) {
    const same = getWord(wordId)
    if (!same) throw new Error('词条不存在。')
    return same
  }
  const target = db.prepare('SELECT id FROM books WHERE id = ?').get(Number(bookId))
  if (!target) throw new Error('目标词书不存在。')
  const conflict = db
    .prepare('SELECT id FROM words WHERE book_id = ? AND lower(headword) = lower(?)')
    .get(Number(bookId), word.headword)
  if (conflict) throw new Error(`「${word.headword}」已在目标词书中。`)
  db.prepare('UPDATE words SET book_id = ? WHERE id = ?').run(Number(bookId), Number(wordId))
  const moved = getWord(wordId)
  if (!moved) throw new Error('词条不存在。')
  return moved
}

export function addWord(bookId: number, headword: string): WordDetailData {
  const trimmed = headword.trim()
  if (!trimmed) throw new Error('请输入单词。')
  const db = getDb()
  const exists = db.prepare('SELECT id FROM words WHERE book_id = ? AND headword = ?').get(bookId, trimmed)
  if (exists) throw new Error('这个词已在本词书中。')
  const entry = lookupDictionary(trimmed)
  const info = db
    .prepare('INSERT INTO words (book_id, headword, phonetic, meaning, prompts) VALUES (?, ?, ?, ?, ?)')
    .run(bookId, trimmed, entry?.phonetic ?? '', entry?.meaning ?? '', JSON.stringify(entry?.prompts ?? []))
  return getWord(Number(info.lastInsertRowid)) as WordDetailData
}
