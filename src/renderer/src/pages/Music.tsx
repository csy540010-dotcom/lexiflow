import { useCallback, useEffect, useRef, useState } from 'react'
import type { MusicWordItem, TrackItem } from '../../../shared/types'

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

const SPEEDS = [0.75, 1.0, 1.25, 1.5]

type DetailTab = 'raw' | 'organized' | 'words' | 'notes'

export default function Music(): React.JSX.Element {
  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [selected, setSelected] = useState<TrackItem | null>(null)
  const [tab, setTab] = useState<DetailTab>('raw')
  const [textDraft, setTextDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [words, setWords] = useState<MusicWordItem[] | null>(null)
  const [wordsBusy, setWordsBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1.0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const tickRef = useRef<number | null>(null)
  const notesTimer = useRef<number | undefined>(undefined)

  const reload = useCallback(async (): Promise<TrackItem[]> => {
    const list = await window.lexi.listTracks()
    setTracks(list)
    return list
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2200)
  }

  // 播放中每 5 秒累计听力时间
  useEffect(() => {
    if (playing) {
      tickRef.current = window.setInterval(() => void window.lexi.listeningTick(5), 5000)
    } else if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [playing])

  async function importAudio(): Promise<void> {
    const track = await window.lexi.importAudio()
    if (!track) return
    await reload()
    void selectTrack(track)
    flash('音频已导入（原文件未改动）')
  }

  function selectTrack(track: TrackItem): void {
    setSelected(track)
    setTextDraft(track.textContent)
    setNotesDraft(track.notes)
    setTab(track.segments.length > 0 ? 'organized' : 'raw')
    setWords(null)
    setError('')
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
  }

  async function removeTrack(track: TrackItem): Promise<void> {
    if (!window.confirm(`删除听力条目「${track.title}」？（App 内副本会删除，你的原文件不受影响）`)) return
    const list = await window.lexi.deleteTrack(track.id)
    setTracks(list)
    if (selected?.id === track.id) setSelected(null)
  }

  async function saveText(): Promise<void> {
    if (!selected) return
    const updated = await window.lexi.setText(selected.id, textDraft)
    setSelected(updated)
    setWords(null)
    flash('文本已保存')
  }

  async function organize(): Promise<void> {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      if (textDraft !== selected.textContent) {
        const saved = await window.lexi.setText(selected.id, textDraft)
        setSelected(saved)
        setWords(null)
      }
      const updated = await window.lexi.organizeTrack(selected.id)
      setSelected(updated)
      setTab('organized')
      flash('AI 整理完成')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function saveNotes(next: string): void {
    setNotesDraft(next)
    if (!selected) return
    window.clearTimeout(notesTimer.current)
    notesTimer.current = window.setTimeout(async () => {
      const updated = await window.lexi.setTrackNotes(selected.id, next)
      setSelected(updated)
      setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    }, 600)
  }

  async function openWordsTab(): Promise<void> {
    if (!selected) return
    setTab('words')
    if (words !== null) return
    setWordsBusy(true)
    try {
      setWords(await window.lexi.extractTrackWords(selected.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWordsBusy(false)
    }
  }

  async function addWordFromList(word: string): Promise<void> {
    await window.lexi.addWordToBook(word)
    setWords((prev) => (prev ? prev.map((w) => (w.word === word ? { ...w, inBook: true } : w)) : prev))
    flash(`「${word}」已加入词库`)
  }

  function togglePlay(): void {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      void el.play()
    }
  }

  function seek(sec: number): void {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(el.duration || 0, sec))
  }

  function changeSpeed(v: number): void {
    setSpeed(v)
    if (audioRef.current) audioRef.current.playbackRate = v
  }

  function jumpTrack(offset: number): void {
    if (!selected) return
    const idx = tracks.findIndex((t) => t.id === selected.id)
    const next = tracks[idx + offset]
    if (next) selectTrack(next)
  }

  /* ── 播放器详情 ─────────────────────── */
  if (selected) {
    const src = 'lexi-media://music/' + encodeURIComponent(selected.audioFile)
    const trackIdx = tracks.findIndex((t) => t.id === selected.id)
    return (
      <section>
        <div className="detail-topbar">
          <button className="text-btn" onClick={() => { setSelected(null); setPlaying(false) }}>
            ← 返回听力库
          </button>
          <div className="detail-pager">
            <button className="text-btn" disabled={trackIdx <= 0} onClick={() => jumpTrack(-1)}>
              ‹ 上一首
            </button>
            <button className="text-btn" disabled={trackIdx < 0 || trackIdx >= tracks.length - 1} onClick={() => jumpTrack(1)}>
              下一首 ›
            </button>
          </div>
        </div>

        <div className="music-layout">
          <aside className="card music-playlist">
            <p className="playlist-title">听力库（{tracks.length}）</p>
            {tracks.map((t) => (
              <button
                key={t.id}
                className={'playlist-item' + (t.id === selected.id ? ' active' : '')}
                onClick={() => selectTrack(t)}
              >
                <span className="playlist-item-title">♫ {t.title}</span>
                <span className="playlist-item-meta">
                  {t.textContent ? '有文本' : '缺文本'}
                  {t.segments.length > 0 ? ` · 整理 ${t.segments.length} 段` : ''}
                  {t.notes ? ' · 有笔记' : ''}
                </span>
              </button>
            ))}
          </aside>

          <div className="music-main">
            <div className="card player-card">
              <div className="player-head">
                <div className="cover-tile cover-tile-lg" aria-hidden="true">
                  ♫
                </div>
                <div className="player-head-main">
                  <h3 className="player-title">{selected.title}</h3>
                  <p className="stub-note">{playing ? '播放中 · 计入听力时间' : '已暂停'}</p>
                  <p className="stub-note">导入于 {selected.createdAt.slice(0, 10)}</p>
                </div>
              </div>
              <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration || 0)
                  e.currentTarget.playbackRate = speed
                }}
                onError={() => setError('音频加载失败，请删除后重新导入。')}
              />

              <div className="player-progress">
                <span className="player-time">{fmtTime(current)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration)}
                  step={1}
                  value={Math.min(current, duration)}
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <span className="player-time">{fmtTime(duration)}</span>
              </div>

              <div className="player-controls">
                <button className="btn btn-ghost btn-sm" onClick={() => seek(current - 15)}>
                  ↺ 15s
                </button>
                <button className="btn player-play" onClick={togglePlay}>
                  {playing ? '⏸ 暂停' : '▶ 播放'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => seek(current + 30)}>
                  30s ↻
                </button>
                <select value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} className="speed-select">
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s.toFixed(2).replace(/0$/, '')}x
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card module-card" style={{ marginTop: 16 }}>
              <div className="music-tabs-row">
                <div className="pt-tabs pt-tabs-inline">
                  <button className={'pt-tab' + (tab === 'raw' ? ' active' : '')} onClick={() => setTab('raw')}>
                    原文
                  </button>
                  <button className={'pt-tab' + (tab === 'organized' ? ' active' : '')} onClick={() => setTab('organized')}>
                    AI 整理{selected.segments.length > 0 ? `（${selected.segments.length}）` : ''}
                  </button>
                  <button className={'pt-tab' + (tab === 'words' ? ' active' : '')} onClick={() => void openWordsTab()}>
                    生词
                  </button>
                  <button className={'pt-tab' + (tab === 'notes' ? ' active' : '')} onClick={() => setTab('notes')}>
                    笔记
                  </button>
                </div>
                {tab === 'raw' && (
                  <div className="music-tabs-action">
                    <button className="btn btn-sm" disabled={busy || !textDraft.trim()} onClick={() => void organize()}>
                      {busy ? '整理中…' : 'AI 整理文本'}
                    </button>
                  </div>
                )}
              </div>

              {tab === 'raw' && (
                <>
                  <p className="section-note">粘贴或修改对应文本，再点「AI 整理文本」清理格式、分段分句。</p>
                  <textarea
                    className="notes-area"
                    style={{ minHeight: 180 }}
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    placeholder="把这段音频的原文粘贴到这里（也可以只放字幕文本）…"
                  />
                  <div className="btn-row">
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void saveText()}>
                      保存文本
                    </button>
                  </div>
                </>
              )}

              {tab === 'organized' &&
                (selected.segments.length === 0 ? (
                  <p className="stub-note">还没有整理结果。先切到「原文」贴上文本，再点右上角「AI 整理文本」。</p>
                ) : (
                  <ol className="segment-list">
                    {selected.segments.map((seg, i) => (
                      <li key={i} className="segment-item">
                        <span className="segment-index">{i + 1}</span>
                        <p>{seg}</p>
                      </li>
                    ))}
                  </ol>
                ))}

              {tab === 'words' && (
                <>
                  <p className="section-note">从这段文本里析出词典收录的单词（按出现顺序），点「加入」放进当前词书。</p>
                  {wordsBusy ? (
                    <p className="stub-note">正在析出…</p>
                  ) : !words || words.length === 0 ? (
                    <p className="stub-note">没有可析出的单词——先导入或粘贴文本。</p>
                  ) : (
                    <div className="music-word-list">
                      {words.map((w) => (
                        <div key={w.word} className="music-word-row">
                          <div className="music-word-main">
                            <span className="word-row-head">{w.word}</span>
                            <span className="music-word-phonetic">{w.phonetic}</span>
                            <span className="word-row-meaning">{w.meaning}</span>
                          </div>
                          {w.inBook ? (
                            <span className="task-tag task-tag-done">✓ 已在词库</span>
                          ) : (
                            <button className="btn btn-sm btn-ghost" onClick={() => void addWordFromList(w.word)}>
                              加入
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === 'notes' && (
                <>
                  <p className="section-note">这段听力的笔记（自动保存）：生词、听不出的连读、复述要点…</p>
                  <textarea
                    className="notes-area"
                    style={{ minHeight: 160 }}
                    value={notesDraft}
                    onChange={(e) => saveNotes(e.target.value)}
                    placeholder="写下听力笔记…自动保存"
                  />
                </>
              )}

              {error && (
                <p className="status-line status-err">
                  {error}
                  {/配置/.test(error) && '（设置 → AI 配置）'}
                </p>
              )}
            </div>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </section>
    )
  }

  /* ── 听力库列表 ─────────────────────── */
  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">听力</h1>
          <p className="page-sub">导入 MP3 + 对应文本的播放器式听力助手</p>
        </div>
        <button className="btn" onClick={() => void importAudio()}>
          导入 MP3
        </button>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        {tracks.length === 0 ? (
          <p className="stub-note">
            听力库还是空的。点右上角「导入 MP3」选一个音频文件（App 会复制一份副本，你的原文件不动），再粘贴对应文本让 AI 整理。
          </p>
        ) : (
          <div className="article-list">
            {tracks.map((t) => (
              <div key={t.id} className="article-row" onClick={() => selectTrack(t)}>
                <div className="track-row">
                  <span className="cover-mini" aria-hidden="true">
                    ♫
                  </span>
                  <div className="article-row-main">
                    <span className="article-row-title">{t.title}</span>
                    <span className="article-row-meta">
                      {t.textContent ? '有文本' : '缺文本'}
                      {t.segments.length > 0 ? ` · AI 整理 ${t.segments.length} 段` : ''}
                      {t.notes ? ' · 有笔记' : ''} · {t.createdAt.slice(0, 10)}
                    </span>
                  </div>
                </div>
                <button
                  className="text-btn task-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeTrack(t)
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </section>
  )
}
