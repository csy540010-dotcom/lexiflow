import fs from 'node:fs'
import path from 'node:path'
import { getDb, kvGet, kvSet } from './db'
import { lookupDictionary } from './dictionary'
import type { ImportPreview, ImportResult } from '../shared/types'

/**
 * Obsidian 插件 english-wordbook 的分片存储（sharded-v1）导入器。
 * 只读取该插件目录下的 data/，绝不写入；同一词书重复导入按 (book, headword) 去重。
 */

interface LibraryIndex {
  books?: Record<string, string[]>
  customBooks?: Array<{ id?: string; name?: string } | string>
  selectedBook?: string
}

interface WordShard {
  word?: string
  card?: { word?: string; phonetic?: string; meaning?: string }
}

interface ReviewMap {
  review?: Record<string, { due?: string; lastTape?: string; added?: string }>
}

interface TranslationsFile {
  translations?: Record<string, { exercises?: unknown[] }>
}

const BOOK_NAMES: Record<string, string> = {
  personal: '我的词书',
  cet4: '大学英语四级词书',
  cet6: '大学英语六级词书'
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function normalizeCustomBooks(index: LibraryIndex): Array<{ slug: string; name: string }> {
  const out: Array<{ slug: string; name: string }> = []
  for (const item of index.customBooks ?? []) {
    if (typeof item === 'string') out.push({ slug: item, name: item })
    else if (item && typeof item.id === 'string') out.push({ slug: item.id, name: item.name || item.id })
  }
  return out
}

function bookWordFiles(wordsDir: string): Map<string, WordShard> {
  const map = new Map<string, WordShard>()
  let files: string[] = []
  try {
    files = fs.readdirSync(wordsDir).filter((f) => f.endsWith('.json') && !f.includes('.conflict-'))
  } catch {
    files = []
  }
  for (const file of files) {
    const record = readJson<WordShard>(path.join(wordsDir, file))
    if (record && typeof record.word === 'string' && record.card) map.set(record.word.toLowerCase(), record)
  }
  return map
}

export function detectObsidianData(dir: string): ImportPreview {
  const warnings: string[] = []
  const index = readJson<LibraryIndex>(path.join(dir, 'library-index.json'))
  if (!index || !index.books) {
    return { found: false, books: [], reviewQueue: 0, translationWords: 0, warnings: ['未找到 library-index.json，请确认选择的是插件 data 目录'] }
  }
  const version = readJson<{ sharded?: string }>(path.join(dir, '..', 'data.json'))?.sharded
  const review = readJson<ReviewMap>(path.join(dir, 'review.json'))
  const translations = readJson<TranslationsFile>(path.join(dir, 'translations.json'))
  const shardWords = bookWordFiles(path.join(dir, 'words'))
  const entriesFile = readJson<{ entries?: Record<string, unknown> }>(path.join(dir, 'entries.json'))

  const books: ImportPreview['books'] = []
  const customMeta = new Map(normalizeCustomBooks(index).map((c) => [c.slug, c.name]))
  const seen = new Set<string>()
  for (const [slug, words] of Object.entries(index.books ?? {})) {
    seen.add(slug)
    books.push({ slug, name: BOOK_NAMES[slug] ?? customMeta.get(slug) ?? slug, wordCount: (words ?? []).length })
  }
  // 自定义词书的词表也存放在 index.books 里；这里只补上没有词表（空书）的自定义词书
  for (const [slug, name] of customMeta) {
    if (!seen.has(slug)) books.push({ slug, name, wordCount: 0 })
  }
  if (shardWords.size === 0) warnings.push('words/ 目录没有词条分片，音标释义将全部来自内置词典或 entries.json')
  if (!entriesFile && shardWords.size === 0) warnings.push('缺少 entries.json 且无词条分片，部分词可能只有词头没有释义')

  return {
    found: true,
    version: version ?? 'sharded-v1',
    books,
    reviewQueue: Object.keys(review?.review ?? {}).length,
    translationWords: Object.keys(translations?.translations ?? {}).length,
    warnings
  }
}

export function importObsidianData(dir: string): ImportResult {
  const preview = detectObsidianData(dir)
  if (!preview.found) {
    return { ...preview, addedWords: 0, addedReviews: 0, addedRecords: 0, skippedWords: 0 }
  }
  const db = getDb()
  const index = readJson<LibraryIndex>(path.join(dir, 'library-index.json')) as LibraryIndex
  const review = readJson<ReviewMap>(path.join(dir, 'review.json')) ?? {}
  const translations = readJson<TranslationsFile>(path.join(dir, 'translations.json')) ?? {}
  const entriesFile =
    readJson<{ entries?: Record<string, { phonetic?: string; meaning?: string; prompts?: string[] }> }>(
      path.join(dir, 'entries.json')
    ) ?? {}
  const shardWords = bookWordFiles(path.join(dir, 'words'))

  // 练习历史：scope::word → 有练习记录的词
  const translatedWords = new Set<string>()
  for (const key of Object.keys(translations.translations ?? {})) {
    const word = key.includes('::') ? key.split('::').pop()! : key
    if (translations.translations?.[key]?.exercises?.length) translatedWords.add(word.toLowerCase())
  }

  const insertBook = db.prepare("INSERT INTO books (slug, name, source) VALUES (?, ?, 'obsidian')")
  const insertWord = db.prepare(
    'INSERT OR IGNORE INTO words (book_id, headword, phonetic, meaning, prompts, status) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const wordId = db.prepare('SELECT id FROM words WHERE book_id = ? AND headword = ?')
  const insertReview = db.prepare('INSERT OR IGNORE INTO review_queue (word_id, due_date, reason, added_at) VALUES (?, ?, ?, ?)')
  const insertRecord = db.prepare('INSERT INTO learning_records (word_id, kind, payload) VALUES (?, ?, ?)')

  let addedWords = 0
  let skippedWords = 0
  let addedReviews = 0
  let addedRecords = 0

  const run = db.transaction(() => {
    for (const previewBook of preview.books) {
      const words = index.books?.[previewBook.slug] ?? []
      let bookId: number
      const existing = db.prepare('SELECT id FROM books WHERE slug = ?').get(previewBook.slug) as
        | { id: number }
        | undefined
      if (existing) {
        bookId = existing.id
        db.prepare("UPDATE books SET source = 'obsidian' WHERE id = ? AND source = 'local'").run(bookId)
      } else {
        bookId = Number(insertBook.run(previewBook.slug, previewBook.name).lastInsertRowid)
      }

      for (const headword of words) {
        const key = headword.toLowerCase()
        const shard = shardWords.get(key)
        const cached = entriesFile.entries?.[key]
        const dictEntry = lookupDictionary(headword)
        // 优先用插件自己的数据（词条分片 > 查词缓存），内置词典只做兜底
        const phonetic = shard?.card?.phonetic || cached?.phonetic || dictEntry?.phonetic || ''
        const meaning = shard?.card?.meaning || cached?.meaning || dictEntry?.meaning || ''
        const prompts = cached?.prompts ?? dictEntry?.prompts ?? []
        const status = translatedWords.has(key) ? 1 : 0
        const info = insertWord.run(
          bookId,
          headword,
          phonetic,
          meaning,
          JSON.stringify(prompts),
          status
        )
        if (info.changes > 0) addedWords++
        else skippedWords++

        const row = wordId.get(bookId, headword) as { id: number } | undefined
        if (!row) continue

        const queueEntry = review.review?.[key]
        if (queueEntry?.due) {
          const r = insertReview.run(row.id, queueEntry.due, 'tape', queueEntry.added ?? '')
          addedReviews += r.changes
        }

        const transKey = Object.keys(translations.translations ?? {}).find(
          (k) => k.toLowerCase().endsWith('::' + key) || k.toLowerCase() === key
        )
        if (transKey) {
          for (const exercise of translations.translations![transKey].exercises ?? []) {
            insertRecord.run(row.id, 'translation', JSON.stringify(exercise))
            addedRecords++
          }
        }
      }
    }
  })
  run()

  kvSet('last_obsidian_import_at', new Date().toISOString())
  return { ...preview, addedWords, addedReviews, addedRecords, skippedWords }
}

/** 自检用：清掉某次测试导入的数据（按 slug）。 */
export function removeImportedBooks(slugs: string[]): number {
  const db = getDb()
  const del = db.prepare('DELETE FROM books WHERE slug = ? AND source = ?')
  let n = 0
  for (const slug of slugs) n += del.run(slug, 'obsidian').changes
  void kvGet
  return n
}
