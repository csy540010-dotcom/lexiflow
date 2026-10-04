export interface AiPreset {
  name: string
  baseUrl: string
  model: string
}

export const AI_PRESETS: Record<string, AiPreset> = {
  zhipu: { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  qwen: { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  moonshot: { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  siliconflow: { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3-8B' },
  custom: { name: 'OpenAI 兼容（自定义）', baseUrl: '', model: '' }
}

export type AiPresetId = keyof typeof AI_PRESETS

export function isPresetId(value: string): value is AiPresetId {
  return Object.prototype.hasOwnProperty.call(AI_PRESETS, value)
}
