import { useCallback, useEffect, useState } from 'react'
import type { ArticleItem, DictLookup } from '../../../shared/types'

interface PopupState {
  word: string
  lookup: DictLookup
  x: number
  y: number
}

const WORD_CHAR = /[A-Za-z''-]/

function expandWord(text: string, offset: number): string {
  let start = offset
  let end = offset
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  while (end < text.length && WORD_CHAR.test(text[end])) end++
  return text.slice(start, end).replace(/^[''-]+|[''-]+$/g, '')
}

export default function Reading(): React.JSX.Element {
  const [articles, setArticles] = useState<ArticleItem[]>([])
  const [selected, setSelected] = useState<ArticleItem | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [toast, setToast] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteContent, setPasteContent] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setArticles(await window.lexi.listArticles())
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2200)
  }

  async function openArticle(article: ArticleItem): Promise<void> {
    setSelected(article)
    setPopup(null)
    await window.lexi.logReading(article.id)
    void reload()
  }

  async function pasteArticle(): Promise<void> {
    if (!pasteContent.trim()) return
    setBusy(true)
    try {
      const article = await window.lexi.createArticle(pasteTitle, pasteContent, 'paste')
      setShowPaste(false)
      setPasteTitle('')
      setPasteContent('')
      await reload()
      await openArticle(article)
      flash('文章已导入')
    } finally {
      setBusy(false)
    }
  }

  async function importFile(): Promise<void> {
    const article = await window.lexi.importArticleFile()
    if (article) {
      await reload()
      await openArticle(article)
      flash('文章已导入')
    }
  }

  async function onContentClick(e: React.MouseEvent<HTMLDivElement>): Promise<void> {
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
    const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY)
    if (!range || !e.currentTarget.contains(range.startContainer)) {
      setPopup(null)
      return
    }
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) {
      setPopup(null)
      return
    }
    const text = node.textContent ?? ''
    const word = expandWord(text, range.startOffset)
    if (!word || word.length < 2) {
      setPopup(null)
      return
    }
    const lookup = await window.lexi.lookupWord(word)
    setPopup({ word, lookup, x: e.clientX, y: e.clientY })
  }

  async function addCurrentWord(): Promise<void> {
    if (!popup) return
    const result = await window.lexi.addWordToBook(popup.word)
    setPopup({
      ...popup,
      lookup: { ...popup.lookup, inBook: true, wordId: result.word?.id, phonetic: result.word?.phonetic ?? popup.lookup.phonetic, meaning: result.word?.meaning ?? popup.lookup.meaning, found: true }
    })
    flash(result.added ? `「${popup.word}」已加入词库` : `「${popup.word}」已在词库`)
  }

  /* ── 阅读正文 ─────────────────────── */
  if (selected) {
    const paragraphs = selected.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    return (
      <section>
        <div className="detail-topbar">
          <button className="text-btn" onClick={() => setSelected(null)}>
            ← 返回文章列表
          </button>
          <span className="session-progress">{selected.chars} 字符</span>
        </div>

        <div className="card article-card">
          <h1 className="article-title">{selected.title}</h1>
          <p className="section-note">点击任意英文单词查词义、加入词库</p>
          <div className="article-content" onClick={(e) => void onContentClick(e)}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>

        {popup && (
          <>
            <div className="popup-mask" onClick={() => setPopup(null)} />
            <div
              className="word-popup"
              style={{
                left: Math.min(popup.x + 12, window.innerWidth - 320),
                top: Math.min(popup.y + 12, window.innerHeight - 220)
              }}
            >
              <div className="word-popup-head">
                <strong>{popup.word}</strong>
                <button className="text-btn" onClick={() => setPopup(null)}>
                  ✕
                </button>
              </div>
              {popup.lookup.found ? (
                <>
                  <p className="word-popup-phonetic">{popup.lookup.phonetic || '（无音标）'}</p>
                  <p className="word-popup-meaning">{popup.lookup.meaning || '（无释义）'}</p>
                </>
              ) : (
                <p className="stub-note">词典未收录这个词。可以加入词库后在学习里用 AI 补全释义。</p>
              )}
              <div className="btn-row" style={{ marginTop: 10 }}>
                {popup.lookup.inBook ? (
                  <span className="task-tag task-tag-done">✓ 已在词库</span>
                ) : (
                  <button className="btn btn-sm" onClick={() => void addCurrentWord()}>
                    加入词库
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {toast && <div className="toast">{toast}</div>}
      </section>
    )
  }

  /* ── 文章列表 ─────────────────────── */
  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">阅读</h1>
          <p className="page-sub">读文章，生词自然流入词汇系统</p>
        </div>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className="btn btn-ghost" onClick={() => setShowPaste(true)}>
            粘贴文章
          </button>
          <button className="btn" onClick={() => void importFile()}>
            导入文件
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        {articles.length === 0 ? (
          <p className="stub-note">
            还没有文章。点右上角「粘贴文章」把一段英文贴进来，或「导入文件」选一个 .txt / .md 文件。
          </p>
        ) : (
          <div className="article-list">
            {articles.map((a) => (
              <div key={a.id} className="article-row" onClick={() => void openArticle(a)}>
                <div className="article-row-main">
                  <span className="article-row-title">{a.title}</span>
                  <span className="article-row-meta">
                    {a.chars} 字符{a.lastReadAt ? ` · 上次阅读 ${a.lastReadAt.slice(0, 10)}` : ' · 未读'}
                  </span>
                </div>
                <button
                  className="text-btn task-remove"
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (window.confirm(`删除文章「${a.title}」？`)) {
                      await window.lexi.deleteArticle(a.id)
                      await reload()
                    }
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPaste && (
        <div className="modal-mask" onClick={() => !busy && setShowPaste(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-h3">粘贴文章</h3>
            <div className="field">
              <label>标题（可留空，自动取首行）</label>
              <input type="text" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="例如：The Power of Small Habits" />
            </div>
            <div className="field">
              <label>正文</label>
              <textarea
                className="notes-area"
                style={{ minHeight: 200 }}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="把英文文章粘贴到这里…"
                autoFocus
              />
            </div>
            <div className="btn-row">
              <button className="btn" disabled={busy || !pasteContent.trim()} onClick={() => void pasteArticle()}>
                导入
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setShowPaste(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </section>
  )
}
