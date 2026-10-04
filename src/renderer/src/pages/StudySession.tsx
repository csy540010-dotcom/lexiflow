import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GradePayload, WordDetailData } from '../../../shared/types'
import MasteryDots from '../components/MasteryDots'

const SCORE_DIMS: Array<{ key: keyof GradePayload['scores']; label: string }> = [
  { key: 'usage', label: '词义使用' },
  { key: 'grammar', label: '语法' },
  { key: 'collocation', label: '搭配' },
  { key: 'naturalness', label: '自然度' }
]

const MASTERY_DIMS: Array<{ key: 'recognition' | 'comprehension' | 'production' | 'transfer'; label: string }> = [
  { key: 'recognition', label: '识别' },
  { key: 'comprehension', label: '理解' },
  { key: 'production', label: '使用' },
  { key: 'transfer', label: '迁移' }
]

const STATUS_LABEL: Record<number, string> = { 0: '未学习', 1: '学习中', 2: '已掌握' }

function cachedExplain(word: WordDetailData): string {
  const rec = [...word.records].reverse().find((r) => r.kind === 'ai_explain')
  if (!rec) return ''
  const p = rec.payload as { content?: string }
  return p.content ?? ''
}

function latestGrade(word: WordDetailData): { sentence: string; grade: GradePayload } | null {
  const rec = [...word.records].reverse().find((r) => r.kind === 'ai_grade')
  if (!rec) return null
  const p = rec.payload as { sentence?: string; grade?: GradePayload }
  if (!p.grade) return null
  return { sentence: p.sentence ?? '', grade: p.grade }
}

