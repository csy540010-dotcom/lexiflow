import { coverBackground } from '../lib/covers'

interface BookCoverProps {
  name: string
  size?: 'sm' | 'md'
}

/** 自动生成的词书封面：按书名哈希分配专属配色，无需手动设置。 */
export default function BookCover({ name, size = 'md' }: BookCoverProps): React.JSX.Element {
  const initial = (name.trim()[0] ?? '书').toUpperCase()
  return (
    <span className={'book-cover book-cover-' + size} style={{ background: coverBackground(name) }} aria-hidden="true">
      <span className="book-cover-spine" />
      <span className="book-cover-initial">{initial}</span>
    </span>
  )
}
