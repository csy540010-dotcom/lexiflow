import { getDb } from './db'
import { COVER_LIBRARY_SIZE, coverIdAt } from '../shared/types'

/** 从封面库挑一个当前表里还没被使用的封面 ID（保证互不重复，用完则回绕）。 */
export function nextFreeCoverId(table: 'books' | 'tracks'): string {
  const db = getDb()
  const used = new Set(
    (db.prepare(`SELECT cover_id FROM ${table}`).all() as Array<{ cover_id: string }>)
      .map((r) => r.cover_id)
      .filter(Boolean)
  )
  for (let i = 0; i < COVER_LIBRARY_SIZE; i++) {
    const id = coverIdAt(i)
    if (!used.has(id)) return id
  }
  return coverIdAt(used.size)
}

/** 启动/导入后补齐：给还没有封面的词书与听力分配互不重复的封面。 */
export function ensureUniqueCovers(): void {
  const db = getDb()
  for (const table of ['books', 'tracks'] as const) {
    const rows = db.prepare(`SELECT id, cover_id FROM ${table} ORDER BY id`).all() as Array<{
      id: number
      cover_id: string
    }>
    const used = new Set(rows.map((r) => r.cover_id).filter(Boolean))
    let cursor = 0
    for (const row of rows) {
      if (row.cover_id) continue
      while (used.has(coverIdAt(cursor))) cursor++
      const cid = coverIdAt(cursor)
      db.prepare(`UPDATE ${table} SET cover_id = ? WHERE id = ?`).run(cid, row.id)
      used.add(cid)
      cursor++
    }
  }
}
