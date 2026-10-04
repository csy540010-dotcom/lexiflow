import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getDb } from './db'
import { chatCompletion } from './ai'
import { buildOrganizeTextPrompt, extractJsonObject } from './prompts'
import { getAiConfig } from './settings'
import type { TrackItem } from '../shared/types'

/* ── 音乐听力（MP3 + 文本导入 / AI 整理 / 播放） ─────────────── */

interface TrackRow {
  id: number
  title: string
  audio_file: string
  text_content: string
  segments: string
  created_at: string
}

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
    createdAt: r.created_at
  }
}

export function listTracks(): TrackItem[] {
  const rows = getDb()
    .prepare('SELECT id, title, audio_file, text_content, segments, created_at FROM tracks ORDER BY id DESC')
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
    .prepare('INSERT INTO tracks (title, audio_file) VALUES (?, ?)')
    .run(title, name)
  const row = getDb()
    .prepare('SELECT id, title, audio_file, text_content, segments, created_at FROM tracks WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as unknown as TrackRow
  return mapTrack(row)
}

export function setTrackText(id: number, text: string): TrackItem {
  const db = getDb()
  db.prepare('UPDATE tracks SET text_content = ?, segments = ? WHERE id = ?').run(String(text ?? ''), '[]', Number(id))
  const row = db.prepare('SELECT id, title, audio_file, text_content, segments, created_at FROM tracks WHERE id = ?').get(Number(id)) as
    | TrackRow
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  return mapTrack(row)
}

export function deleteTrack(id: number): TrackItem[] {
  const db = getDb()
  const row = db.prepare('SELECT audio_file FROM tracks WHERE id = ?').get(Number(id)) as { audio_file: string } | undefined
  db.prepare('DELETE FROM tracks WHERE id = ?').run(Number(id))
  if (row?.audio_file) {
    try {
      fs.unlinkSync(path.join(musicDir(), row.audio_file))
    } catch {
      /* 文件已不在也无妨 */
    }
  }
  return listTracks()
}

/** AI 整理原文：清理格式、分段分句（时间轴对齐留后续版本）。 */
export async function organizeTrack(id: number): Promise<TrackItem> {
  const db = getDb()
  const row = db.prepare('SELECT id, title, audio_file, text_content, segments, created_at FROM tracks WHERE id = ?').get(Number(id)) as
    | TrackRow
    | undefined
  if (!row) throw new Error('听力条目不存在。')
  if (!row.text_content.trim()) throw new Error('先导入或粘贴对应文本，再让 AI 整理。')
  const cfg = getAiConfig()
  if (!cfg.baseUrl || !cfg.model) throw new Error('还没有配置 AI：请到「设置 → AI 配置」完成配置。')
  const raw = await chatCompletion(cfg, [{ role: 'user', content: buildOrganizeTextPrompt(row.title, row.text_content) }], {
    maxTokens: 2000,
    timeoutMs: 90_000
  })
  const parsed = extractJsonObject(raw)
  let segments: string[] = []
  if (Array.isArray(parsed)) segments = parsed.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0)
  if (segments.length === 0) {
    // 容错：按空行/换行粗分
    segments = row.text_content
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  if (segments.length === 0) throw new Error('AI 返回格式异常，请重试一次。')
  db.prepare('UPDATE tracks SET segments = ? WHERE id = ?').run(JSON.stringify(segments), Number(id))
  const updated = db.prepare('SELECT id, title, audio_file, text_content, segments, created_at FROM tracks WHERE id = ?').get(Number(id)) as unknown as TrackRow
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
