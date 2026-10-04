import { useCallback, useEffect, useState } from 'react'
import type { ArticleItem, BookSummary, DictLookup } from '../../../shared/types'

interface PopupState {
  kind: 'word' | 'phrase'
  /** 弹窗主文本：词或短语 */
  text: string
  /** 需要翻译的目标文本（词=所在整段；短语=选中文本） */
  targetText: string
  lookup: DictLookup | null
  translation: string
  translating: boolean
  translateError: string
  x: number
  y: number
  bookId: number
}

const WORD_CHAR = /[A-Za-z''-]/

function expandWord(text: string, offset: number): string {
  let start = offset
  let end = offset
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  while (end < text.length && WORD_CHAR.test(text[end])) end++
  return text.slice(start, end).replace(/^[''-]+|[''-]+$/g, '')
}

const SINGLE_WORD = /^[A-Za-z][A-Za-z''-]*$/

export default function Reading(): React.JSX.Element {
  const [articles, setArticles] = useState<ArticleItem[]>([])
  const [books, setBooks] = useState<BookSummary[]>([])
  const [selected, setSelected] = useState<ArticleItem | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [toast, setToast] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteContent, setPasteContent] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setArticles(await window.lexi.listArticles())
    setBooks(await window.lexi.listBooks())
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

  /** 打开弹窗并自动翻译目标文本。 */
  async function openPopup(base: Omit<PopupState, 'translation' | 'translating' | 'translateError'>): Promise<void> {
    const key = base.text
    setPopup({ ...base, translation: '', translating: true, translateError: '' })
    try {
      const r = await window.lexi.translateReading(base.targetText)
      setPopup((cur) => (cur && cur.text === key ? { ...cur, translation: r.translated, translating: false } : cur))
    } catch (e) {
      setPopup((cur) =>
        cur && cur.text === key
          ? { ...cur, translating: false, translateError: e instanceof Error ? e.message : String(e) }
          : cur
      )
    }
  }

  /** 鼠标松开：有选区 → 短语翻译；无选区 → 单词查义 + 整段翻译。 */
  async function handleMouseUp(e: React.MouseEvent<HTMLDivElement>): Promise<void> {
    const container = e.currentTarget
    const sel = window.getSelection()
    const selText = sel && sel.rangeCount > 0 ? sel.toString().trim() : ''
    if (selText.length >= 2 && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      if (container.contains(range.commonAncestorContainer)) {
        const rect = range.getBoundingClientRect()
        const single = SINGLE_WORD.test(selText)
        const lookup = single ? await window.lexi.lookupWord(selText) : null
        await openPopup({
          kind: single ? 'word' : 'phrase',
          text: selText,
          targetText: selText,
          lookup,
          x: rect.left + rect.width / 2,
          y: rect.bottom,
          bookId: lookup?.bookId ?? books[0]?.id ?? 0
        })
        return
      }
    }
    // 无选区：取光标下的词
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
    const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY)
    if (!range || !container.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) {
      setPopup(null)
      return
    }
    const text = range.startContainer.textContent ?? ''
    const word = expandWord(text, range.startOffset)
    if (!word || word.length < 2) {
      setPopup(null)
      return
    }
    let paraText = ''
    let el: Node | null = range.startContainer
    while (el) {
      if (el instanceof HTMLElement && el.tagName === 'P') {
        paraText = el.textContent ?? ''
        break
      }
      el = el.parentNode
    }
    const lookup = await window.lexi.lookupWord(word)
    await openPopup({
      kind: 'word',
      text: word,
      targetText: paraText || word,
      lookup,
      x: e.clientX,
      y: e.clientY,
      bookId: lookup.bookId
    })
  }

  function closePopup(): void {
    setPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  const popupWord = popup ? (popup.lookup?.word ?? (SINGLE_WORD.test(popup.text) ? popup.text : '')) : ''

  async function changeBook(bookId: number): Promise<void> {
    if (!popup) return
    const lookup = popupWord ? await window.lexi.lookupWord(popupWord, bookId) : popup.lookup
    setPopup({ ...popup, bookId, lookup })
  }

  async function addCurrentWord(): Promise<void> {
    if (!popup || !popupWord) return
    const result = await window.lexi.addWordToBook(popupWord, popup.bookId)
    const lookup = await window.lexi.lookupWord(popupWord, popup.bookId)
    setPopup({ ...popup, lookup })
    const bookName = books.find((b) => b.id === popup.bookId)?.name ?? '词书'
    flash(result.added ? `「${popupWord}」已加入「${bookName}」` : `「${popupWord}」已在「${bookName}」`)
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
          <p className="section-note">点击单词：查词义 + 整段翻译；选中短语：翻译选中内容；加入词库可选任意词书</p>
          <div className="article-content" onMouseUp={(e) => void handleMouseUp(e)}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>

        {popup && (
          <>
            <div className="popup-mask" onClick={closePopup} />
            <div
              className="word-popup"
              style={{
                left: Math.max(12, Math.min(popup.x + 12, window.innerWidth - 360)),
                top: Math.min(popup.y + 12, Math.max(12, window.innerHeight - 380))
              }}
            >
              <div className="word-popup-head">
                <strong className={popup.kind === 'phrase' ? 'popup-phrase-head' : ''}>
                  {popup.kind === 'phrase' ? '短语翻译' : popup.text}
                </strong>
                <button className="text-btn" onClick={closePopup}>
                  ✕
                </button>
              </div>

              {popup.kind === 'phrase' && <p className="popup-phrase-text">{popup.text}</p>}

              {popup.lookup && (
                <>
                  {popup.lookup.found ? (
                    <>
                      <p className="word-popup-phonetic">{popup.lookup.phonetic || '（无音标）'}</p>
                      <p className="word-popup-meaning">{popup.lookup.meaning || '（无释义）'}</p>
                    </>
                  ) : (
                    <p className="stub-note">词典未收录，可加入词库后用 AI 讲解补全。</p>
                  )}
                  <div className="popup-book-row">
                    <select value={popup.bookId} onChange={(e) => void changeBook(Number(e.target.value))}>
                      {books.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {popup.lookup.inBook ? (
                      <span className="task-tag task-tag-done">✓ 已在本词书</span>
                    ) : (
                      <button className="btn btn-sm" onClick={() => void addCurrentWord()}>
                        加入词库
                      </button>
                    )}
                  </div>
                </>
              )}

              <div className="popup-translate">
                <p className="popup-label">{popup.kind === 'word' ? '本段翻译' : '翻译'}</p>
                {popup.translating ? (
                  <p className="stub-note">翻译中…</p>
                ) : popup.translateError ? (
                  <p className="status-line status-err">
                    {popup.translateError}
                    {/配置/.test(popup.translateError) && (
                      <>
                        （<span className="popup-hint-link">设置 → AI 配置</span>）
                      </>
                    )}
                  </p>
                ) : (
                  <p className="popup-translation-text">{popup.translation}</p>
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
