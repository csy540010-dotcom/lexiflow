import { COVER_LIBRARY, CoverArtById } from './CoverArt'

interface CoverPickerProps {
  title: string
  currentId?: string
  onPick: (id: string) => void
  onUpload?: () => void
  onClose: () => void
}

/** 封面库选择器：从 32 款内置插画中挑一款，也可上传自己的图片（传入 onUpload 时）。 */
export default function CoverPicker({ title, currentId, onPick, onUpload, onClose }: CoverPickerProps): React.JSX.Element {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-wide" style={{ width: 'min(640px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="card-h3">{title}</h3>
        <p className="section-note">从封面库挑选一款（{COVER_LIBRARY.length} 款离线插画，每款都不一样）。</p>
        <div className="cover-picker-grid">
          {COVER_LIBRARY.map((c) => (
            <button
              key={c.id}
              title={c.label}
              className={'cover-pick' + (c.id === currentId ? ' active' : '')}
              onClick={() => onPick(c.id)}
            >
              <CoverArtById id={c.id} />
            </button>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 14 }}>
          {onUpload && (
            <button className="btn btn-ghost" onClick={onUpload}>
              上传图片
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
