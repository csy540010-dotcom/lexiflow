import type { GradeScores } from './mastery'
import type { McqQuestion } from '../shared/types'

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

/** 造句提示生成提示词：与内置提示同风格（中文场景句中嵌英文词）。 */
export function buildGenPromptsPrompt(word: string, meaning: string): string {
  return [
    '为英语单词「' + word + '」生成 3 条中文造句提示。',
    '每条是一个中文场景句子，句中把英文单词「' + word + '」原样嵌进去（像 "雨后，我总能闻到一股清新的 petrichor 气味。" 这样），供学习者照着写英文句子。',
    '难度参考四六级，场景要具体、日常、可写。',
    meaning ? '词典释义：' + meaning : '',
    '只输出一个 JSON 数组，不要代码块，不要其他文字：["提示1", "提示2", "提示3"]'
  ]
    .filter(Boolean)
    .join('\n')
}

/** 从模型回复中提取字符串数组（容忍围栏与杂文；失败再按编号行兜底）。 */
export function extractPrompts(text: string): string[] {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown
      if (Array.isArray(arr)) {
        const list = arr.map((x) => String(x ?? '').trim()).filter((x) => x.length > 3)
        if (list.length > 0) return list.slice(0, 5)
      }
    } catch {
      /* 落到行解析 */
    }
  }
  return cleaned
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[.、)．]?\s*/, '').trim())
    .filter((line) => line.length > 5)
    .slice(0, 3)
}

/** 专项练习出题提示词：选择题三类（语境选词 / 搭配辨析 / 近义词辨析）。 */
export function buildMcqPrompt(word: string, meaning: string, type: 'context' | 'collocation' | 'synonym'): string {
  const specs: Record<string, string> = {
    context: `出「语境选词」题：写一个地道的英文例句，把其中的 ${word} 挖掉用 ____ 代替；四个选项为 ${word} 和三个词性与它相同、容易混淆的英语词。学习者靠上下文选词。题干句子除挖空处外，不得出现 ${word} 这个词本身。`,
    collocation: `出「搭配辨析」题：写一个含空格的英文短句，空格处应填入与 ${word} 相关的地道搭配（介词、固定短语等）；四个选项里只有一个地道正确，其余是学习者常犯的搭配错误。题干句子除挖空处外，不得出现 ${word} 或其词形变化。`,
    synonym: `出「近义词辨析」题：写一个英文短句挖空，四个选项为 ${word} 和三个语义相近的词；只有 ${word} 符合该句语境（可结合中文释义设计迷惑项）。题干句子除挖空处外，不得出现 ${word} 或其他选项词。释义：${meaning}`
  }
  return [
    '你是英语老师，面向中国学习者出专项练习题。',
    specs[type],
    '只输出一个 JSON 对象（不要代码块，不要其他文字）：',
    '{"stem":"题干英文句子（含 ____）","options":["A选项","B选项","C选项","D选项"],"answer":0,"explanation":"中文解析：为什么选它，其他为什么不地道"}',
    'answer 为正确选项的下标（0-3），正确答案的选项内容必须是 ' + word + ' 或对应的地道搭配。',
    '四个选项顺序打乱，不要有规律。'
  ].join('\n')
}

/** 造句类练习任务说明提示词（中译英 / 自由表达）。 */
export function buildSentenceTaskPrompt(word: string, meaning: string, type: 'translate' | 'free'): string {
  if (type === 'translate') {
    return [
      `为英语单词「${word}」出一道中译英练习：写一个自然的中文句子，句中把这个英文单词原样嵌在中文里（像 "研究人员提醒大家，不要因为可爱的视频而冲动 adopt 一只宠物。" 这样），让学习者把它翻译成地道英文。`,
      meaning ? `词典释义：${meaning}` : '',
      '难度参考四六级。只输出这一句中文，不要解释。'
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    `为英语单词「${word}」出一个自由表达练习：给学习者一个具体、日常的场景或话题，要求他们用这个词围绕场景写 1-2 句英文。`,
    '场景要能自然用上这个词。只输出场景描述这一句话（中文），例如："描述一次你完全被一本书或一部电影吸引住的经历，用 absorb 造句。"'
  ].join('\n')
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

/** 通用 JSON 对象提取：容忍 ```json 围栏与前后杂文。 */
export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown
  } catch {
    return null
  }
}

/** 从模型回复中提取批改结果 JSON。 */
export function extractJson(text: string): GradeResult | null {
  const raw = extractJsonObject(text) as Partial<GradeResult> | null
  if (!raw) return null
  try {
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

/** 选择题 JSON 解析（语境选词 / 搭配辨析 / 近义词辨析共用）。 */
export function parseMcq(text: string): McqQuestion | null {
  const obj = extractJsonObject(text)
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const o = obj as Record<string, unknown>
  const stem = typeof o.stem === 'string' ? o.stem.trim() : ''
  const options = Array.isArray(o.options) ? o.options.map((x) => String(x ?? '').trim()) : []
  const answer = Number(o.answer)
  if (!stem || options.length !== 4 || options.some((x) => !x)) return null
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null
  return {
    stem,
    options,
    answer,
    explanation: typeof o.explanation === 'string' ? o.explanation.trim() : ''
  }
}
