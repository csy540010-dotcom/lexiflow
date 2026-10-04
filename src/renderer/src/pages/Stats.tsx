import { useEffect, useState } from 'react'
import type { StatsSummary } from '../../../shared/types'

const RANGES: Array<{ days: number | null; label: string }> = [
  { days: 7, label: '近7天' },
  { days: 30, label: '近30天' },
  { days: 90, label: '近3月' },
  { days: null, label: '全部' }
]

const KIND_LABEL: Record<string, string> = { listening: '🎧 听力', reading: '📖 阅读', writing: '✍️ 写作', custom: '📌 自定义' }

export default function Stats(): React.JSX.Element {
  const [days, setDays] = useState<number | null>(7)
  const [summary, setSummary] = useState<StatsSummary | null>(null)

  useEffect(() => {
    void window.lexi.statsSummary(days).then(setSummary)
  }, [days])

  if (!summary) {
    return (
      <section>
        <h1 className="page-title">统计分析</h1>
        <p className="page-sub">长期学习反馈</p>
        <div className="card">
          <p className="stub-note">正在汇总…</p>
        </div>
      </section>
    )
  }

  const accuracy =
    summary.mcqTotal > 0 ? Math.round((summary.mcqCorrect / summary.mcqTotal) * 100) : null
  const distTotal = summary.mastery.unlearned + summary.mastery.learning + summary.mastery.mastered

  return (
    <section>
      <h1 className="page-title">统计分析</h1>
      <p className="page-sub">长期学习反馈——所有数据都在本机</p>

      <div className="chips" style={{ marginBottom: 14 }}>
        {RANGES.map((r) => (
          <button
            key={r.label}
            className={'chip' + (days === r.days ? ' chip-active' : '')}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="stats-grid">
        <div className="card stat-card">
          <h3 className="card-h3">学习时长</h3>
          <p className="stat-big">{summary.studyMinutes}<span className="stat-unit"> 分钟</span></p>
          <p className="stub-note">打开今日学习页面累计的专注时间</p>
        </div>

        <div className="card stat-card">
          <h3 className="card-h3">新掌握词</h3>
          <p className="stat-big">{summary.newMastered}<span className="stat-unit"> 词</span></p>
          <p className="stub-note">范围内四维掌握度均分首次达到 4.5 的词</p>
        </div>

        <div className="card stat-card">
          <h3 className="card-h3">造句批改</h3>
          <p className="stat-big">
            {summary.gradedCount}<span className="stat-unit"> 次</span>
          </p>
          <p className="stub-note">
            四维均分 {summary.gradeAvg > 0 ? <strong>{summary.gradeAvg} / 5</strong> : '暂无'}
          </p>
        </div>

        <div className="card stat-card">
          <h3 className="card-h3">练习准确率</h3>
          <p className="stat-big">{accuracy === null ? '—' : accuracy + '%'}</p>
          <p className="stub-note">
            {summary.mcqTotal > 0 ? `选择题答对 ${summary.mcqCorrect} / ${summary.mcqTotal}` : '还没有选择题练习记录'}
          </p>
        </div>

        <div className="card stat-card">
          <h3 className="card-h3">复习完成</h3>
          <p className="stat-big">
            {summary.reviewGraduated}<span className="stat-unit"> 毕业</span>
          </p>
          <p className="stub-note">
            {summary.reviewTaped} 词点过「明天再来」
            {summary.reviewGraduated + summary.reviewTaped === 0 && '（还没有复习记录）'}
          </p>
        </div>

        <div className="card stat-card">
          <h3 className="card-h3">任务打卡</h3>
          {summary.tasksDone.length === 0 ? (
            <p className="stub-note">范围内还没有自定义任务打卡</p>
          ) : (
            <ul className="stat-list">
              {summary.tasksDone.map((t) => (
                <li key={t.kind}>
                  {KIND_LABEL[t.kind] ?? t.kind} × {t.count}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card stat-card">
          <h3 className="card-h3">词汇掌握分布（当前）</h3>
          {distTotal === 0 ? (
            <p className="stub-note">词库还是空的，先去词汇库导入或学习。</p>
          ) : (
            <>
              <div className="dist-row">
                <span>未学习 {summary.mastery.unlearned}</span>
                <span>学习中 {summary.mastery.learning}</span>
                <span>已掌握 {summary.mastery.mastered}</span>
              </div>
              <div className="dist-bar">
                {distTotal > 0 && (
                  <>
                    <div
                      className="dist-seg dist-seg-muted"
                      style={{ width: Math.round((summary.mastery.unlearned / distTotal) * 100) + '%' }}
                    />
                    <div
                      className="dist-seg dist-seg-learning"
                      style={{ width: Math.round((summary.mastery.learning / distTotal) * 100) + '%' }}
                    />
                    <div
                      className="dist-seg dist-seg-mastered"
                      style={{ width: Math.round((summary.mastery.mastered / distTotal) * 100) + '%' }}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="card stat-card">
          <h3 className="card-h3">高频错误词</h3>
          {summary.topMistakes.length === 0 ? (
            <p className="stub-note">范围内还没有批改出错的记录——保持！</p>
          ) : (
            <ul className="stat-list">
              {summary.topMistakes.map((m) => (
                <li key={m.word}>
                  <span className="mistake-word">{m.word}</span>
                  <span className="mistake-count">{m.count} 个错误点</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <p className="section-note">
          听力时间、阅读量、写作量将在「阅读」「音乐听力」模块（M6）上线后自动计入。目前自定义任务的打卡次数已在上方统计。
        </p>
      </div>
    </section>
  )
}
