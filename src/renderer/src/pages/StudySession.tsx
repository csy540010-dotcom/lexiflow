import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GradePayload, SentenceFavoriteItem, WordDetailData } from '../../../shared/types'
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
  const [explainCollapsed, setExplainCollapsed] = useState(false)
  const [promptIdx, setPromptIdx] = useState(0)
  const [sentence, setSentence] = useState('')
  const [grade, setGrade] = useState<{ sentence: string; grade: GradePayload } | null>(null)
  const [favs, setFavs] = useState<SentenceFavoriteItem[]>([])
  const [busy, setBusy] = useState<'explain' | 'grade' | null>(null)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => {
    void window.lexi.studyQueue().then((ids) => {
      setQueue(ids)
      setLoading(false)
    })
  }, [])

  const loadWord = useCallback((id: number): void => {
    void window.lexi.getWord(id).then((w) => {
      setWord(w)
      const cached = w ? cachedExplain(w) : ''
      setExplain(cached)
      // 已有缓存讲解说明读过一遍，默认收起给练习腾地方；新讲解默认展开
      setExplainCollapsed(Boolean(cached))
      setGrade(w ? latestGrade(w) : null)
      setPromptIdx(0)
      setSentence('')
      setError('')
    })
    void window.lexi.listFavorites(id).then(setFavs)
  }, [])

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2200)
  }

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
      setExplainCollapsed(false)
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

  async function favoriteRevised(): Promise<void> {
    if (!word || !grade?.grade.revised.trim()) return
    try {
      setFavs(await window.lexi.addFavorite(word.id, grade.grade.revised, 'revised'))
      flash('已收藏修改后的句子')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
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

  const alreadyFav =
    !!grade && !!grade.grade.revised.trim() && favs.some((f) => f.sentence === grade.grade.revised.trim())

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
            <div className="card-head-row">
              <h3 className="card-h3">AI 讲解</h3>
              {explain && (
                <button className="text-btn" onClick={() => setExplainCollapsed((v) => !v)}>
                  {explainCollapsed ? '展开讲解 ▾' : '收起讲解 ▴'}
                </button>
              )}
            </div>
            {explain ? (
              explainCollapsed ? (
                <p className="stub-note">讲解已收起，需要时点上方「展开讲解」。</p>
              ) : (
                <>
                  <pre className="explain-content">{explain}</pre>
                  <div className="btn-row">
                    <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void generateExplain()}>
                      重新讲解
                    </button>
                  </div>
                </>
              )
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
            {word.prompts.length > 0 ? (
              <p className="prompt-hint">
                💡 造句提示：{word.prompts[promptIdx % word.prompts.length]}
                {word.prompts.length > 1 && (
                  <button className="text-btn prompt-next" disabled={busy !== null} onClick={() => setPromptIdx((i) => i + 1)}>
                    换一句 ↻
                  </button>
                )}
              </p>
            ) : (
              <p className="prompt-hint">该词暂无内置造句提示，直接写一个试试——可以参考 AI 讲解里的例句和搭配。</p>
            )}
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
                  <div className="revised-row">
                    <p className="revised-line">
                      修改后：<span>{grade.grade.revised}</span>
                    </p>
                    <button
                      className={'text-btn fav-btn' + (alreadyFav ? ' fav-done' : '')}
                      disabled={alreadyFav}
                      onClick={() => void favoriteRevised()}
                    >
                      {alreadyFav ? '★ 已收藏' : '☆ 收藏此句'}
                    </button>
                  </div>
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
          {toast && <div className="toast">{toast}</div>}
        </>
      )}
    </section>
  )
}
