import type { GradeScores } from './mastery'

/** AI 讲解提示词：核心含义 + 常用于 + 例句，简洁中文。 */
export function buildExplainPrompt(word: string, phonetic: string, meaning: string): string {
  return [
    '你是耐心的英语老师，面向中国学习者。讲解单词「' + word + '」。',
    phonetic ? '音标：' + phonetic : '',
    meaning ? '词典释义：' + meaning : '',
    '请用简洁中文输出以下四部分，不要输出其他内容：',
    '1. 核心含义：1-2 句话说清这个词让人联想到什么。',
    '2. 常用于：3-4 个典型使用场景（短语列出）。',
    '3. 例句：2 个地道英文例句，每句后面附中文翻译。',
    '4. 搭配：2-3 个常见搭配（英文短语 + 中文说明）。'
  ]
    .filter(Boolean)
    .join('\n')
}

export interface GradeResult {
  scores: GradeScores
  revised: string
  issues: Array<{ original: string; why: string; fix: string }>
  comment: string
}

/** 批改提示词：迁移自插件造句批改，扩展为四维评分 JSON。 */
export function buildGradePrompt(word: string, sentence: string): string {
  return [
    '英语学习批改任务：学习者正在练习使用单词「' + word + '」。下面是学习者写的英文句子或短段落。',
    '请逐项检查并只输出一个 JSON 对象（不要输出 JSON 以外的任何文字，不要用代码块包裹）：',
    '{',
    '  "scores": { "usage": 1-5, "grammar": 1-5, "collocation": 1-5, "naturalness": 1-5 },',
    '  "issues": [ { "original": "错误原文片段", "why": "为什么错（中文）", "fix": "建议怎么改" } ],',
    '  "revised": "修改后的完整表达",',
    '  "comment": "一两句中文总评"',
    '}',
    '四个维度含义：usage=词义使用是否准确（这个词用在这里对不对）；grammar=语法；collocation=搭配是否地道；naturalness=整体自然度。',
    '没有明显问题时 issues 为空数组。评分标准：5=无可挑剔，4=良好，3=能用但有明显问题，2=错误较多，1=基本不可用。轻微瑕疵不扣分。',
    '比较级可以依靠上下文，不要求显式比较对象；意译合理即可，不要求逐字对应。'
  ].join('\n') + '\n\n学习者写的句子：\n' + sentence
}

/** 从模型回复中提取 JSON（容忍 ```json 围栏与前后杂文）。 */
export function extractJson(text: string): GradeResult | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1)) as Partial<GradeResult>
    const s = raw.scores ?? ({} as Partial<GradeScores>)
    const clamp5 = (v: unknown): number => Math.min(5, Math.max(1, Math.round(Number(v) || 3)))
    if (!Array.isArray(raw.issues)) return null
    return {
      scores: {
        usage: clamp5(s.usage),
        grammar: clamp5(s.grammar),
        collocation: clamp5(s.collocation),
        naturalness: clamp5(s.naturalness)
      },
      revised: String(raw.revised ?? ''),
      issues: raw.issues.slice(0, 10).map((i) => ({
        original: String(i?.original ?? ''),
        why: String(i?.why ?? ''),
        fix: String(i?.fix ?? '')
      })),
      comment: String(raw.comment ?? '')
    }
  } catch {
    return null
  }
}
