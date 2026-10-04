import { useState } from 'react'

interface CollectionPickerProps {
  current: string
  collections: string[]
  onPick: (name: string) => void
  onClose: () => void
}

/** 集合归类的界面：点现有集合直接归入，或输入新名字创建集合，也可一键移到「未分类」。 */
export default function CollectionPicker({ current, collections, onPick, onClose }: CollectionPickerProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const all = [...new Set(collections)]

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="card-h3">归类到集合</h3>
        <p className="section-note">
          点一个现有集合直接归入；或输入新名字创建集合（同名音频自动归到一组，播放列表里会分组显示）。
        </p>
        <div className="chips" style={{ marginBottom: 16 }}>
          <button className={'chip' + (!current ? ' chip-active' : '')} onClick={() => onPick('')}>
            未分类
          </button>
          {all.map((c) => (
            <button key={c} className={'chip' + (c === current ? ' chip-active' : '')} onClick={() => onPick(c)}>
              {c}
            </button>
          ))}
          {all.length === 0 && <span className="hint">还没有集合——在下面新建一个吧</span>}
        </div>
        <div className="field">
          <label>新建集合</label>
          <div className="collection-new-row">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="例如：六级真题 / TED / 新概念"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) onPick(draft.trim())
              }}
              autoFocus
            />
            <button className="btn" disabled={!draft.trim()} onClick={() => onPick(draft.trim())}>
              新建并归类
            </button>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
