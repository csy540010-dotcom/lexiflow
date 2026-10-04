import { useEffect, useState } from 'react'
import { AI_PRESETS } from '../../../shared/ai-presets'
import { applyTheme } from '../lib/theme'

export default function Settings(): React.JSX.Element {
  const [aiPreset, setAiPreset] = useState('custom')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [aiHas, setAiHas] = useState(false)
  const [aiMasked, setAiMasked] = useState('')
  const [testLine, setTestLine] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [plan, setPlan] = useState({ dailyNew: 20, dailyReviewLimit: 50, dailyMinutes: 60, reviewIntensity: 3 })
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light')
  const [about, setAbout] = useState({ appVersion: '', electronVersion: '', sqliteVersion: '' })
  const [toast, setToast] = useState('')

  useEffect(() => {
    window.lexi.getSettings().then((s) => {
      setAiPreset(s.ai.preset)
      setAiBaseUrl(s.ai.baseUrl)
      setAiModel(s.ai.model)
      setAiHas(s.ai.hasKey)
      setAiMasked(s.ai.keyMasked)
      setPlan(s.plan)
      setTheme(s.appearance.theme)
      setAbout(s.about)
    })
  }, [])

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2500)
  }

  async function pickPreset(id: string): Promise<void> {
    setAiPreset(id)
    const p = AI_PRESETS[id]
    if (p) {
      setAiBaseUrl(p.baseUrl)
      setAiModel(p.model)
    }
  }

  async function saveAi(): Promise<void> {
    setBusy(true)
    try {
      const s = await window.lexi.saveSettings({ ai: { preset: aiPreset, baseUrl: aiBaseUrl.trim(), model: aiModel.trim() } })
      if (aiKeyInput.trim()) {
        const ai = await window.lexi.setAiKey(aiKeyInput.trim())
        setAiHas(ai.hasKey)
        setAiMasked(ai.keyMasked)
        setAiKeyInput('')
      } else {
        setAiHas(s.ai.hasKey)
        setAiMasked(s.ai.keyMasked)
      }
      flash('AI 配置已保存')
      setTestLine(null)
    } finally {
      setBusy(false)
    }
  }

  async function runTest(): Promise<void> {
    setBusy(true)
    setTestLine({ ok: true, text: '正在测试连接…' })
    try {
      if (aiBaseUrl.trim() && aiModel.trim()) {
        // 先把当前表单存下来，测试的就是屏幕上的配置
        await window.lexi.saveSettings({ ai: { preset: aiPreset, baseUrl: aiBaseUrl.trim(), model: aiModel.trim() } })
        if (aiKeyInput.trim()) await window.lexi.setAiKey(aiKeyInput.trim())
      }
      const r = await window.lexi.testAi()
      setTestLine(r.ok ? { ok: true, text: `✓ 连接成功（模型回复：${r.reply}）` } : { ok: false, text: '✗ ' + (r.error ?? '未知错误') })
    } finally {
      setBusy(false)
    }
  }

  async function savePlan(): Promise<void> {
    setBusy(true)
    try {
      await window.lexi.saveSettings({ plan })
      flash('学习计划已保存')
    } finally {
      setBusy(false)
    }
  }

  async function saveAppearance(next: 'light' | 'dark' | 'system'): Promise<void> {
    setTheme(next)
    applyTheme(next)
    setBusy(true)
    try {
      await window.lexi.saveSettings({ appearance: { theme: next } })
      flash('外观已保存')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1 className="page-title">设置</h1>
      <p className="page-sub">配置一次，全局使用</p>

      <div className="card">
        <h3 className="card-h3">AI 配置</h3>
        <p className="section-note">选择服务商预设，填写 API Key 和模型名，点「测试连接」验证。配置后批改、讲解、练习全部直连所选服务商，Key 加密保存在本机数据库。</p>

        <div className="field">
          <label>服务商</label>
          <select value={aiPreset} onChange={(e) => void pickPreset(e.target.value)}>
            {Object.entries(AI_PRESETS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>接口地址 (Base URL)</label>
          <input
            type="text"
            value={aiBaseUrl}
            onChange={(e) => setAiBaseUrl(e.target.value)}
            placeholder="以 /v1 或 /v4 结尾，不含 /chat/completions"
          />
        </div>

        <div className="field">
          <label>API Key</label>
          <input
            type="password"
            value={aiKeyInput}
            onChange={(e) => setAiKeyInput(e.target.value)}
            placeholder={aiHas ? `已保存（${aiMasked}）—— 留空保持不变` : '仅保存在本机，请求直接发往所选服务商'}
          />
        </div>

        <div className="field">
          <label>模型名</label>
          <input
            type="text"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            placeholder="例如 deepseek-chat、glm-4-flash、qwen-plus"
          />
        </div>

        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={() => void runTest()}>
            测试连接
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => void saveAi()}>
            保存
          </button>
        </div>
        {testLine && <p className={'status-line ' + (testLine.ok ? 'status-ok' : 'status-err')}>{testLine.text}</p>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">学习计划</h3>
        <p className="section-note">听力、阅读、写作不由这里安排，你在「今日学习 → 添加任务」里自行决定。</p>

        <div className="field">
          <label>每日新词量</label>
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
          <label>复习强度</label>
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
        </div>

        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={() => void savePlan()}>
            保存
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">外观</h3>
        <div className="field">
          <label>主题</label>
          <select value={theme} onChange={(e) => void saveAppearance(e.target.value as 'light' | 'dark' | 'system')}>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
            <option value="system">跟随系统</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">关于</h3>
        <p className="section-note">
          LexiFlow v{about.appVersion} · Electron {about.electronVersion} · SQLite {about.sqliteVersion}
          <br />
          不是帮你记住英语单词，而是让你真正学会使用它们。
          <br />
          数据全部保存在本机；学习数据将来可与 Obsidian 插件「英语单词书」互通导入（M2 实现）。
        </p>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </section>
  )
}
