import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getDb } from './db'
import { chatCompletion } from './ai'
import { buildOrganizeTextPrompt, extractJsonObject } from './prompts'
import { getAiConfig } from './settings'
import { lookupDictionary } from './dictionary'
import { resolveBookId } from './study'
import { nextFreeCoverId } from './covers'
import type { TrackItem, MusicWordItem } from '../shared/types'

/* ── 音乐听力（MP3 + 文本导入 / AI 整理 / 播放） ─────────────── */

interface TrackRow {
  id: number
  title: string
  audio_file: string
  text_content: string
  segments: string
  notes: string
  duration: number
  collection: string
  cover_file: string
  cover_id: string
  created_at: string
}

const TRACK_COLS =
  'id, title, audio_file, text_content, segments, notes, duration, collection, cover_file, cover_id, created_at'

export function musicDir(): string {
  const dir = path.join(app.getPath('userData'), 'music')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function mapTrack(r: TrackRow): TrackItem {
  let segments: string[] = []
  try {
    const parsed = JSON.parse(r.segments) as unknown
    if (Array.isArray(parsed)) segments = parsed.map((s) => String(s ?? ''))
  } catch {
    segments = []
  }
  return {
    id: r.id,
    title: r.title,
    audioFile: r.audio_file,
    textContent: r.text_content,
    segments,
    notes: r.notes ?? '',
    duration: Number(r.duration) || 0,
    collection: r.collection ?? '',
    coverFile: r.cover_file ?? '',
    coverId: r.cover_id ?? '',
    createdAt: r.created_at
  }
}

export function listTracks(): TrackItem[] {
  const rows = getDb()
    .prepare(`SELECT ${TRACK_COLS} FROM tracks ORDER BY id DESC`)
    .all() as unknown as TrackRow[]
  return rows.map(mapTrack)
}

function uniqueAudioName(original: string): string {
  const ext = path.extname(original).toLowerCase() || '.mp3'
  const base = path.basename(original, path.extname(original)).replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 40) || 'audio'
  return `${Date.now()}-${base}${ext}`
}

/** 把用户选中的音频复制进 App 数据目录（原文件不动），建一条听力库记录。 */
export function importAudioFromPath(srcPath: string): TrackItem {
  if (!fs.existsSync(srcPath)) throw new Error('音频文件不存在。')
  const name = uniqueAudioName(path.basename(srcPath))
  const dest = path.join(musicDir(), name)
  fs.copyFileSync(srcPath, dest)
  const title = path.basename(srcPath).replace(/\.[^.]+$/, '')
  const info = getDb()
    .prepare('INSERT INTO tracks (title, audio_file, cover_id) VALUES (?, ?, ?)')
    .run(title, name, nextFreeCoverId('tracks'))
  const row = getDb()
    .prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as unknown as TrackRow
  return mapTrack(row)
}

export function setTrackText(id: number, text: string): TrackItem {
  const db = getDb()
  db.prepare('UPDATE tracks SET text_content = ?, segments = ? WHERE id = ?').run(String(text ?? ''), '[]', Number(id))
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as
    | TrackRow
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  return mapTrack(row)
}

export function setTrackNotes(id: number, notes: string): TrackItem {
  const db = getDb()
  db.prepare('UPDATE tracks SET notes = ? WHERE id = ?').run(String(notes ?? ''), Number(id))
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as
    | TrackRow
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  return mapTrack(row)
}

/** 播放器首次加载到元数据时记录时长（秒），供播放列表显示。 */
export function setTrackDuration(id: number, seconds: number): TrackItem {
  const db = getDb()
  const dur = Math.max(0, Math.round(Number(seconds) || 0))
  db.prepare('UPDATE tracks SET duration = ? WHERE id = ?').run(dur, Number(id))
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as
    | TrackRow
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  return mapTrack(row)
}

/** 设置所属集合（分组显示用）。 */
export function setTrackCollection(id: number, name: string): TrackItem {
  const db = getDb()
  db.prepare('UPDATE tracks SET collection = ? WHERE id = ?').run(String(name ?? '').trim().slice(0, 40), Number(id))
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as
    | TrackRow
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  return mapTrack(row)
}

