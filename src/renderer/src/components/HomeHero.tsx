/** 今日学习页顶部问候横幅：SVG 山景插画 + 时段问候 + 日期 + 每日一句。 */

const QUOTES: Array<{ en: string; author: string }> = [
  { en: 'A little progress each day adds up to big results.', author: 'Unknown' },
  { en: 'Little by little, one travels far.', author: 'Proverb' },
  { en: 'Well begun is half done.', author: 'Proverb' }
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function greetingOf(hour: number): { en: string; zh: string; emoji: string } {
  if (hour >= 5 && hour < 12) return { en: 'Good morning!', zh: '今天也是进步美好的一天！', emoji: '☀️' }
  if (hour >= 12 && hour < 18) return { en: 'Good afternoon!', zh: '保持节奏，一点一点往前走。', emoji: '🌤️' }
  return { en: 'Good evening!', zh: '睡前再学一点点，明天见。', emoji: '🌙' }
}

function dateLine(now: Date): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAYS[now.getDay()]}`
}

function heroQuote(now: Date): { en: string; author: string } {
  const dayIndex = Math.floor(now.getTime() / 86_400_000)
  return QUOTES[dayIndex % QUOTES.length]
}

export default function HomeHero(): React.JSX.Element {
  const now = new Date()
  const greet = greetingOf(now.getHours())
  const quote = heroQuote(now)

  return (
    <div className="hero-card">
      <svg className="hero-svg" viewBox="0 0 760 190" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cfe3d8" />
            <stop offset="55%" stopColor="#edf2e3" />
            <stop offset="100%" stopColor="#f6f3ea" />
          </linearGradient>
        </defs>
        <rect width="760" height="190" fill="url(#heroSky)" />
        <circle cx="608" cy="56" r="52" fill="#f2d98c" opacity="0.22" />
        <circle cx="608" cy="56" r="32" fill="#f0d27a" opacity="0.85" />
        {/* 远山 */}
        <path
          d="M0 150 L80 88 L150 132 L235 72 L330 140 L420 94 L520 148 L618 98 L700 140 L760 116 L760 190 L0 190 Z"
          fill="#a3bcaa"
          opacity="0.55"
        />
        {/* 近山 */}
        <path
          d="M0 168 L120 112 L210 156 L320 106 L430 160 L540 120 L650 162 L760 134 L760 190 L0 190 Z"
          fill="#6f9578"
          opacity="0.8"
        />
        {/* 前景山丘 */}
        <path d="M0 182 L140 152 L300 178 L470 148 L620 176 L760 158 L760 190 L0 190 Z" fill="#427765" opacity="0.85" />
        {/* 树影 */}
        <g fill="#2f5a4b">
          <path d="M64 184 l9 -24 l9 24 z" />
          <path d="M92 184 l7 -18 l7 18 z" />
          <path d="M690 184 l9 -22 l9 22 z" />
          <path d="M716 184 l6 -15 l6 15 z" />
        </g>
      </svg>
      <div className="hero-text">
        <div className="hero-greeting-row">
          <h2 className="hero-greeting">
            {greet.en} <span className="hero-emoji">{greet.emoji}</span>
          </h2>
          <span className="hero-date">{dateLine(now)}</span>
        </div>
        <p className="hero-sub">{greet.zh}</p>
        <p className="hero-quote">
          {quote.en}
          <span className="hero-quote-author"> — {quote.author}</span>
        </p>
      </div>
    </div>
  )
}
