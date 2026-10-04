import { useId } from 'react'
import { hashStr } from '../lib/covers'

/**
 * 插画封面引擎：按种子哈希分配 8 种矢量风景场景。
 * 全部用 SVG 绘制（离线可用、任意尺寸清晰），用于词书封面与听力封面。
 */

type SceneFn = (uid: string) => React.JSX.Element

/* 1. 晨山湖 */
const sceneMountainLake: SceneFn = (uid) => (
  <>
    <defs>
      <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#bfe0f0" />
        <stop offset="100%" stopColor="#f3ead8" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${uid}a)`} />
    <circle cx="72" cy="26" r="10" fill="#f5d98a" />
    <path d="M0 60 L22 32 L40 56 L58 28 L80 58 L100 42 L100 100 L0 100 Z" fill="#7ba58c" />
    <path d="M0 76 L30 50 L55 76 L75 56 L100 78 L100 100 L0 100 Z" fill="#4f8a6e" />
    <rect y="86" width="100" height="14" fill="#6fb3c9" />
    <path d="M30 92 L44 92 M56 95 L72 95 M16 97 L30 97" stroke="#dff0f6" strokeWidth="1.6" strokeLinecap="round" />
  </>
)

/* 2. 松林晨光 */
const sceneForest: SceneFn = (uid) => (
  <>
    <defs>
      <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#dcecd8" />
        <stop offset="100%" stopColor="#f6f3ea" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${uid}a)`} />
    <circle cx="26" cy="24" r="11" fill="#f2d98c" opacity="0.95" />
    <g fill="#2f5a4b">
      <path d="M14 84 l11 -30 l11 30 z" />
      <path d="M38 88 l12 -36 l12 36 z" />
      <path d="M64 86 l10 -28 l10 28 z" />
      <path d="M84 90 l9 -24 l9 24 z" />
    </g>
    <g fill="#4f8a6e">
      <path d="M4 90 l8 -20 l8 20 z" />
      <path d="M52 92 l9 -22 l9 22 z" />
    </g>
    <rect y="88" width="100" height="12" fill="#427765" />
  </>
)

/* 3. 星空夜岭 */
const sceneNight: SceneFn = (uid) => (
  <>
    <defs>
      <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e2f4d" />
        <stop offset="100%" stopColor="#3f5c78" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${uid}a)`} />
    <circle cx="70" cy="24" r="11" fill="#f4ecd0" />
    <circle cx="65" cy="21" r="10" fill="#1e2f4d" opacity="0.75" />
    <g fill="#f4ecd0">
      <circle cx="20" cy="16" r="1.3" />
      <circle cx="38" cy="28" r="1" />
      <circle cx="88" cy="44" r="1.2" />
      <circle cx="12" cy="42" r="1" />
      <circle cx="54" cy="12" r="1.1" />
      <circle cx="80" cy="60" r="0.9" />
    </g>
    <path d="M0 74 L24 50 L46 72 L66 52 L88 72 L100 62 L100 100 L0 100 Z" fill="#16233a" />
  </>
)

/* 4. 海天白帆 */
const sceneSea: SceneFn = (uid) => (
  <>
    <defs>
      <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cfe8f2" />
        <stop offset="100%" stopColor="#f7f0dd" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${uid}a)`} />
    <circle cx="70" cy="30" r="9" fill="#f5c96b" />
    <rect y="62" width="100" height="38" fill="#5fa8c4" />
    <path d="M0 66 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0" stroke="#dff0f6" strokeWidth="2" fill="none" />
    <path d="M0 78 q12 -4 24 0 t24 0 t24 0 t28 0" stroke="#bfe0ee" strokeWidth="2" fill="none" />
    <path d="M44 62 l0 -20 l14 20 z" fill="#ffffff" />
    <rect x="42" y="61" width="18" height="3" rx="1.5" fill="#3f5c52" />
  </>
)

