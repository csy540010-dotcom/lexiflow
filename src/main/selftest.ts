import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings, SettingsPatch, AiTestResult } from '../shared/types'

interface SelfTestHooks {
  loadSettings: () => AppSettings
  saveSettingsPatch: (patch: SettingsPatch) => AppSettings
  testAi: (cfg?: Partial<{ preset: string; baseUrl: string; apiKey: string; model: string }>) => Promise<AiTestResult>
  saveAiKey: (plain: string) => void
  storedKey: () => string
}

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('自检失败：' + label)
  console.log('[lexiflow] selftest ✓ ' + label)
}

export async function runSelfTest(win: BrowserWindow, hooks: SelfTestHooks): Promise<void> {
  try {
    // 1. 设置读写回环
    hooks.saveSettingsPatch({ plan: { dailyNew: 25 }, appearance: { theme: 'dark' } })
    let s = hooks.loadSettings()
    assert(s.plan.dailyNew === 25, '设置写入/读取（plan.dailyNew=25）')
    assert(s.appearance.theme === 'dark', '设置写入/读取（theme=dark）')

    // 2. Key 加密回环
    hooks.saveAiKey('sk-selftest-1234567890')
    assert(hooks.storedKey() === 'sk-selftest-1234567890', 'API Key 加密存储/解密回环')
    s = hooks.loadSettings()
    assert(s.ai.hasKey && s.ai.keyMasked.endsWith('7890'), 'Key 掩码（' + s.ai.keyMasked + '）')

    // 3. 配置不完整时测试连接应给出中文引导（不打网络）
    const bad = await hooks.testAi({ preset: 'custom', baseUrl: '', model: '' })
    assert(!bad.ok && /补全/.test(bad.error ?? ''), '未配置时测试连接返回引导文案')

    // 4. 恢复默认，避免自检数据残留
    hooks.saveAiKey('')
    hooks.saveSettingsPatch({ plan: { dailyNew: 20 }, appearance: { theme: 'light' } })
    s = hooks.loadSettings()
    assert(s.plan.dailyNew === 20 && !s.ai.hasKey, '自检数据已清理')

    // 5. 截图：今日学习页 + 设置页
    const dir = path.join(process.cwd(), '.selftest')
    fs.mkdirSync(dir, { recursive: true })
    await new Promise((r) => setTimeout(r, 800))
    const todayShot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(dir, 'm1-today.png'), todayShot.toPNG())
    await win.webContents.executeJavaScript("location.hash = '#/settings'")
    await new Promise((r) => setTimeout(r, 600))
    const shot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(dir, 'm1-settings.png'), shot.toPNG())
    console.log('[lexiflow] selftest screenshots saved')

    console.log('[lexiflow] selftest OK')
    setTimeout(() => process.exit(0), 200)
  } catch (err) {
    console.error('[lexiflow] selftest FAILED:', err instanceof Error ? err.message : err)
    setTimeout(() => process.exit(1), 200)
  }
}
