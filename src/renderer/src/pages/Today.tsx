import { useEffect, useState } from 'react'

export default function Today(): React.JSX.Element {
  const [status, setStatus] = useState<{ sqliteVersion: string; dbPath: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.lexi
      .dbPing()
      .then(setStatus)
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <section>
      <h1 className="page-title">今日学习</h1>
      <p className="page-sub">回答「我今天该做什么」——整个 App 的主入口</p>
      <div className="card">
        <p className="stub-note">
          规划中的模块：当前词书卡片 · 固定核心任务（单词学习 / 复习巩固 / 单词练习）· 我的任务（听力 / 阅读 / 写作）
        </p>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">系统自检（M0）</h3>
        {error ? (
          <p className="stub-note" style={{ color: '#b0483c' }}>
            数据库连接失败：{error}
          </p>
        ) : status ? (
          <p className="stub-note">
            <span className="status-ok">✓ SQLite {status.sqliteVersion} 连接正常</span>
            <br />
            <span className="db-path">数据库：{status.dbPath}</span>
          </p>
        ) : (
          <p className="stub-note">正在连接数据库…</p>
        )}
      </div>
    </section>
  )
}