/* 5. 花田春风 */
const sceneFlower: SceneFn = (uid) => (
  <>
    <defs>
      <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e4edf0" />
        <stop offset="100%" stopColor="#f8f2e2" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${uid}a)`} />
    <path d="M0 66 Q30 56 55 66 T100 62 L100 100 L0 100 Z" fill="#8fb98a" />
    <path d="M0 78 Q40 68 100 78 L100 100 L0 100 Z" fill="#6aa06b" />
    <g>
      <circle cx="22" cy="70" r="4" fill="#e9a3b8" />
      <circle cx="40" cy="76" r="3.4" fill="#f0d27a" />
      <circle cx="60" cy="70" r="4.2" fill="#e9a3b8" />
      <circle cx="78" cy="76" r="3.6" fill="#c98bd6" />
      <circle cx="90" cy="70" r="3" fill="#f0d27a" />
      <circle cx="12" cy="80" r="3" fill="#c98bd6" />
    </g>
    <g fill="#ffffff" opacity="0.85">
      <circle cx="30" cy="26" r="2" />
      <circle cx="52" cy="38" r="1.6" />
      <circle cx="70" cy="22" r="2.2" />
    </g>
  </>
)

/* 6. 沙漠日落 */
const sceneDesert: SceneFn = (uid) => (
  <>
    <defs>
      <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f6d7a8" />
        <stop offset="100%" stopColor="#f3b26e" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${uid}a)`} />
    <circle cx="52" cy="44" r="14" fill="#f2a35a" />
    <circle cx="52" cy="44" r="19" fill="#f2a35a" opacity="0.3" />
    <path d="M0 66 Q24 56 46 66 T100 62 L100 100 L0 100 Z" fill="#d99a5b" />
    <path d="M0 80 Q36 68 70 80 T100 76 L100 100 L0 100 Z" fill="#b87a45" />
    <path d="M18 60 l3 -14 l3 14 z" fill="#7d5230" opacity="0.8" />
  </>
)

/* 7. 雪峰晴空 */
const sceneSnow: SceneFn = (uid) => (
  <>
    <defs>
      <linearGradient id={uid + 'a'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cfe4f2" />
        <stop offset="100%" stopColor="#f2f6f8" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${uid}a)`} />
    <circle cx="24" cy="22" r="8" fill="#ffffff" opacity="0.9" />
    <path d="M0 78 L28 40 L50 74 L70 46 L100 82 L100 100 L0 100 Z" fill="#9db8cc" />
    <path d="M28 40 L36 52 L22 52 Z" fill="#ffffff" />
    <path d="M70 46 L78 58 L62 58 Z" fill="#ffffff" />
    <g fill="#ffffff" opacity="0.9">
      <circle cx="40" cy="24" r="1.4" />
      <circle cx="62" cy="16" r="1.2" />
      <circle cx="82" cy="30" r="1.4" />
      <circle cx="16" cy="42" r="1.2" />
    </g>
  </>
)

/* 8. 抽象几何 */
const sceneAbstract: SceneFn = () => (
  <>
    <rect width="100" height="100" fill="#f6f3ea" />
    <circle cx="34" cy="38" r="24" fill="#427765" opacity="0.85" />
    <circle cx="64" cy="58" r="22" fill="#c98bd6" opacity="0.65" />
    <circle cx="72" cy="30" r="14" fill="#f0d27a" opacity="0.9" />
    <rect x="14" y="66" width="34" height="20" rx="10" fill="#5fa8c4" opacity="0.75" />
    <path d="M0 100 L34 74 L62 92 L100 70 L100 100 Z" fill="#2f5a4b" opacity="0.55" />
  </>
)

const SCENES: SceneFn[] = [
  sceneMountainLake,
  sceneForest,
  sceneNight,
  sceneSea,
  sceneFlower,
  sceneDesert,
  sceneSnow,
  sceneAbstract
]

export default function CoverArt({ seed }: { seed: string }): React.JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const scene = SCENES[hashStr(seed || 'x') % SCENES.length]
  return (
    <svg className="cover-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {scene(uid)}
    </svg>
  )
}
