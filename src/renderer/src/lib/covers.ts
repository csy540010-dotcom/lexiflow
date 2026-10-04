/** 共享封面配色：按名称/标题哈希稳定分配，保证每次添加都自动生成专属封面。 */

export const COVER_PALETTES: Array<[string, string]> = [
  ['#427765', '#2f5a4b'], // 深绿
  ['#3b6ea5', '#274b73'], // 藏蓝
  ['#a56a3b', '#6e4423'], // 暖棕
  ['#7a4fa3', '#4d2f6e'], // 紫
  ['#a54f6a', '#6e2f44'], // 玫红
  ['#4f8fa5', '#2f5e6e'], // 青
  ['#8fa54f', '#5e6e2f'], // 橄榄
  ['#a58b4f', '#6e5a2f'] // 金
]

export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function paletteOf(seed: string): [string, string] {
  return COVER_PALETTES[hashStr(seed) % COVER_PALETTES.length]
}

export function coverBackground(seed: string): string {
  const [a, b] = paletteOf(seed)
  return `linear-gradient(135deg, ${a}, ${b})`
}

/** 装饰波形：按种子生成稳定高度序列。 */
export function waveHeights(seed: string, count = 56): number[] {
  let h = hashStr(seed) || 1
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) | 0
    out.push(4 + (Math.abs(h) % 16))
  }
  return out
}
