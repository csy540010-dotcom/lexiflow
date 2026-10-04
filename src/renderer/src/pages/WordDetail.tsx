import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { SentenceFavoriteItem, WordDetailData, WordProfile } from '../../../shared/types'
import MasteryDots from '../components/MasteryDots'

const MASTERY_DIMS: Array<{ key: 'recognition' | 'comprehension' | 'production' | 'transfer'; label: string }> = [
  { key: 'recognition', label: '识别' },
  { key: 'comprehension', label: '理解' },
  { key: 'production', label: '使用' },
  { key: 'transfer', label: '迁移' }
]

const STATUS_LABEL: Record<number, string> = { 0: '未学习', 1: '学习中', 2: '已掌握' }

type ProfileTab = 'def' | 'ex' | 'coll' | 'rel' | 'forms'

const PROFILE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'def', label: '释义与用法' },
  { id: 'ex', label: '例句' },
  { id: 'coll', label: '搭配' },
  { id: 'rel', label: '相关词' },
  { id: 'forms', label: '词形变化' }
]

function cachedProfile(word: WordDetailData): WordProfile | null {
  const rec = [...word.records].reverse().find((r) => r.kind === 'ai_profile')
  if (!rec) return null
  const p = rec.payload as { profile?: WordProfile }
  return p.profile ?? null
}

