import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BookSummary, CustomTaskItem, TodaySummary } from '../../../shared/types'

const TASK_KINDS: Array<{ id: string; icon: string; label: string }> = [
  { id: 'listening', icon: '🎧', label: '听力' },
  { id: 'reading', icon: '📖', label: '阅读' },
  { id: 'writing', icon: '✍️', label: '写作' },
  { id: 'custom', icon: '📌', label: '自定义' }
]

function kindIcon(kind: string): string {
  return TASK_KINDS.find((k) => k.id === kind)?.icon ?? '📌'
}

export default function Today(): React.JSX.Element {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<TodaySummary | null>(null)
  const [books, setBooks] = useState<BookSummary[]>([])
  const [tasks, setTasks] = useState<CustomTaskItem[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newKind, setNewKind] = useState('listening')
  const [newTitle, setNewTitle] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [toast, setToast] = useState('')

  const reload = useCallback(async () => {
    const [s, b, t] = await Promise.all([window.lexi.studySummary(), window.lexi.listBooks(), window.lexi.listTasks()])
    setSummary(s)
    setBooks(b)
    setTasks(t)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2500)
  }

  async function changeBook(id: number): Promise<void> {
    await window.lexi.selectBook(id)
    await reload()
  }

  async function addTask(): Promise<void> {
    if (!newTitle.trim()) return
    const next = await window.lexi.addTask(newKind, newTitle, newTarget)
    setTasks(next)
    setNewTitle('')
    setNewTarget('')
    setShowAdd(false)
  }

  const vocabDone = !!summary && summary.newRemaining === 0 && summary.dailyNew > 0
  const doneCount = (vocabDone ? 1 : 0) + tasks.filter((t) => t.doneToday).length
  const totalCount = 3 + tasks.length
  const progress = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)

  return (
    <section>
      <h1 className="page-title">今日学习</h1>
      <p className="page-sub">回答「我今天该做什么」——整个 App 的主入口</p>

      {summary && (
        <div className="card book-card">
          <div className="book-card-head">
            <div>
              <p className="book-eyebrow">当前词书</p>
              <div className="book-title-row">
                <h3 className="book-name">{summary.bookName}</h3>
                <select
                  className="book-switch"
                  value={summary.bookId}
                  onChange={(e) => void changeBook(Number(e.target.value))}
                >
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="book-progress-num">
              {summary.learnedWords} / {summary.totalWords}
            </div>
          </div>
          <div className="bar">
            <div
              className="bar-fill"
              style={{ width: summary.totalWords ? Math.round((summary.learnedWords / summary.totalWords) * 100) + '%' : '0%' }}
            />
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">固定任务</h3>
        <div className="task-row">
          <span className="task-icon">📘</span>
          <div className="task-main">
            <span className="task-title">单词学习</span>
            <span className="task-meta">新词 {summary ? summary.newRemaining : '…'}</span>
          </div>
          <span className={'task-tag' + (vocabDone ? ' task-tag-done' : '')}>{vocabDone ? '✓ 今日完成' : '核心'}</span>
          <button className="btn btn-sm" onClick={() => navigate('/today/study')}>
            开始
          </button>
        </div>
        <div className="task-row task-muted">
          <span className="task-icon">🔁</span>
          <div className="task-main">
            <span className="task-title">复习巩固</span>
            <span className="task-meta">待复习 {summary ? summary.reviewDue : '…'}</span>
          </div>
          <span className="task-tag">M4</span>
          <button className="btn btn-sm btn-ghost" onClick={() => flash('复习模式在 M4 上线：按薄弱点安排练什么')}>
            开始
          </button>
        </div>
        <div className="task-row task-muted">
          <span className="task-icon">🧠</span>
          <div className="task-main">
            <span className="task-title">单词练习</span>
            <span className="task-meta">专项训练</span>
          </div>
          <span className="task-tag">M4</span>
          <button className="btn btn-sm btn-ghost" onClick={() => flash('专项训练在 M4 上线：中译英 / 语境选词 / 搭配辨析…')}>
            开始
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head-row">
          <h3 className="card-h3">我的任务</h3>
          <button className="text-btn" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? '收起' : '+ 添加任务'}
          </button>
        </div>
        <p className="section-note">听力、阅读、写作由你自己决定今天做不做、做多少。</p>

        {showAdd && (
          <div className="add-task-form">
            <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
              {TASK_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="任务名，如：TED 听力"
            />
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="每日目标，如：20 min"
            />
            <button className="btn btn-sm" onClick={() => void addTask()}>
              添加
            </button>
          </div>
        )}

        {tasks.length === 0 && !showAdd ? (
          <p className="stub-note">还没有自定义任务。点「+ 添加任务」把听力、阅读、写作排进今天。</p>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className={'task-row' + (t.doneToday ? ' task-row-done' : '')}>
              <span className="task-icon">{kindIcon(t.kind)}</span>
              <div className="task-main">
                <span className="task-title">{t.title}</span>
                {t.target && <span className="task-meta">{t.target}</span>}
              </div>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={t.doneToday}
                  onChange={async (e) => setTasks(await window.lexi.toggleTask(t.id, e.target.checked))}
                />
                {t.doneToday ? '已完成' : '打卡'}
              </label>
              <button
                className="text-btn task-remove"
                onClick={async () => {
                  if (window.confirm(`删除任务「${t.title}」？`)) setTasks(await window.lexi.removeTask(t.id))
                }}
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="today-progress-row">
          <span className="today-progress-label">今日进度 {doneCount} / {totalCount}</span>
          <span className="today-progress-num">{progress}%</span>
        </div>
        <div className="bar">
          <div className="bar-fill" style={{ width: progress + '%' }} />
        </div>
        {summary && (
          <p className="section-note" style={{ marginTop: 10 }}>
            今日已批改 {summary.gradedToday} 个词
          </p>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </section>
  )
}
