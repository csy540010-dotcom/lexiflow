import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BookSummary, ImportPreview, ImportResult, WordFilter, WordListItem } from '../../../shared/types'
import MasteryDots from '../components/MasteryDots'
import BookCover from '../components/BookCover'

const FILTERS: Array<{ id: WordFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'unlearned', label: '未学习' },
  { id: 'learning', label: '学习中' },
  { id: 'mastered', label: '已掌握' },
  { id: 'favorite', label: '收藏' }
]

const PAGE_SIZE = 50

export default function Vocabulary(): React.JSX.Element {
  const navigate = useNavigate()
  const [books, setBooks] = useState<BookSummary[]>([])
  const [bookId, setBookId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filter, setFilter] = useState<WordFilter>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<WordListItem[]>([])
  const [toast, setToast] = useState('')
  const [newBookName, setNewBookName] = useState('')
  const [showNewBook, setShowNewBook] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importDir, setImportDir] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const queryTimer = useRef<number | undefined>(undefined)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2500)
  }, [])

  const reloadBooks = useCallback(async (): Promise<BookSummary[]> => {
    const list = await window.lexi.listBooks()
    setBooks(list)
    return list
  }, [])

  useEffect(() => {
    void reloadBooks().then((list) => {
      if (list.length > 0) setBookId((prev) => prev ?? list[0].id)
    })
  }, [reloadBooks])

  useEffect(() => {
    window.clearTimeout(queryTimer.current)
    queryTimer.current = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(queryTimer.current)
  }, [query])

  useEffect(() => {
    if (bookId == null) return
    void window.lexi
      .queryWords({ bookId, query: debouncedQuery, filter, page, pageSize: PAGE_SIZE })
      .then((r) => {
        setTotal(r.total)
        setItems(r.items)
      })
  }, [bookId, debouncedQuery, filter, page])

  async function createBook(): Promise<void> {
    const name = newBookName.trim()
    if (!name) return
    const id = await window.lexi.createBook(name)
    await reloadBooks()
    setBookId(id)
    setNewBookName('')
    setShowNewBook(false)
    flash(`词书「${name}」已创建`)
  }

  async function toggleFavorite(item: WordListItem): Promise<void> {
    const next = item.favorite ? 0 : 1
    await window.lexi.updateWord(item.id, { favorite: next as 0 | 1 })
    setItems((prev) => prev.map((w) => (w.id === item.id ? { ...w, favorite: next as 0 | 1 } : w)))
    await reloadBooks()
  }

  async function startImport(): Promise<void> {
    const dir = await window.lexi.pickDirectory()
    if (!dir) return
    setImportDir(dir)
    const preview = await window.lexi.importDetect(dir)
    setImportPreview(preview)
  }

  async function confirmImport(): Promise<void> {
    if (!importPreview?.found) return
    setImportBusy(true)
    try {
      const result: ImportResult = await window.lexi.importRun(importDir)
      setImportPreview(null)
      const list = await reloadBooks()
      if (list.length > 0) setBookId((prev) => prev ?? list[0].id)
      flash(`导入完成：新增 ${result.addedWords} 词、复习 ${result.addedReviews} 条、练习历史 ${result.addedRecords} 条`)
    } finally {
      setImportBusy(false)
    }
  }

  const currentBook = books.find((b) => b.id === bookId)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">词汇库</h1>
          <p className="page-sub">词汇的图书馆——只管理与查看，不在此练习</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void startImport()}>
          导入 Obsidian 数据
        </button>
      </div>

      <div className="card vocab-card">
        <div className="vocab-toolbar">
          {currentBook && <BookCover coverId={currentBook.coverId} seed={currentBook.name} size="sm" />}
          <select
            value={bookId ?? ''}
            onChange={(e) => {
              setBookId(Number(e.target.value))
              setPage(1)
            }}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}（{b.total} 词）
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowNewBook(true)}>
            + 新建词书
          </button>
        </div>

        {currentBook && (
          <p className="vocab-bookmeta">
            学习中 {currentBook.learning} · 已掌握 {currentBook.mastered} · 收藏 {currentBook.favorites}
            {currentBook.due > 0 ? ` · 今日到期复习 ${currentBook.due}` : ''}
          </p>
        )}

        <div className="vocab-search">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="搜索单词或中文释义…"
          />
        </div>

        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={'chip' + (filter === f.id ? ' chip-active' : '')}
              onClick={() => {
                setFilter(f.id)
                setPage(1)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="word-list">
          {items.length === 0 ? (
            <p className="stub-note">没有符合条件的词。换个筛选，或从「导入 Obsidian 数据」把已学内容迁进来。</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="word-row" onClick={() => navigate('/vocabulary/word/' + item.id, { state: { ids: items.map((i) => i.id) } })}>
                <div className="word-row-main">
                  <span className="word-row-head">{item.headword}</span>
                  <span className="word-row-meaning">{item.meaning}</span>
                </div>
                <div className="word-row-side">
                  <MasteryDots level={item.masteryLevel} max={4} />
                  <button
                    className={'star' + (item.favorite ? ' starred' : '')}
                    title="收藏"
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleFavorite(item)
                    }}
                  >
                    {item.favorite ? '★' : '☆'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="pager">
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <span className="pager-info">
              {page} / {pageCount}（共 {total} 词）
            </span>
            <button className="btn btn-ghost btn-sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </div>
        )}
      </div>

      {showNewBook && (
        <div className="modal-mask" onClick={() => setShowNewBook(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-h3">新建词书</h3>
            <div className="field">
              <input
                type="text"
                autoFocus
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createBook()
                }}
                placeholder="例如：考研核心词"
              />
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => void createBook()}>
                创建
              </button>
              <button className="btn btn-ghost" onClick={() => setShowNewBook(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {importPreview && (
        <div className="modal-mask" onClick={() => !importBusy && setImportPreview(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-h3">
              {importPreview.found ? '检测到 Obsidian 插件数据' : '没有找到插件数据'}
            </h3>
            {importPreview.found ? (
              <>
                <p className="section-note">
                  存储版本：{importPreview.version ?? 'sharded-v1'} · 复习队列 {importPreview.reviewQueue} 条 ·
                  有练习历史的词 {importPreview.translationWords} 个。导入为合并模式，已存在的词不会重复。
                </p>
                <ul className="import-book-list">
                  {importPreview.books.map((b) => (
                    <li key={b.slug}>
                      {b.name} — {b.wordCount} 词
                    </li>
                  ))}
                </ul>
                {importPreview.warnings.map((w) => (
                  <p key={w} className="status-err">
                    ⚠ {w}
                  </p>
                ))}
              </>
            ) : (
              <p className="section-note">{importPreview.warnings[0]}</p>
            )}
            <div className="btn-row">
              {importPreview.found && (
                <button className="btn" disabled={importBusy} onClick={() => void confirmImport()}>
                  {importBusy ? '导入中…' : '开始导入'}
                </button>
              )}
              <button className="btn btn-ghost" disabled={importBusy} onClick={() => setImportPreview(null)}>
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
