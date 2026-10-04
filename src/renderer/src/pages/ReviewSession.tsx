import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GradePayload, ReviewQueueResult, ReviewReason, WordDetailData } from '../../../shared/types'
import MasteryDots from '../components/MasteryDots'

const REASON_LABEL: Record<ReviewReason, string> = {
  relearn: '需要重新理解',
  usage: '需要重新使用',
  collocation: '搭配薄弱',
  transfer: '迁移测试'
}

const REASON_GUIDE: Record<ReviewReason, string> = {
  relearn: '先回忆这个词的含义（点击释义胶带揭开对照），再用它造一个句子。',
  usage: '这个词上次「词义使用」失分了。造一个句子，重点是把词用对地方。',
  collocation: '造一个能体现它常见搭配的句子——介词、固定短语要用对。',
  transfer: '换一个全新的场景再用一次这个词，检验你是不是真的会迁移。'
}

const GRADE_DIMS: Array<{ key: keyof GradePayload['scores']; label: string }> = [
  { key: 'usage', label: '词义使用' },
  { key: 'grammar', label: '语法' },
  { key: 'collocation', label: '搭配' },
  { key: 'naturalness', label: '自然度' }
]

const GRADUATE_LINE = 3.5

type Outcome = 'graduated' | 'taped' | null

