import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getDb, kvGet, kvSet } from './db'
import { nextFreeCoverId } from './covers'

const DICT_VERSION = '2'

interface DictRaw {
  /** 词典 entries 的值是 [音标, 释义] 数组（与插件 dictionary.json 同源） */
  entries: Record<string, unknown>
  prompts: Record<string, string[]>
  books?: Record<string, string[]>
}

function entryParts(value: unknown): { phonetic: string; meaning: string } {
  if (Array.isArray(value)) return { phonetic: String(value[0] ?? ''), meaning: String(value[1] ?? '') }
  if (value && typeof value === 'object') {
    const o = value as { phonetic?: string; meaning?: string }
    return { phonetic: o.phonetic ?? '', meaning: o.meaning ?? '' }
  }
  return { phonetic: '', meaning: '' }
}

function dictionaryResourcePath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'resources', 'dictionary.json'),
    path.join(app.getAppPath(), 'resources', 'dictionary.json')
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  throw new Error('未找到内置词典文件 resources/dictionary.json')
}

let cachedDict: DictRaw | null = null

export function readDictionaryFile(): DictRaw {
  if (!cachedDict) {
    cachedDict = JSON.parse(fs.readFileSync(dictionaryResourcePath(), 'utf8')) as DictRaw
  }
  return cachedDict
}

export function ensureDictionaryImported(): { imported: boolean; words: number } {
  const db = getDb()
  if (kvGet('dict_version') === DICT_VERSION) return { imported: false, words: 0 }
  const raw = readDictionaryFile()
  const insert = db.prepare(
    'INSERT INTO dictionary (word, phonetic, meaning, prompts) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(word) DO UPDATE SET phonetic = excluded.phonetic, meaning = excluded.meaning, prompts = excluded.prompts'
  )
  const tx = db.transaction(() => {
    for (const [word, value] of Object.entries(raw.entries ?? {})) {
      const parts = entryParts(value)
      insert.run(
        String(word).toLowerCase(),
        parts.phonetic,
        parts.meaning,
        JSON.stringify(raw.prompts?.[word] ?? [])
      )
    }
  })
  tx()
  kvSet('dict_version', DICT_VERSION)
  // 回填：内置书建库时词典若不可用，词条字段为空；词典就绪后补齐（不覆盖导入数据）
  getDb()
    .prepare(
      `UPDATE words SET phonetic = d.phonetic, meaning = d.meaning FROM dictionary d
       WHERE words.headword = d.word AND words.phonetic = '' AND words.meaning = ''`
    )
    .run()
  getDb()
    .prepare(`UPDATE words SET prompts = d.prompts FROM dictionary d WHERE words.headword = d.word AND words.prompts = '[]'`)
    .run()
  return { imported: true, words: Object.keys(raw.entries ?? {}).length }
}

export interface DictEntry {
  phonetic: string
  meaning: string
  prompts: string[]
}

export function lookupDictionary(word: string): DictEntry | null {
  const row = getDb()
    .prepare('SELECT phonetic, meaning, prompts FROM dictionary WHERE word = ?')
    .get(String(word).toLowerCase()) as { phonetic: string; meaning: string; prompts: string } | undefined
  if (!row) return null
  let prompts: string[] = []
  try {
    prompts = JSON.parse(row.prompts) as string[]
  } catch {
    prompts = []
  }
  return { phonetic: row.phonetic, meaning: row.meaning, prompts }
}

/** 首次运行：把内置四六级书（词表来自词典文件）建好，词全部为未学习状态。 */
export function ensureBuiltinBooks(): { created: boolean; words: number } {
  const raw = readDictionaryFile()
  const db = getDb()
  let total = 0
  let created = false
  for (const [slug, name] of [
    ['cet4', '大学英语四级词书'],
    ['cet6', '大学英语六级词书']
  ] as const) {
    const list = raw.books?.[slug] ?? []
    const existing = db.prepare('SELECT id FROM books WHERE slug = ?').get(slug) as { id: number } | undefined
    let bookId: number
    if (!existing) {
      bookId = Number(
        db
          .prepare("INSERT INTO books (slug, name, source, cover_id) VALUES (?, ?, 'builtin', ?)")
          .run(slug, name, nextFreeCoverId('books')).lastInsertRowid
      )
      created = true
    } else {
      bookId = existing.id
    }
    const insert = db.prepare(
      'INSERT OR IGNORE INTO words (book_id, headword, phonetic, meaning, prompts) VALUES (?, ?, ?, ?, ?)'
    )
    const tx = db.transaction(() => {
      for (const word of list) {
        const entry = lookupDictionary(word)
        insert.run(
          bookId,
          word,
          entry?.phonetic ?? '',
          entry?.meaning ?? '',
          JSON.stringify(entry?.prompts ?? [])
        )
        total++
      }
    })
    tx()
  }
  return { created, words: total }
}
