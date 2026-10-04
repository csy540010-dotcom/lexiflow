import CoverArt from './CoverArt'

interface BookCoverProps {
  name: string
  size?: 'sm' | 'md'
}

/** 自动生成的词书封面：按书名哈希匹配矢量风景插画，无需手动设置。 */
export default function BookCover({ name, size = 'md' }: BookCoverProps): React.JSX.Element {
  const initial = (name.trim()[0] ?? '书').toUpperCase()
  return (
    <span className={'book-cover book-cover-' + size} aria-hidden="true">
      <CoverArt seed={name} />
      <span className="book-cover-spine" />
      <span className="book-cover-initial">{initial}</span>
    </span>
  )
}
