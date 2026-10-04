import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    db = new Database(path.join(dir, 'lexiflow.db'))
    db.pragma('journal_mode = WAL')
    db.exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  }
  return db
}

export function dbFilePath(): string {
  return path.join(app.getPath('userData'), 'lexiflow.db')
}

export function kvGet(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? row.value : null
}

export function kvSet(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value)
}
