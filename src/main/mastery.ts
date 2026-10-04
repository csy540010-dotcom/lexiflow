import type { MasteryData } from '../shared/types'

export interface GradeScores {
  usage: number
  grammar: number
  collocation: number
  naturalness: number
}

function clamp(v: number, min = 0, max = 5): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * 掌握度自动变化规则（透明可解释，用户不手动评分）：
 * - 识别：每完成一次该词的批改练习 +1（做过的词脸熟）
 * - 理解：取历史最高与「词义使用+搭配均分」的较大值
 * - 使用：取历史最高与四维总均分的较大值
 * - 迁移：取历史最高与「词义使用分」的较大值（用得对 = 能迁移）
 */
export function applyGradeToMastery(prev: MasteryData, g: GradeScores): MasteryData {
  const avg = Math.round((g.usage + g.grammar + g.collocation + g.naturalness) / 4)
  const half = Math.ceil((g.usage + g.collocation) / 2)
  return {
    recognition: clamp((prev.recognition ?? 0) + 1),
    comprehension: clamp(Math.max(prev.comprehension ?? 0, half)),
    production: clamp(Math.max(prev.production ?? 0, avg)),
    transfer: clamp(Math.max(prev.transfer ?? 0, g.usage))
  }
}

export function masteryAverage(m: MasteryData): number {
  return (
    ((m.recognition ?? 0) + (m.comprehension ?? 0) + (m.production ?? 0) + (m.transfer ?? 0)) / 4
  )
}
