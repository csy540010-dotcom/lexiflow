import { CoverArtAuto, CoverArtById } from './CoverArt'

interface BookCoverProps {
  coverId?: string
  seed?: string
  size?: 'sm' | 'md'
}

/** 词书封面：使用封面库分配到的插画（无记录时按书名兜底），不含文字。 */
export default function BookCover({ coverId, seed = '', size = 'md' }: BookCoverProps): React.JSX.Element {
  return (
    <span className={'book-cover book-cover-' + size} aria-hidden="true">
      {coverId ? <CoverArtById id={coverId} /> : <CoverArtAuto seed={seed || 'book'} />}
      <span className="book-cover-spine" />
    </span>
  )
}
