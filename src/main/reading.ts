import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getDb } from './db'
import { lookupDictionary } from './dictionary'
import { resolveBookId } from './study'
import { getWord } from './library'
import { chatCompletion } from './ai'
import { buildTranslatePrompt } from './prompts'
import { getAiConfig } from './settings'
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

function resolveBookArg(bookIdArg?: number): number {
  if (bookIdArg && getDb().prepare('SELECT id FROM books WHERE id = ?').get(Number(bookIdArg))) {
    return Number(bookIdArg)
  }
  return resolveBookId()
}

/** 点词查义：词典优先；顺带告诉前端这个词是否在指定（默认当前）词书。 */
export function lookupWord(word: string, bookIdArg?: number): DictLookup {
  const clean = String(word).trim().toLowerCase()
  const bookId = resolveBookArg(bookIdArg)
  if (!clean) return { word: '', found: false, phonetic: '', meaning: '', inBook: false, bookId }
  const entry = lookupDictionary(clean)
  const existing = getDb()
    .prepare('SELECT id FROM words WHERE book_id = ? AND lower(headword) = ?')
    .get(bookId, clean) as { id: number } | undefined
  return {
    word: clean,
    found: Boolean(entry),
    phonetic: entry?.phonetic ?? '',
    meaning: entry?.meaning ?? '',
    inBook: Boolean(existing),
    wordId: existing?.id,
    bookId
  }
}

/** 生词入词库：默认加入当前选中的词书，也可指定词书（含自定义书）；状态为未学习，可进入造句训练队列。 */
export function addWordToBook(headword: string, bookIdArg?: number): { word: ReturnType<typeof getWord>; added: boolean } {
  const clean = String(headword).trim()
  if (!clean) throw new Error('单词不能为空。')
  const db = getDb()
  const bookId = resolveBookArg(bookIdArg)
  const existing = db
    .prepare('SELECT id FROM words WHERE book_id = ? AND lower(headword) = ?')
    .get(bookId, clean.toLowerCase()) as { id: number } | undefined
  if (existing) return { word: getWord(existing.id), added: false }
  const entry = lookupDictionary(clean)
  const info = db
    .prepare('INSERT INTO words (book_id, headword, phonetic, meaning, prompts, status) VALUES (?, ?, ?, ?, ?, 0)')
    .run(bookId, clean, entry?.phonetic ?? '', entry?.meaning ?? '', JSON.stringify(entry?.prompts ?? []))
  return { word: getWord(Number(info.lastInsertRowid)), added: true }
}

/** 阅读内翻译（整段 / 短语）：AI 直连 + 本地缓存（相同文本不重复消耗额度）。 */
export async function translateReading(text: string): Promise<{ translated: string; cached: boolean }> {
  const source = String(text ?? '').trim()
  if (!source) throw new Error('没有可翻译的内容。')
  if (source.length > 2000) throw new Error('内容过长，请选择 2000 字符以内的文本。')
  const hash = crypto.createHash('md5').update(source).digest('hex')
  const hit = getDb().prepare('SELECT translated FROM translation_cache WHERE hash = ?').get(hash) as
    | { translated: string }
    | undefined
  if (hit) return { translated: hit.translated, cached: true }
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')
  const translated = (
    await chatCompletion(cfg, [{ role: 'user', content: buildTranslatePrompt(source) }], {
      maxTokens: 1500,
      timeoutMs: 60_000
    })
  ).trim()
  if (!translated) throw new Error('AI 返回为空，请重试一次。')
  getDb()
    .prepare('INSERT OR REPLACE INTO translation_cache (hash, source, translated) VALUES (?, ?, ?)')
    .run(hash, source, translated)
  return { translated, cached: false }
}

/** 导入文本文件（.txt/.md）→ 文章。 */
export function importTextFile(filePath: string): ArticleItem {
  const text = fs.readFileSync(filePath, 'utf8')
  const title = path.basename(filePath).replace(/\.[^.]+$/, '')
  return createArticle(title, text, 'file')
}
