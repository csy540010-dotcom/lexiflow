import fs from 'node:fs'
import path from 'node:path'
import { getDb } from './db'
import { lookupDictionary } from './dictionary'
import { resolveBookId } from './study'
import { getWord } from './library'
import type { ArticleItem, DictLookup } from '../shared/types'

/* ── 阅读（导入文章 / 点词查义 / 生词入词库） ─────────────── */

interface ArticleRow {
  id: number
  title: string
  content: string
  source: string
  created_at: string
  last_read_at: string
}

function mapArticle(r: ArticleRow): ArticleItem {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    source: r.source,
    createdAt: r.created_at,
    lastReadAt: r.last_read_at,
    chars: r.content.length
  }
}

export function listArticles(): ArticleItem[] {
  const rows = getDb()
    .prepare('SELECT id, title, content, source, created_at, last_read_at FROM articles ORDER BY id DESC')
    .all() as unknown as ArticleRow[]
  return rows.map(mapArticle)
}

export function createArticle(title: string, content: string, source: string): ArticleItem {
  const text = content.trim()
  if (!text) throw new Error('文章内容不能为空。')
  const name = title.trim() || text.split('\n')[0].slice(0, 40) || '未命名文章'
  const info = getDb()
    .prepare('INSERT INTO articles (title, content, source) VALUES (?, ?, ?)')
    .run(name, text, source === 'file' ? 'file' : 'paste')
  const row = getDb()
    .prepare('SELECT id, title, content, source, created_at, last_read_at FROM articles WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as unknown as ArticleRow
  return mapArticle(row)
}

export function deleteArticle(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM articles WHERE id = ?').run(Number(id))
  // 同步清掉这篇文章的阅读量统计事件
  db.prepare("DELETE FROM study_events WHERE kind = 'reading' AND json_extract(payload, '$.articleId') = ?").run(Number(id))
}

/** 打开文章时记一次阅读（统计用）。 */
export function logReading(articleId: number): void {
  const db = getDb()
  const row = db.prepare('SELECT title, content FROM articles WHERE id = ?').get(Number(articleId)) as
    | { title: string; content: string }
    | undefined
  if (!row) return
  const d = new Date()
  const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  db.prepare("INSERT INTO study_events (kind, payload) VALUES ('reading', ?)").run(
    JSON.stringify({ date, articleId: Number(articleId), title: row.title, chars: row.content.length })
  )
  db.prepare("UPDATE articles SET last_read_at = datetime('now') WHERE id = ?").run(Number(articleId))
}

/** 点词查义：词典优先；顺带告诉前端这个词是否已在当前词书。 */
export function lookupWord(word: string): DictLookup {
  const clean = String(word).trim().toLowerCase()
  if (!clean) return { word: '', found: false, phonetic: '', meaning: '', inBook: false }
  const entry = lookupDictionary(clean)
  const bookId = resolveBookId()
  const existing = getDb()
    .prepare('SELECT id FROM words WHERE book_id = ? AND lower(headword) = ?')
    .get(bookId, clean) as { id: number } | undefined
  return {
    word: clean,
    found: Boolean(entry),
    phonetic: entry?.phonetic ?? '',
    meaning: entry?.meaning ?? '',
    inBook: Boolean(existing),
    wordId: existing?.id
  }
}

/** 生词入词库：加入当前选中的词书（已存在则返回原词条）。 */
export function addWordToBook(headword: string): { word: ReturnType<typeof getWord>; added: boolean } {
  const clean = String(headword).trim()
  if (!clean) throw new Error('单词不能为空。')
  const db = getDb()
  const bookId = resolveBookId()
  const existing = db
    .prepare('SELECT id FROM words WHERE book_id = ? AND lower(headword) = ?')
    .get(bookId, clean.toLowerCase()) as { id: number } | undefined
  if (existing) return { word: getWord(existing.id), added: false }
  const entry = lookupDictionary(clean)
  const info = db
    .prepare('INSERT INTO words (book_id, headword, phonetic, meaning, prompts, status) VALUES (?, ?, ?, ?, ?, 1)')
    .run(bookId, clean, entry?.phonetic ?? '', entry?.meaning ?? '', JSON.stringify(entry?.prompts ?? []))
  return { word: getWord(Number(info.lastInsertRowid)), added: true }
}

/** 导入文本文件（.txt/.md）→ 文章。 */
export function importTextFile(filePath: string): ArticleItem {
  const text = fs.readFileSync(filePath, 'utf8')
  const title = path.basename(filePath).replace(/\.[^.]+$/, '')
  return createArticle(title, text, 'file')
}