/** 现有集合列表（归类弹窗用）。 */
export function listCollections(): string[] {
  return (
    getDb()
      .prepare("SELECT DISTINCT collection FROM tracks WHERE collection != '' ORDER BY collection")
      .all() as Array<{ collection: string }>
  ).map((r) => r.collection)
}

/** 导入封面图：复制进 App 数据目录（替换旧封面时清理旧文件）。 */
export function importCover(id: number, srcPath: string): TrackItem {
  if (!fs.existsSync(srcPath)) throw new Error('图片文件不存在。')
  const db = getDb()
  const old = db.prepare('SELECT cover_file FROM tracks WHERE id = ?').get(Number(id)) as
    | { cover_file: string }
    | undefined
  if (!old) throw new Error('听力条目不存在。')
  const ext = (path.extname(srcPath).toLowerCase() || '.png').replace(/[^.\w]/g, '')
  const name = `cover-${Number(id)}-${Date.now()}${ext}`
  fs.copyFileSync(srcPath, path.join(musicDir(), name))
  db.prepare('UPDATE tracks SET cover_file = ? WHERE id = ?').run(name, Number(id))
  if (old.cover_file) {
    try {
      fs.unlinkSync(path.join(musicDir(), old.cover_file))
    } catch {
      /* 旧封面已不在也无妨 */
    }
  }
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as unknown as TrackRow
  return mapTrack(row)
}

/** 从封面库给听力换封面（清掉已上传的图片封面，删除旧文件）。 */
export function setTrackCoverLib(id: number, coverId: string): TrackItem {
  const db = getDb()
  const old = db.prepare('SELECT cover_file FROM tracks WHERE id = ?').get(Number(id)) as
    | { cover_file: string }
    | undefined
  if (!old) throw new Error('听力条目不存在。')
  db.prepare('UPDATE tracks SET cover_id = ?, cover_file = ? WHERE id = ?').run(
    String(coverId ?? '').trim(),
    '',
    Number(id)
  )
  if (old.cover_file) {
    try {
      fs.unlinkSync(path.join(musicDir(), old.cover_file))
    } catch {
      /* 旧封面已不在也无妨 */
    }
  }
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as unknown as TrackRow
  return mapTrack(row)
}

/** AI 重置整理：清空分段结果（重新整理前用）。 */
export function clearSegments(id: number): TrackItem {
  const db = getDb()
  db.prepare("UPDATE tracks SET segments = '[]' WHERE id = ?").run(Number(id))
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as
    | TrackRow
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  return mapTrack(row)
}