/** 系统朗读（Chromium 内置语音，离线可用）。 */
function speak(word: string): void {
  try {
    const u = new SpeechSynthesisUtterance(word)
    u.lang = 'en-US'
    u.rate = 0.95
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch {
    /* 无语音环境忽略 */
  }
}

export default function WordDetail(): React.JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const ids = (location.state as { ids?: number[] } | null)?.ids ?? null

  const [word, setWord] = useState<WordDetailData | null>(null)
  const [favs, setFavs] = useState<SentenceFavoriteItem[]>([])
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState('')
  const [profile, setProfile] = useState<WordProfile | null>(null)
  const [profileTab, setProfileTab] = useState<ProfileTab>('def')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const notesTimer = useRef<number | undefined>(undefined)

  const load = useCallback(async (wordId: number): Promise<void> => {
    const w = await window.lexi.getWord(wordId)
    setWord(w)
    setNotes(w?.notes ?? '')
    setFavs(await window.lexi.listFavorites(wordId))
    setProfile(w ? cachedProfile(w) : null)
    setProfileError('')
  }, [])

  useEffect(() => {
    if (id) void load(Number(id))
  }, [id, load])

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2000)
  }

  function saveNotes(next: string): void {
    setNotes(next)
    if (!word) return
    window.clearTimeout(notesTimer.current)
    notesTimer.current = window.setTimeout(async () => {
      const updated = await window.lexi.updateWord(word.id, { notes: next })
      if (updated) setWord(updated)
    }, 600)
  }

  async function toggleFavorite(): Promise<void> {
    if (!word) return
    const updated = await window.lexi.updateWord(word.id, { favorite: word.favorite ? 0 : 1 })
    if (updated) setWord(updated)
  }

  async function startStudy(): Promise<void> {
    if (!word) return
    const target = word.status === 0 ? 1 : 0
    const updated = await window.lexi.updateWord(word.id, { status: target as 0 | 1 | 2 })
    if (updated) {
      setWord(updated)
      flash(target === 1 ? '已加入学习' : '已移回未学习')
    }
  }

  async function markMastered(): Promise<void> {
    if (!word) return
    const updated = await window.lexi.updateWord(word.id, { status: 2 })
    if (updated) {
      setWord(updated)
      flash('已标记为「已掌握」')
    }
  }

  async function generateProfile(): Promise<void> {
    if (!word) return
    setProfileBusy(true)
    setProfileError('')
    try {
      const r = await window.lexi.generateWordProfile(word.id)
      setProfile(r.profile)
      const w = await window.lexi.getWord(word.id)
      if (w) setWord(w)
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : String(e))
    } finally {
      setProfileBusy(false)
    }
  }

  function goto(offset: number): void {
    if (!word || !ids) return
    const idx = ids.indexOf(word.id)
    const next = ids[idx + offset]
    if (next !== undefined) navigate('/vocabulary/word/' + next, { state: { ids } })
  }

  if (!word) {
    return (
      <section>
        <Link to="/vocabulary" className="back-link">
          ← 返回词汇库
        </Link>
        <p className="stub-note" style={{ marginTop: 20 }}>
          加载中…
        </p>
      </section>
    )
  }

  const idx = ids ? ids.indexOf(word.id) : -1

  return (
    <section>
      <div className="detail-topbar">
        <Link to="/vocabulary" className="back-link">
          ← 返回词汇库
        </Link>
        {ids && (
          <div className="detail-pager">
            <button className="text-btn" disabled={idx <= 0} onClick={() => goto(-1)}>
              ‹ 上一个
            </button>
            <button className="text-btn" disabled={idx < 0 || idx >= ids.length - 1} onClick={() => goto(1)}>
              下一个 ›
            </button>
          </div>
        )}
      </div>

      <div className="card detail-head">
        <div className="detail-title-row">
          <h1 className="detail-word">{word.headword}</h1>
          <button className={'star star-lg' + (word.favorite ? ' starred' : '')} onClick={() => void toggleFavorite()}>
            {word.favorite ? '★' : '☆'}
          </button>
        </div>
        <p className="detail-phonetic">
          <button className="speak-btn" title="朗读" onClick={() => speak(word.headword)}>
            🔊
          </button>
          {word.phonetic || '（词典暂无音标）'}
          <span className="detail-status">{STATUS_LABEL[word.status]}</span>
          {word.dueDate && <span className="detail-due">复习到期 {word.dueDate}</span>}
        </p>
        <p className="detail-meaning">{word.meaning || '（词典暂无释义）'}</p>
        <div className="btn-row">
          <button className="btn" onClick={() => void startStudy()}>
            {word.status === 0 ? '加入今日学习' : word.status === 1 ? '移回未学习' : '重新学习'}
          </button>
          {word.status !== 2 && (
            <button className="btn btn-ghost" onClick={() => void markMastered()}>
              ✓ 标记已掌握
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head-row">
          <h3 className="card-h3">AI 释义与用法</h3>
          {profile && (
            <button className="text-btn" disabled={profileBusy} onClick={() => void generateProfile()}>
              重新生成
            </button>
          )}
        </div>
        {profile ? (
          <>
            <div className="chips" style={{ marginTop: 4 }}>
              {PROFILE_TABS.map((t) => (
                <button
                  key={t.id}
                  className={'chip' + (profileTab === t.id ? ' chip-active' : '')}
                  onClick={() => setProfileTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="profile-body">
              {profileTab === 'def' && (
                <ol className="profile-defs">
                  {profile.definitions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ol>
              )}
              {profileTab === 'ex' && (
                <ul className="profile-examples">
                  {profile.examples.map((ex, i) => (
                    <li key={i}>
                      <p className="example-en">
                        {ex.en}
                        <button className="speak-btn speak-inline" title="朗读例句" onClick={() => speak(ex.en)}>
                          🔊
                        </button>
                      </p>
                      <p className="example-zh">{ex.zh}</p>
                    </li>
                  ))}
                </ul>
              )}
              {profileTab === 'coll' && (
                <ul className="profile-coll">
                  {profile.collocations.map((c, i) => (
                    <li key={i}>
                      <span className="coll-phrase">{c.phrase}</span>
                      <span className="coll-zh">{c.zh}</span>
                    </li>
                  ))}
                </ul>
              )}
              {profileTab === 'rel' && (
                <ul className="profile-coll">
                  {profile.related.map((r, i) => (
                    <li key={i}>
                      <span className="coll-phrase">{r.word}</span>
                      <span className="coll-zh">{r.zh}</span>
                    </li>
                  ))}
                </ul>
              )}
              {profileTab === 'forms' &&
                (profile.forms.length === 0 ? (
                  <p className="stub-note">这个词没有常见词形变化。</p>
                ) : (
                  <ul className="profile-coll">
                    {profile.forms.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                ))}
            </div>
          </>
        ) : (
          <>
            <p className="section-note">
              让 AI 生成完整词条：基本释义与用法、3 个例句（可朗读）、常用搭配、相关词、词形变化。
            </p>
            <button className="btn" disabled={profileBusy} onClick={() => void generateProfile()}>
              {profileBusy ? '生成中…' : '生成 AI 释义与用法'}
            </button>
            {profileError && (
              <p className="status-line status-err">
                {profileError}
                {/配置/.test(profileError) && '（设置 → AI 配置）'}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">掌握程度（系统根据学习表现自动判断）</h3>
        <div className="mastery-grid">
          {MASTERY_DIMS.map((dim) => (
            <div key={dim.key} className="mastery-row">
              <span className="mastery-label">{dim.label}</span>
              <MasteryDots level={Math.max(0, Math.min(5, word.mastery[dim.key] ?? 0))} max={5} />
            </div>
          ))}
        </div>
      </div>

      {word.prompts.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="card-h3">中文造句提示</h3>
          <ul className="prompt-list">
            {word.prompts.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">我的笔记</h3>
        <textarea
          className="notes-area"
          value={notes}
          onChange={(e) => saveNotes(e.target.value)}
          placeholder="写下自己的理解、例句或联想…自动保存"
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">句子收藏</h3>
        {favs.length === 0 ? (
          <p className="stub-note">还没有收藏。学习时批改给出「修改后」的句子，点旁边的 ☆ 就能存进来。</p>
        ) : (
          <ul className="fav-list">
            {favs.map((f) => (
              <li key={f.id} className="fav-item">
                <p className="fav-sentence">{f.sentence}</p>
                <div className="fav-meta">
                  <span>{f.source === 'original' ? '原句' : '修改后'}</span>
                  <span>{f.createdAt.slice(0, 10)}</span>
                  <button
                    className="text-btn task-remove"
                    onClick={async () => setFavs(await window.lexi.removeFavorite(f.id))}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-h3">学习历史</h3>
        {word.records.filter((r) => r.kind !== 'ai_profile').length === 0 ? (
          <p className="stub-note">还没有练习记录。从「今日学习 → 单词学习」开始，或通过长难句练习产生记录。</p>
        ) : (
          <ul className="record-list">
            {word.records
              .filter((r) => r.kind !== 'ai_profile')
              .map((r) => (
                <li key={r.id}>
                  <span className="record-kind">{r.kind === 'translation' ? '长难句练习' : r.kind === 'ai_grade' ? '造句批改' : r.kind === 'ai_explain' ? 'AI 讲解' : r.kind}</span>
                  <span className="record-time">{r.occurredAt.slice(0, 10)}</span>
                  <p className="record-payload">
                    {(r.payload as { sentence?: string }).sentence ?? JSON.stringify(r.payload).slice(0, 120)}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </section>
  )
}