export default function StudySession(): React.JSX.Element {
  const [queue, setQueue] = useState<number[]>([])
  const [idx, setIdx] = useState(0)
  const [word, setWord] = useState<WordDetailData | null>(null)
  const [explain, setExplain] = useState('')
  const [sentence, setSentence] = useState('')
  const [grade, setGrade] = useState<{ sentence: string; grade: GradePayload } | null>(null)
  const [busy, setBusy] = useState<'explain' | 'grade' | null>(null)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void window.lexi.studyQueue().then((ids) => {
      setQueue(ids)
      setLoading(false)
    })
  }, [])

  const loadWord = useCallback((id: number): void => {
    void window.lexi.getWord(id).then((w) => {
      setWord(w)
      setExplain(w ? cachedExplain(w) : '')
      setGrade(w ? latestGrade(w) : null)
      setSentence('')
      setError('')
    })
  }, [])

  useEffect(() => {
    if (queue[idx] !== undefined) loadWord(queue[idx])
  }, [idx, queue, loadWord])

  async function generateExplain(): Promise<void> {
    if (!word) return
    setBusy('explain')
    setError('')
    try {
      const r = await window.lexi.explainWord(word.id)
      setExplain(r.content)
      const w = await window.lexi.getWord(word.id)
      if (w) setWord(w)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function submitGrade(): Promise<void> {
    if (!word || !sentence.trim()) return
    setBusy('grade')
    setError('')
    try {
      const r = await window.lexi.gradeSentence(word.id, sentence)
      setGrade({ sentence: r.grade ? sentence : sentence, grade: r.grade })
      if (r.word) {
        setWord(r.word)
        setSentence('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function next(): void {
    if (idx < queue.length - 1) setIdx(idx + 1)
    else setFinished(true)
  }

  if (loading) {
    return (
      <section>
        <Link to="/today" className="back-link">
          ← 返回今日学习
        </Link>
        <p className="stub-note" style={{ marginTop: 20 }}>
          正在准备今日新词…
        </p>
      </section>
    )
  }

  if (finished || queue.length === 0) {
    return (
      <section>
        <Link to="/today" className="back-link">
          ← 返回今日学习
        </Link>
        <div className="card finish-card" style={{ marginTop: 20 }}>
          <h3 className="card-h3">{queue.length === 0 ? '今日新词已完成 ✓' : '本组学习完成 ✓'}</h3>
          <p className="section-note">
            理解 → 使用 → 反馈 → 掌握变化，一个词走完才算学过。明天继续来，复习巩固会安排到期的词。
          </p>
          <div className="btn-row">
            <Link to="/today" className="btn">
              返回今日学习
            </Link>
            <Link to="/vocabulary" className="btn btn-ghost">
              去词汇库看看
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const hint = word?.prompts[0]

  return (
    <section>
      <div className="detail-topbar">
        <Link to="/today" className="back-link">
          ← 返回今日学习
        </Link>
        <span className="session-progress">
          {idx + 1} / {queue.length}
        </span>
      </div>

      {word && (
        <>
          <div className="card detail-head">
            <div className="detail-title-row">
              <h1 className="detail-word">{word.headword}</h1>
              <span className="detail-status">{STATUS_LABEL[word.status]}</span>
            </div>
            <p className="detail-phonetic">{word.phonetic || '（词典暂无音标）'}</p>
            <p className="detail-meaning">{word.meaning || '（词典暂无释义）'}</p>
          </div>

          <div className="card module-card" style={{ marginTop: 16 }}>
            <h3 className="card-h3">AI 讲解</h3>
            {explain ? (
              <>
                <pre className="explain-content">{explain}</pre>
                <div className="btn-row">
                  <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void generateExplain()}>
                    重新讲解
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="section-note">让 AI 把这个词讲透：核心含义、常用于、例句、搭配。</p>
                <button className="btn" disabled={busy !== null} onClick={() => void generateExplain()}>
                  {busy === 'explain' ? '正在讲解…' : '生成 AI 讲解'}
                </button>
              </>
            )}
          </div>

          <div className="card module-card" style={{ marginTop: 16 }}>
            <h3 className="card-h3">句子练习</h3>
            <p className="section-note">用「{word.headword}」写一个句子或短段落，AI 会从四个维度给反馈。</p>
            {hint && <p className="prompt-hint">💡 造句提示：{hint}</p>}
            <textarea
              className="notes-area"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder={`用 ${word.headword} 造句…`}
            />
            <div className="btn-row">
              <button className="btn" disabled={busy !== null || !sentence.trim()} onClick={() => void submitGrade()}>
                {busy === 'grade' ? '批改中…' : '提交批改'}
              </button>
            </div>
          </div>

          {error && (
            <div className="card module-card" style={{ marginTop: 16 }}>
              <p className="status-line status-err">{error}</p>
              {/配置/.test(error) && (
                <p className="section-note" style={{ marginTop: 6 }}>
                  到 <Link to="/settings" className="back-link">设置 → AI 配置</Link> 填好服务商和 Key 就能使用。
                </p>
              )}
            </div>
          )}

          <div className="card module-card" style={{ marginTop: 16 }}>
            <h3 className="card-h3">AI 反馈</h3>
            {grade ? (
              <>
                <div className="score-grid">
                  {SCORE_DIMS.map((d) => (
                    <div key={d.key} className="score-row">
                      <span className="mastery-label">{d.label}</span>
                      <span className="score-num">{grade.grade.scores[d.key]} / 5</span>
                    </div>
                  ))}
                </div>
                {grade.grade.issues.length > 0 && (
                  <ul className="issue-list">
                    {grade.grade.issues.map((issue, i) => (
                      <li key={i} className="issue-item">
                        <p className="issue-original">{issue.original}</p>
                        <p className="issue-why">为什么：{issue.why}</p>
                        <p className="issue-fix">建议：{issue.fix}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {grade.grade.revised && (
                  <p className="revised-line">
                    修改后：<span>{grade.grade.revised}</span>
                  </p>
                )}
                {grade.grade.comment && <p className="section-note">{grade.grade.comment}</p>}
              </>
            ) : (
              <p className="stub-note">提交句子批改后，这里给出词义使用 / 语法 / 搭配 / 自然度四个维度的评分和解释。</p>
            )}
          </div>

          <div className="card module-card" style={{ marginTop: 16 }}>
            <h3 className="card-h3">掌握程度（自动判断）</h3>
            <div className="mastery-grid">
              {MASTERY_DIMS.map((d) => (
                <div key={d.key} className="mastery-row">
                  <span className="mastery-label">{d.label}</span>
                  <MasteryDots level={Math.max(0, Math.min(5, word.mastery[d.key] ?? 0))} max={5} />
                </div>
              ))}
            </div>
          </div>

          <div className="session-nav">
            <button className="btn btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
              ‹ 上一个
            </button>
            <button className="btn" onClick={next}>
              {idx === queue.length - 1 ? '完成本组 ✓' : '下一个词 →'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