/** 从听力文本里析出词典收录的单词（生词标签用；按首次出现排序）。 */
export function extractWordsFromTrack(id: number): MusicWordItem[] {
  const db = getDb()
  const row = db.prepare('SELECT text_content FROM tracks WHERE id = ?').get(Number(id)) as
    | { text_content: string }
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  const bookId = resolveBookId()
  const seen = new Set<string>()
  const out: MusicWordItem[] = []
  const matches = row.text_content.toLowerCase().matchAll(/[a-z][a-z'-]{2,}/g)
  for (const m of matches) {
    const w = m[0].replace(/^['-]+|['-]+$/g, '')
    if (!w || seen.has(w)) continue
    seen.add(w)
    const entry = lookupDictionary(w)
    if (!entry?.meaning) continue
    const inBook = Boolean(
      db.prepare('SELECT id FROM words WHERE book_id = ? AND lower(headword) = ?').get(bookId, w)
    )
    out.push({ word: w, phonetic: entry.phonetic, meaning: entry.meaning, inBook })
    if (out.length >= 150) break
  }
  return out
}

export function deleteTrack(id: number): TrackItem[] {
  const db = getDb()
  const row = db.prepare('SELECT audio_file, cover_file FROM tracks WHERE id = ?').get(Number(id)) as
    | { audio_file: string; cover_file: string }
    | undefined
  db.prepare('DELETE FROM tracks WHERE id = ?').run(Number(id))
  for (const file of [row?.audio_file, row?.cover_file]) {
    if (file) {
      try {
        fs.unlinkSync(path.join(musicDir(), file))
      } catch {
        /* 文件已不在也无妨 */
      }
    }
  }
  return listTracks()
}

/** 本地清理字幕文本：去掉行首时间戳（[mm:ss.xx]）与 [ti:] 等元数据行，去空行。 */
export function cleanSubtitleText(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.replace(/^\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*/, '').trim())
    .map((line) => line.replace(/^\[[a-z]{2}\s*:.*?\]\s*$/i, '').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

/** 按行分块（每块约 maxChars 字符），避免长文本被模型截断。 */
function chunkLines(text: string, maxChars: number): string[] {
  const lines = text.split('\n')
  const chunks: string[] = []
  let cur = ''
  for (const line of lines) {
    if (cur && (cur.length + 1 + line.length) > maxChars) {
      chunks.push(cur)
      cur = line
    } else {
      cur = cur ? cur + '\n' + line : line
    }
  }
  if (cur) chunks.push(cur)
  return chunks
}

/** 无 AI 兜底：把若干碎行并成小段。 */
function fallbackSegment(chunk: string): string[] {
  const lines = chunk.split('\n').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 3) out.push(lines.slice(i, i + 3).join(' '))
  return out
}

/** AI 整理原文：本地清噪 → 分块语义分段 → 合并；单块失败用本地粗分兜底（不中断整体）。 */
export async function organizeTrack(
  id: number,
  onProgress?: (done: number, total: number) => void
): Promise<TrackItem> {
  const db = getDb()
  const row = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as
    | TrackRow
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  if (!row.text_content.trim()) throw new Error('先导入或粘贴对应文本，再让 AI 整理。')
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')

  const cleaned = cleanSubtitleText(row.text_content)
  if (!cleaned) throw new Error('文本清理后为空，请检查文本内容。')
  const chunks = chunkLines(cleaned, 5000).slice(0, 12)
  const allSegments: string[] = []
  let aiFailedChunks = 0
  for (let i = 0; i < chunks.length; i++) {
    try {
      const raw = await chatCompletion(cfg, [{ role: 'user', content: buildOrganizeTextPrompt(row.title, chunks[i]) }], {
        maxTokens: 3000,
        timeoutMs: 90_000
      })
      const parsed = extractJsonObject(raw)
      const segs = Array.isArray(parsed)
        ? parsed.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0)
        : []
      if (segs.length === 0) throw new Error('empty')
      allSegments.push(...segs)
    } catch {
      aiFailedChunks++
      allSegments.push(...fallbackSegment(chunks[i]))
    }
    onProgress?.(i + 1, chunks.length)
  }
  if (allSegments.length === 0) throw new Error('整理失败，请检查文本后重试。')
  db.prepare('UPDATE tracks SET segments = ? WHERE id = ?').run(JSON.stringify(allSegments), Number(id))
  const updated = db.prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(Number(id)) as unknown as TrackRow
  if (aiFailedChunks > 0) {
    console.log(`[lexiflow] organizeTrack: ${aiFailedChunks}/${chunks.length} 块走本地兜底`)
  }
  return mapTrack(updated)
}

/** 播放器在播放中每 5 秒回传一次，累计听力时间（统计用）。 */
export function listeningTick(seconds: number): void {
  const s = Math.max(1, Math.min(300, Number(seconds) || 5))
  const d = new Date()
  const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  getDb()
    .prepare('INSERT INTO listening_time (date, seconds) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET seconds = seconds + excluded.seconds')
    .run(date, s)
}

/** 自检用：回退一段听力时间。 */
export function unlisteningTick(seconds: number): void {
  const d = new Date()
  const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  getDb().prepare('UPDATE listening_time SET seconds = MAX(0, seconds - ?) WHERE date = ?').run(Number(seconds) || 0, date)
}
