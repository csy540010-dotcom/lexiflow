import { AI_PRESETS, isPresetId } from '../shared/ai-presets'

export interface AiConfig {
  preset: string
  baseUrl: string
  apiKey: string
  model: string
}

export function normalizeAi(raw: Partial<AiConfig> | undefined): AiConfig {
  const preset = raw && typeof raw.preset === 'string' && isPresetId(raw.preset) ? raw.preset : 'custom'
  return {
    preset,
    baseUrl: String(raw?.baseUrl ?? '').trim().replace(/\/+$/, ''),
    apiKey: String(raw?.apiKey ?? '').trim(),
    model: String(raw?.model ?? '').trim()
  }
}

export function aiConfigProblem(cfg: AiConfig): string | null {
  if (!cfg.baseUrl || !cfg.model) {
    return '请在「设置 → AI 配置」中补全接口地址和模型名。'
  }
  return null
}

function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<think>[\s\S]*$/i, '')
    .trim()
}

export async function chatCompletion(
  cfg: AiConfig,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: { maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 1024
  const timeoutMs = opts.timeoutMs ?? 60_000

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    stream: false,
    max_tokens: maxTokens
  }
  // Qwen3 是混合推理模型：思考内容不影响结果，但会显著增加等待时间。
  if (/qwen3/i.test(cfg.model)) body.enable_thinking = false

  let res: Response
  try {
    res = await fetch(cfg.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/timeout|abort/i.test(msg)) throw new Error('AI 接口请求超时，请检查网络或稍后再试。')
    throw new Error('无法连接 AI 接口：' + msg)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const snippet = text.slice(0, 300)
    throw new Error(`AI 接口返回 ${res.status}：${snippet || res.statusText}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>
  }
  const content = data.choices?.[0]?.message?.content
  const reply = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => p.text ?? '').join('') : ''
  if (!reply.trim()) throw new Error('AI 返回了空内容，请检查模型名是否正确。')
  return stripThinking(reply)
}

export function presetDefaults(preset: string): { baseUrl: string; model: string } {
  const p = isPresetId(preset) ? AI_PRESETS[preset] : AI_PRESETS.custom
  return { baseUrl: p.baseUrl, model: p.model }
}
