import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GradePayload, McqResponse, PracticePoolItem, PracticeType, WordDetailData } from '../../../shared/types'

interface PracticeTypeMeta {
  id: PracticeType
  label: string
  engine: string
  desc: string
}

const GROUP_SIZE = 5

const MCQ_LETTERS = ['A', 'B', 'C', 'D']

export default function PracticeCenter(): React.JSX.Element {
  const [types] = useState<PracticeTypeMeta[]>([
    { id: 'translate', label: '中译英', engine: 'sentence', desc: 'AI 给中文句子，你翻译成英文' },
    { id: 'free', label: '自由表达', engine: 'sentence', desc: '围绕场景自由写句子' },
    { id: 'redo', label: '错误重练', engine: 'sentence', desc: '把之前写错的句子重新写对' },
    { id: 'context', label: '语境选词', engine: 'mcq', desc: '例句挖空，选出正确的词' },
    { id: 'collocation', label: '搭配辨析', engine: 'mcq', desc: '选出地道的搭配' },
    { id: 'synonym', label: '近义词辨析', engine: 'mcq', desc: '近义词里选最合适的' }
  ])

  const [view, setView] = useState<'menu' | 'session' | 'done'>('menu')
  const [type, setType] = useState<PracticeType | null>(null)
  const [meta, setMeta] = useState<PracticeTypeMeta | null>(null)
  const [items, setItems] = useState<PracticePoolItem[]>([])
  const [idx, setIdx] = useState(0)
  const [word, setWord] = useState<WordDetailData | null>(null)
  const [question, setQuestion] = useState<McqResponse | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [instruction, setInstruction] = useState('')
  const [origIssues, setOrigIssues] = useState<Array<{ original: string; why: string; fix: string }>>([])
  const [origSentence, setOrigSentence] = useState('')
  const [sentence, setSentence] = useState('')
  const [grade, setGrade] = useState<GradePayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [score, setScore] = useState({ correct: 0, graded: 0 })

  const engine = meta?.engine ?? 'mcq'

  async function startType(t: PracticeTypeMeta): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const pool = t.id === 'redo' ? await window.lexi.redoPool(GROUP_SIZE) : await window.lexi.practicePool(GROUP_SIZE)
      if (pool.length === 0) {
        setError(t.id === 'redo' ? '最近还没有批改出过错句——先去「单词学习」练几个词。' : '还没有学过的词，先完成今日新词。')
        return
      }
      setType(t.id)
      setMeta(t)
      setItems(pool)
      setIdx(0)
      setScore({ correct: 0, graded: 0 })
      setView('session')
      await loadItem(pool[0], t.id)
    } finally {
      setBusy(false)
    }
  }

  const loadItem = useCallback(async (item: PracticePoolItem, t: PracticeType): Promise<void> => {
    setBusy(true)
    setError('')
    setQuestion(null)
    setPicked(null)
    setInstruction('')
    setOrigIssues([])
    setOrigSentence('')
    setSentence('')
    setGrade(null)
    try {
      const w = await window.lexi.getWord(item.wordId)
      setWord(w)
      const engine = t === 'context' || t === 'collocation' || t === 'synonym' ? 'mcq' : 'sentence'
      if (engine === 'mcq') {
        setQuestion(await window.lexi.genMcq(item.wordId, t))
      } else if (t === 'redo') {
        const rec = [...(w?.records ?? [])].reverse().find((r) => r.kind === 'ai_grade')
        const p = rec?.payload as { sentence?: string; grade?: GradePayload } | undefined
        setOrigSentence(p?.sentence ?? '')
        setOrigIssues(p?.grade?.issues ?? [])
      } else {
        const r = await window.lexi.genSentenceTask(item.wordId, t)
        setInstruction(r.instruction)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  function pick(option: number): void {
    if (!question || picked !== null) return
    setPicked(option)
    if (option === question.answer) setScore((v) => ({ ...v, correct: v.correct + 1 }))
  }

  async function submitSentence(): Promise<void> {
    const item = items[idx]
    if (!item || !sentence.trim()) return
    setBusy(true)
    setError('')
    try {
      const r = await window.lexi.gradeSentence(item.wordId, sentence)
      if (r.grade) {
        setGrade(r.grade)
        setScore((v) => ({ ...v, graded: v.graded + 1 }))
        const w = await window.lexi.getWord(item.wordId)
        if (w) setWord(w)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function next(): Promise<void> {
    const nextIdx = idx + 1
    if (nextIdx < items.length) {
      setIdx(nextIdx)
      await loadItem(items[nextIdx], type as PracticeType)
    } else {
      await window.lexi.recordPractice(type as PracticeType, { items: items.length, correct: score.correct, graded: score.graded })
      setView('done')
    }
  }

  /* ── 菜单 ─────────────────────────── */
  if (view === 'menu') {
    return (
      <section>
        <Link to="/today" className="back-link">
          ← 返回今日学习
        </Link>
        <h1 className="page-title" style={{ marginTop: 10 }}>
          单词练习
        </h1>
        <p className="page-sub">专项能力训练——系统会针对你薄弱的地方推荐练什么</p>
        {error && (
          <div className="card" style={{ marginBottom: 14 }}>
            <p className="status-line status-err">{error}</p>
          </div>
        )}
        <div className="pt-grid">
          {types.map((t) => (
            <button key={t.id} className="pt-card" disabled={busy} onClick={() => void startType(t)}>
              <span className="pt-label">{t.label}</span>
              <span className="pt-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>
    )
  }

  /* ── 结算 ─────────────────────────── */
  if (view === 'done') {
    return (
      <section>
        <Link to="/today" className="back-link">
          ← 返回今日学习
        </Link>
        <div className="card finish-card" style={{ marginTop: 20 }}>
          <h3 className="card-h3">{meta?.label}练习完成 ✓</h3>
          <p className="section-note">
            本组 {items.length} 题{engine === 'mcq' ? ` · 答对 ${score.correct} 题` : ` · 批改 ${score.graded} 句`}。成绩已计入统计分析。
          </p>
          <div className="btn-row">
            <button
              className="btn"
              onClick={() => {
                setView('menu')
                setError('')
              }}
            >
              再练一组
            </button>
            <Link to="/today" className="btn btn-ghost">
              返回今日学习
            </Link>
          </div>
        </div>
      </section>
    )
  }

  /* ── 会话 ─────────────────────────── */
  const item = items[idx]

  return (
    <section>
      <div className="detail-topbar">
        <button
          className="text-btn"
          onClick={() => {
            setView('menu')
            setError('')
          }}
        >
          ← 换个练习类型
        </button>
        <span className="session-progress">
          {meta?.label} · {idx + 1} / {items.length}
        </span>
      </div>

      {busy && (
        <div className="card module-card">
          <p className="stub-note">正在准备题目…</p>
        </div>
      )}

      {!busy && error && (
        <div className="card module-card">
          <p className="status-line status-err">{error}</p>
          <div className="btn-row">
            <button className="btn btn-ghost btn-sm" onClick={() => void loadItem(item, type as PracticeType)}>
              重试
            </button>
          </div>
        </div>
      )}

      {!busy && !error && item && word && engine === 'mcq' && question && (
        <div className="card module-card">
          <p className="mcq-stem">{question.stem}</p>
          <div className="mcq-options">
            {question.options.map((opt, i) => {
              const cls =
                picked === null
                  ? 'mcq-opt'
                  : i === question.answer
                    ? 'mcq-opt mcq-opt-correct'
                    : i === picked
                      ? 'mcq-opt mcq-opt-wrong'
                      : 'mcq-opt mcq-opt-dim'
              return (
                <button key={i} className={cls} disabled={picked !== null} onClick={() => pick(i)}>
                  <span className="mcq-letter">{MCQ_LETTERS[i]}</span>
                  {opt}
                </button>
              )
            })}
          </div>
          {picked !== null && (
            <div className="mcq-explain">
              <p className={picked === question.answer ? 'status-line status-ok' : 'status-line status-err'}>
                {picked === question.answer ? '✓ 答对了' : `✗ 正确答案：${MCQ_LETTERS[question.answer]}`}
              </p>
              {question.explanation && <p className="section-note">{question.explanation}</p>}
            </div>
          )}
        </div>
      )}

      {!busy && !error && item && engine === 'sentence' && (
        <div className="card module-card">
          <p className="practice-word-line">
            考察词：<strong>{word.headword}</strong>
            <span className="detail-status" style={{ marginLeft: 10 }}>
              {word.meaning.slice(0, 40)}
            </span>
          </p>
          {type === 'translate' && instruction && (
            <p className="prompt-hint">把下面的句子翻译成英文（用上 {word.headword}）：{instruction}</p>
          )}
          {type === 'free' && instruction && <p className="prompt-hint">场景：{instruction}</p>}
          {type === 'redo' && origSentence && (
            <div className="redo-box">
              <p className="issue-original">上次写的：{origSentence}</p>
              {origIssues.map((iss, i) => (
                <p key={i} className="issue-why">
                  · {iss.why}
                </p>
              ))}
              <p className="section-note">重新写一个正确的版本：</p>
            </div>
          )}
          <textarea
            className="notes-area"
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            placeholder="写下你的英文句子…"
            disabled={!!grade}
          />
          <div className="btn-row">
            {!grade && (
              <button className="btn" disabled={busy || !sentence.trim()} onClick={() => void submitSentence()}>
                {busy ? '批改中…' : '提交批改'}
              </button>
            )}
          </div>
        </div>
      )}

      {!busy && !error && grade && grade.scores && (
        <div className="card module-card" style={{ marginTop: 16 }}>
          <h3 className="card-h3">AI 反馈</h3>
          <div className="score-grid">
            {(['usage', 'grammar', 'collocation', 'naturalness'] as const).map((k) => (
              <div key={k} className="score-row">
                <span className="mastery-label">{ { usage: '词义使用', grammar: '语法', collocation: '搭配', naturalness: '自然度' }[k]}</span>
                <span className="score-num">{grade.scores[k]} / 5</span>
              </div>
            ))}
          </div>
          {grade.issues.length > 0 && (
            <ul className="issue-list">
              {grade.issues.map((iss, i) => (
                <li key={i} className="issue-item">
                  <p className="issue-original">{iss.original}</p>
                  <p className="issue-why">为什么：{iss.why}</p>
                  <p className="issue-fix">建议：{iss.fix}</p>
                </li>
              ))}
            </ul>
          )}
          {grade.revised && (
            <p className="revised-line">
              修改后：<span>{grade.revised}</span>
            </p>
          )}
          {grade.comment && <p className="section-note">{grade.comment}</p>}
        </div>
      )}

      {!busy && (picked !== null || grade) && (
        <div className="session-nav">
          <span />
          <button className="btn" onClick={() => void next()}>
            {idx === items.length - 1 ? '完成本组 ✓' : '下一题 →'}
          </button>
        </div>
      )}
    </section>
  )
}
