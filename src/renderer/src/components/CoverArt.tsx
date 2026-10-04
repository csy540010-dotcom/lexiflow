import { useId } from 'react'
import { hashStr } from '../lib/covers'
import { coverIdAt, COVER_LIBRARY_SIZE } from '../../../shared/types'

/**
 * 封面库：8 种矢量风景场景 × 4 种配色 = 32 款插画封面。
 * 全部离线绘制、任意尺寸清晰；书本/听力/今日横幅共用。
 */

interface Pal {
  sky1: string
  sky2: string
  far: string
  near: string
  deep: string
  accent: string
  light: string
}

const PALETTES: Pal[] = [
  { sky1: '#f7d9b8', sky2: '#f3ead8', far: '#b3b48e', near: '#6f9578', deep: '#427765', accent: '#f5c96b', light: '#fff7e8' }, // 晨光
  { sky1: '#bfe0f0', sky2: '#f3ead8', far: '#8fb2a0', near: '#4f8a6e', deep: '#2f5a4b', accent: '#f5d98a', light: '#ffffff' }, // 白昼
  { sky1: '#f6c98f', sky2: '#f3b26e', far: '#c98d5a', near: '#8f5a37', deep: '#5e3a24', accent: '#f2a35a', light: '#ffe9c9' }, // 黄昏
  { sky1: '#1e2f4d', sky2: '#3f5c78', far: '#3a4d68', near: '#26364f', deep: '#131e2f', accent: '#f4ecd0', light: '#cfe0f2' } // 夜色
]

const SCENE_NAMES = ['山湖', '松林', '星空', '海天', '花田', '沙漠', '雪峰', '几何']
const PALETTE_NAMES = ['晨光', '白昼', '黄昏', '夜色']

type SceneFn = (uid: string, p: Pal) => React.JSX.Element

function sceneLake(uid: string, p: Pal): React.JSX.Element {
  return (
    <>
      <defs>
        <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky1} />
          <stop offset="100%" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${uid}a)`} />
      <circle cx="72" cy="26" r="10" fill={p.accent} />
      <path d="M0 60 L22 32 L40 56 L58 28 L80 58 L100 42 L100 100 L0 100 Z" fill={p.far} />
      <path d="M0 76 L30 50 L55 76 L75 56 L100 78 L100 100 L0 100 Z" fill={p.near} />
      <rect y="86" width="100" height="14" fill={p.deep} opacity="0.85" />
      <path d="M30 92 L44 92 M56 95 L72 95 M16 97 L30 97" stroke={p.light} strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
    </>
  )
}

function sceneForest(uid: string, p: Pal): React.JSX.Element {
  return (
    <>
      <defs>
        <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky1} />
          <stop offset="100%" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${uid}a)`} />
      <circle cx="26" cy="24" r="11" fill={p.accent} opacity="0.95" />
      <g fill={p.deep}>
        <path d="M14 84 l11 -30 l11 30 z" />
        <path d="M38 88 l12 -36 l12 36 z" />
        <path d="M64 86 l10 -28 l10 28 z" />
        <path d="M84 90 l9 -24 l9 24 z" />
      </g>
      <g fill={p.near}>
        <path d="M4 90 l8 -20 l8 20 z" />
        <path d="M52 92 l9 -22 l9 22 z" />
      </g>
      <rect y="88" width="100" height="12" fill={p.deep} opacity="0.9" />
    </>
  )
}

function sceneNightSky(uid: string, p: Pal): React.JSX.Element {
  return (
    <>
      <defs>
        <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky1} />
          <stop offset="100%" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${uid}a)`} />
      <circle cx="70" cy="24" r="11" fill={p.light} />
      <circle cx="65" cy="21" r="10" fill={p.sky1} opacity="0.8" />
      <g fill={p.light}>
        <circle cx="20" cy="16" r="1.3" />
        <circle cx="38" cy="28" r="1" />
        <circle cx="88" cy="44" r="1.2" />
        <circle cx="12" cy="42" r="1" />
        <circle cx="54" cy="12" r="1.1" />
        <circle cx="80" cy="60" r="0.9" />
      </g>
      <path d="M0 74 L24 50 L46 72 L66 52 L88 72 L100 62 L100 100 L0 100 Z" fill={p.deep} />
    </>
  )
}

function sceneSea(uid: string, p: Pal): React.JSX.Element {
  return (
    <>
      <defs>
        <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky1} />
          <stop offset="100%" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${uid}a)`} />
      <circle cx="70" cy="30" r="9" fill={p.accent} />
      <rect y="62" width="100" height="38" fill={p.near} opacity="0.9" />
      <path d="M0 66 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0" stroke={p.light} strokeWidth="2" fill="none" opacity="0.85" />
      <path d="M0 78 q12 -4 24 0 t24 0 t24 0 t28 0" stroke={p.light} strokeWidth="2" fill="none" opacity="0.6" />
      <path d="M44 62 l0 -20 l14 20 z" fill={p.light} />
      <rect x="42" y="61" width="18" height="3" rx="1.5" fill={p.deep} />
    </>
  )
}

