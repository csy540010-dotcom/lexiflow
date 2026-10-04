import { CoverArtById, heroCoverId } from './CoverArt'

/** 今日学习页顶部问候横幅：每天换一张插画（按时段主题），问候语随时段变化。 */

const QUOTES: Array<{ en: string; author: string }> = [
  { en: 'A little progress each day adds up to big results.', author: 'Unknown' },
  { en: 'Little by little, one travels far.', author: 'Proverb' },
  { en: 'Well begun is half done.', author: 'Proverb' }
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

interface Greeting {
  en: string
  zh: string
  emoji: string
}

function greetingOf(hour: number): Greeting {
  if (hour >= 5 && hour < 11) return { en: 'Good morning!', zh: '早上好，今天也是进步美好的一天！', emoji: '☀️' }
  if (hour >= 11 && hour < 14) return { en: 'Good afternoon!', zh: '中午好，学一会儿也别忘了休息。', emoji: '🌤️' }
  if (hour >= 14 && hour < 18) return { en: 'Good afternoon!', zh: '下午好，保持节奏，一点一点往前走。', emoji: '🌿' }
  if (hour >= 18 && hour < 21) return { en: 'Good evening!', zh: '晚上好，把今天的学习收个尾。', emoji: '🌆' }
  return { en: 'Good evening!', zh: '晚上好，睡前再学一点点，明天见。', emoji: '🌙' }
}

function dateLine(now: Date): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAYS[now.getDay()]}`
}

export default function HomeHero(): React.JSX.Element {
  const now = new Date()
  const greet = greetingOf(now.getHours())
  const quote = QUOTES[Math.floor(now.getTime() / 86_400_000) % QUOTES.length]

  return (
    <div className="hero-card">
      <div className="hero-art" aria-hidden="true">
        <CoverArtById id={heroCoverId(now)} />
      </div>
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
