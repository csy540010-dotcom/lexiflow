import { useEffect, useState } from 'react'
import type { PlanSettings } from '../../../shared/types'

interface PlanModalProps {
  onClose: () => void
  onSaved?: () => void
}

/** 学习计划快速调节（今日学习 / 单词学习会话内直接打开）：词汇量、复习上限、时间、强度。 */
export default function PlanModal({ onClose, onSaved }: PlanModalProps): React.JSX.Element {
  const [plan, setPlan] = useState<PlanSettings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.lexi.getSettings().then((s) => setPlan(s.plan))
  }, [])

  async function save(): Promise<void> {
    if (!plan) return
    setBusy(true)
    try {
      await window.lexi.saveSettings({ plan })
      onSaved?.()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-mask" onClick={() => !busy && onClose()}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="card-h3">学习计划</h3>
        <p className="section-note">调节词汇量（每日新词）与复习安排，保存后立即对今日学习和复习队列生效。</p>
        {!plan ? (
          <p className="stub-note">加载中…</p>
        ) : (
          <>
            <div className="field">
              <label>每日新词量（词汇量）</label>
              <input
                type="number"
                min={1}
                max={200}
                value={plan.dailyNew}
                onChange={(e) => setPlan({ ...plan, dailyNew: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div className="field">
              <label>每日复习上限</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={plan.dailyReviewLimit}
                onChange={(e) => setPlan({ ...plan, dailyReviewLimit: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div className="field">
              <label>每日学习时间（分钟）</label>
              <input
                type="number"
                min={5}
                max={600}
                step={5}
                value={plan.dailyMinutes}
                onChange={(e) => setPlan({ ...plan, dailyMinutes: Math.max(5, Number(e.target.value) || 5) })}
              />
            </div>
            <div className="field">
              <label>复习强度（决定复习毕业线）</label>
              <div className="intensity-row">
                <span className="hint">轻松</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={plan.reviewIntensity}
                  onChange={(e) => setPlan({ ...plan, reviewIntensity: Number(e.target.value) })}
                />
                <span className="hint">强化</span>
              </div>
              <span className="hint">
                当前毕业线 {(3.0 + (Math.min(5, Math.max(1, plan.reviewIntensity)) - 1) * 0.25).toFixed(2)} / 5
                （复习批改四维均分达到该线出队）
              </span>
            </div>
            <div className="btn-row">
              <button className="btn" disabled={busy} onClick={() => void save()}>
                保存
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={onClose}>
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