export default function ReviewSession(): React.JSX.Element {
  const [queue, setQueue] = useState<ReviewQueueResult | null>(null)
  const [idx, setIdx] = useState(0)
  const [word, setWord] = useState<WordDetailData | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [sentence, setSentence] = useState('')
  const [grade, setGrade] = useState<GradePayload | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({ graduated: 0, taped: 0 })

  const loadQueue = useCallback(async (): Promise<void> => {
    setQueue(await window.lexi.reviewQueue())
  }, [])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const loadWord = useCallback((id: number): void => {
    void window.lexi.getWord(id).then((w) => {
      setWord(w)
      setRevealed(false)
      setSentence('')
      setGrade(null)
      setOutcome(null)
      setError('')
    })
  }, [])

  useEffect(() => {
    if (queue && queue.items[idx] && !word) loadWord(queue.items[idx].wordId)
  }, [idx, queue, word, loadWord])

  async function submitGrade(): Promise<void> {
    if (!word || !sentence.trim()) return
    setBusy(true)
    setError('')
    try {
      const r = await window.lexi.gradeSentence(word.id, sentence)
      if (r.word && r.grade) {
        setGrade(r.grade.scores ? r.grade : null)
        const s = r.grade.scores
        const avg = (s.usage + s.grammar + s.collocation + s.naturalness) / 4
        if (avg >= GRADUATE_LINE) {
          await window.lexi.graduateReview(word.id)
          setOutcome('graduated')
          setStats((v) => ({ ...v, graduated: v.graduated + 1 }))
        } else {
          await window.lexi.tapeReview(word.id)
          setOutcome('taped')
          setStats((v) => ({ ...v, taped: v.taped + 1 }))
        }
        setWord(r.word)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function markTape(): Promise<void> {
    if (!word || outcome) return
    await window.lexi.tapeReview(word.id)
    setOutcome('taped')
    setStats((v) => ({ ...v, taped: v.taped + 1 }))
  }

  function next(): void {
    const nextIdx = idx + 1
    setWord(null)
    if (queue && nextIdx < queue.items.length) {
      setIdx(nextIdx)
      loadWord(queue.items[nextIdx].wordId)
    } else {
      setIdx(queue ? queue.items.length : 0)
    }
  }

  if (!queue) {
    return (
      <section>
        <Link to="/today" className="back-link">
          ← 返回今日学习
        </Link>
        <p className="stub-note" style={{ marginTop: 20 }}>
          正在整理今日复习…
        </p>
      </section>
    )
  }

  if (queue.total === 0 || idx >= queue.items.length) {
    return (
      <section>
        <Link to="/today" className="back-link">
          ← 返回今日学习
        </Link>
        <div className="card finish-card" style={{ marginTop: 20 }}>
          <h3 className="card-h3">{queue.total === 0 ? '今天没有到期的复习 ✓' : '复习完成 ✓'}</h3>
          {queue.total > 0 && (
            <p className="section-note">
              本轮毕业 {stats.graduated} 词（出队，不再自动回来）· {stats.taped} 词明天再来。
            </p>
          )}
          {queue.total === 0 && (
            <p className="section-note">到期队列空了。学习时点「释义胶带」标记不熟，词就会进入复习队列。</p>
          )}
          <div className="btn-row">
            <Link to="/today" className="btn">
              返回今日学习
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const item = queue.items[idx]
  const avg =
    grade && grade.scores
      ? (grade.scores.usage + grade.scores.grammar + grade.scores.collocation + grade.scores.naturalness) / 4
      : 0

  return (
    <section>
      <div className="detail-topbar">
        <Link to="/today" className="back-link">
          ← 返回今日学习
        </Link>
        <span className="session-progress">
          {idx + 1} / {queue.total}
        </span>
      </div>

      <div className="review-group-bar">
        {(['relearn', 'usage', 'collocation', 'transfer'] as ReviewReason[]).map((r) => (
          <span key={r} className={'chip' + (item.reason === r ? ' chip-active' : '')}>
            {REASON_LABEL[r]} {queue.counts[r]}
          </span>
        ))}
      </div>

      {word && (
        <>
          <div className="card detail-head">
            <div className="detail-title-row">
              <h1 className="detail-word">{word.headword}</h1>
              <span className="reason-tag">{REASON_LABEL[item.reason]}</span>
            </div>
            <p className="detail-phonetic">{word.phonetic}</p>
            {item.reason === 'relearn' ? (
              <div className="meaning-tape" data-revealed={revealed} onClick={() => setRevealed(true)}>
                {revealed ? word.meaning : '点击查看释义（先自己回忆）'}
              </div>
            ) : (
              <p className="detail-meaning">{word.meaning}</p>
            )}
            <p className="review-guide">{REASON_GUIDE[item.reason]}</p>
          </div>

          <div className="card module-card" style={{ marginTop: 16 }}>
            <h3 className="card-h3">造句</h3>
            <textarea
              className="notes-area"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder={`用 ${word.headword} 造句…`}
              disabled={!!outcome}
            />
            <div className="btn-row">
              <button className="btn" disabled={busy || !sentence.trim() || !!outcome} onClick={() => void submitGrade()}>
                {busy ? '批改中…' : '提交批改'}
              </button>
              {!outcome && (
                <button className="btn btn-ghost" disabled={busy} onClick={() => void markTape()}>
                  还是不熟（明天再来）
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="card module-card" style={{ marginTop: 16 }}>
              <p className="status-line status-err">{error}</p>
            </div>
          )}

          {grade && grade.scores && (
            <div className="card module-card" style={{ marginTop: 16 }}>
              <h3 className="card-h3">AI 反馈</h3>
              <div className="score-grid">
                {GRADE_DIMS.map((d) => (
                  <div key={d.key} className="score-row">
                    <span className="mastery-label">{d.label}</span>
                    <span className="score-num">{grade.scores[d.key]} / 5</span>
                  </div>
                ))}
              </div>
              {grade.issues.length > 0 && (
                <ul className="issue-list">
                  {grade.issues.map((issue, i) => (
                    <li key={i} className="issue-item">
                      <p className="issue-original">{issue.original}</p>
                      <p className="issue-why">为什么：{issue.why}</p>
                      <p className="issue-fix">建议：{issue.fix}</p>
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

          {outcome && (
            <div className={'card module-card review-outcome ' + (outcome === 'graduated' ? 'review-outcome-ok' : 'review-outcome-tape')}>
              {outcome === 'graduated' ? (
                <>
                  <p className="review-outcome-title">✓ 毕业出队</p>
                  <p className="section-note">四维均分 {avg.toFixed(1)} ≥ {GRADUATE_LINE}，这个词从复习队列毕业，不再自动回来。</p>
                </>
              ) : (
                <>
                  <p className="review-outcome-title">↻ 明天再来</p>
                  <p className="section-note">已放回队列，明天到期。多输几遍就熟了。</p>
                </>
              )}
            </div>
          )}

          <div className="card module-card" style={{ marginTop: 16 }}>
            <h3 className="card-h3">掌握程度</h3>
            <div className="mastery-grid">
              {(['recognition', 'comprehension', 'production', 'transfer'] as const).map((d) => (
                <div key={d} className="mastery-row">
                  <span className="mastery-label">{ { recognition: '识别', comprehension: '理解', production: '使用', transfer: '迁移' }[d]}</span>
                  <MasteryDots level={Math.max(0, Math.min(5, word.mastery[d] ?? 0))} max={5} />
                </div>
              ))}
            </div>
          </div>

          <div className="session-nav">
            <span />
            <button className="btn" disabled={!outcome} onClick={next}>
              {idx === queue.total - 1 ? '完成复习 ✓' : '下一个词 →'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