function sceneFlower(uid: string, p: Pal): React.JSX.Element {
  return (
    <>
      <defs>
        <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky1} />
          <stop offset="100%" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${uid}a)`} />
      <path d="M0 66 Q30 56 55 66 T100 62 L100 100 L0 100 Z" fill={p.far} />
      <path d="M0 78 Q40 68 100 78 L100 100 L0 100 Z" fill={p.near} />
      <g>
        <circle cx="22" cy="70" r="4" fill={p.accent} />
        <circle cx="40" cy="76" r="3.4" fill={p.light} />
        <circle cx="60" cy="70" r="4.2" fill={p.accent} />
        <circle cx="78" cy="76" r="3.6" fill={p.deep} opacity="0.6" />
        <circle cx="90" cy="70" r="3" fill={p.light} />
        <circle cx="12" cy="80" r="3" fill={p.accent} />
      </g>
      <g fill={p.light} opacity="0.85">
        <circle cx="30" cy="26" r="2" />
        <circle cx="52" cy="38" r="1.6" />
        <circle cx="70" cy="22" r="2.2" />
      </g>
    </>
  )
}

function sceneDesert(uid: string, p: Pal): React.JSX.Element {
  return (
    <>
      <defs>
        <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky1} />
          <stop offset="100%" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${uid}a)`} />
      <circle cx="52" cy="44" r="14" fill={p.accent} />
      <circle cx="52" cy="44" r="19" fill={p.accent} opacity="0.3" />
      <path d="M0 66 Q24 56 46 66 T100 62 L100 100 L0 100 Z" fill={p.far} />
      <path d="M0 80 Q36 68 70 80 T100 76 L100 100 L0 100 Z" fill={p.near} />
      <path d="M18 60 l3 -14 l3 14 z" fill={p.deep} opacity="0.85" />
    </>
  )
}

function sceneSnow(uid: string, p: Pal): React.JSX.Element {
  return (
    <>
      <defs>
        <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky1} />
          <stop offset="100%" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${uid}a)`} />
      <circle cx="24" cy="22" r="8" fill={p.light} opacity="0.9" />
      <path d="M0 78 L28 40 L50 74 L70 46 L100 82 L100 100 L0 100 Z" fill={p.far} />
      <path d="M28 40 L36 52 L22 52 Z" fill={p.light} />
      <path d="M70 46 L78 58 L62 58 Z" fill={p.light} />
      <g fill={p.light} opacity="0.9">
        <circle cx="40" cy="24" r="1.4" />
        <circle cx="62" cy="16" r="1.2" />
        <circle cx="82" cy="30" r="1.4" />
        <circle cx="16" cy="42" r="1.2" />
      </g>
    </>
  )
}

function sceneAbstract(uid: string, p: Pal): React.JSX.Element {
  return (
    <>
      <rect width="100" height="100" fill={p.sky2} />
      <circle cx="34" cy="38" r="24" fill={p.deep} opacity="0.85" />
      <circle cx="64" cy="58" r="22" fill={p.accent} opacity="0.65" />
      <circle cx="72" cy="30" r="14" fill={p.light} opacity="0.9" />
      <rect x="14" y="66" width="34" height="20" rx="10" fill={p.near} opacity="0.8" />
      <path d="M0 100 L34 74 L62 92 L100 70 L100 100 Z" fill={p.far} opacity="0.7" />
    </>
  )
}

const SCENES: SceneFn[] = [sceneLake, sceneForest, sceneNightSky, sceneSea, sceneFlower, sceneDesert, sceneSnow, sceneAbstract]

/** 封面库目录（选择器用）。 */
export const COVER_LIBRARY: Array<{ id: string; label: string }> = (() => {
  const out: Array<{ id: string; label: string }> = []
  for (let s = 0; s < SCENES.length; s++) {
    for (let p = 0; p < PALETTES.length; p++) {
      out.push({ id: coverIdAt(s * PALETTES.length + p), label: SCENE_NAMES[s] + '·' + PALETTE_NAMES[p] })
    }
  }
  return out.slice(0, COVER_LIBRARY_SIZE)
})()

function renderById(id: string, uid: string): React.JSX.Element {
  const n = Number(String(id).replace(/\D/g, '')) || 0
  const sceneIdx = Math.min(SCENES.length - 1, Math.floor(n / PALETTES.length))
  const palIdx = n % PALETTES.length
  return SCENES[sceneIdx](uid, PALETTES[palIdx])
}

/** 指定封面库 ID 渲染。 */
export function CoverArtById({ id }: { id: string }): React.JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg className="cover-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {renderById(id, uid)}
    </svg>
  )
}

/** 无封面记录时按种子兜底（老数据容错）。 */
export function CoverArtAuto({ seed }: { seed: string }): React.JSX.Element {
  return <CoverArtById id={coverIdAt(hashStr(seed || 'x'))} />
}

/** 今日横幅封面：按「时段挑场景池 + 日期轮换」——一天一换，且早/中/午/晚各不同。 */
export function heroCoverId(now: Date): string {
  const h = now.getHours()
  const day = Math.floor(now.getTime() / 86_400_000)
  let scenes: number[]
  let palIdx: number
  if (h >= 5 && h < 11) {
    scenes = [0, 1, 4]
    palIdx = 0 // 晨光
  } else if (h >= 11 && h < 14) {
    scenes = [3, 5, 0]
    palIdx = 1 // 白昼
  } else if (h >= 14 && h < 18) {
    scenes = [0, 4, 3]
    palIdx = 1
  } else if (h >= 18 && h < 21) {
    scenes = [5, 0, 6]
    palIdx = 2 // 黄昏
  } else {
    scenes = [2, 6]
    palIdx = 3 // 夜色
  }
  return coverIdAt(scenes[day % scenes.length] * PALETTES.length + palIdx)
}
