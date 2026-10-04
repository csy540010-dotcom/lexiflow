import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MusicWordItem, TrackItem } from '../../../shared/types'
import { coverBackground, waveHeights } from '../lib/covers'

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

const SPEEDS = [0.75, 1.0, 1.25, 1.5]

type DetailTab = 'raw' | 'organized' | 'words' | 'notes'
type TopTab = 'mine' | 'online' | 'ai'

interface CoverProps {
  track: TrackItem
  size: 'mini' | 'lg'
}

function TrackCover({ track, size }: CoverProps): React.JSX.Element {
  if (track.coverFile) {
    return (
      <span className={'cover-tile cover-' + size + ' cover-has-img'}>
        <img src={'lexi-media://music/' + encodeURIComponent(track.coverFile)} alt="" />
      </span>
    )
  }
  return (
    <span className={'cover-tile cover-' + size} style={{ background: coverBackground(track.title) }} aria-hidden="true">
      ♫
    </span>
  )
}

export default function Music(): React.JSX.Element {
  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [selected, setSelected] = useState<TrackItem | null>(null)
  const [topTab, setTopTab] = useState<TopTab>('mine')
  const [tab, setTab] = useState<DetailTab>('raw')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [textDraft, setTextDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [collectionDraft, setCollectionDraft] = useState('')
  const [words, setWords] = useState<MusicWordItem[] | null>(null)
  const [wordsBusy, setWordsBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1.0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ id: number; done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const tickRef = useRef<number | null>(null)
  const notesTimer = useRef<number | undefined>(undefined)
  const selectedIdRef = useRef<number | null>(null)

  const reload = useCallback(async (): Promise<TrackItem[]> => {
    const list = await window.lexi.listTracks()
    setTracks(list)
    return list
  }, [])

  useEffect(() => {
    void reload().then((list) => {
      if (list.length > 0) setSelected((prev) => prev ?? list[0])
    })
  }, [reload])

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null
  }, [selected])

  // 整理进度推送
  useEffect(() => {
    const off = window.lexi.onOrganizeProgress((p) => {
      if (selectedIdRef.current === p.id) setProgress(p)
    })
    return off
  }, [])

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2800)
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

  /** 播放列表按集合分组。 */
  const groups = useMemo(() => {
    const map = new Map<string, TrackItem[]>()
    for (const t of tracks) {
      const key = t.collection.trim() || '未分类'
      const bucket = map.get(key)
      if (bucket) bucket.push(t)
      else map.set(key, [t])
    }
    return [...map.entries()]
  }, [tracks])

  function applyUpdated(updated: TrackItem): void {
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev))
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  async function importAudio(): Promise<void> {
    const track = await window.lexi.importAudio()
    if (!track) return
    await reload()
    selectTrack(track)
    flash('音频已导入（原文件未改动）')
  }

  function selectTrack(track: TrackItem): void {
    setSelected(track)
    setTextDraft(track.textContent)
    setNotesDraft(track.notes)
    setCollectionDraft(track.collection)
    setTab(track.segments.length > 0 ? 'organized' : 'raw')
    setWords(null)
    setProgress(null)
    setError('')
    setPlaying(false)
    setCurrent(0)
    setDuration(track.duration)
  }

  async function removeTrack(track: TrackItem): Promise<void> {
    if (!window.confirm(`删除听力条目「${track.title}」？（App 内副本会删除，你的原文件不受影响）`)) return
    const list = await window.lexi.deleteTrack(track.id)
    setTracks(list)
    if (selected?.id === track.id) {
      const next = list[0] ?? null
      if (next) selectTrack(next)
      else setSelected(null)
    }
  }

  async function saveCollection(): Promise<void> {
    if (!selected) return
    const trimmed = collectionDraft.trim()
    if (trimmed === selected.collection) return
    const updated = await window.lexi.setTrackCollection(selected.id, trimmed)
    applyUpdated(updated)
    flash(trimmed ? `已归入集合「${trimmed}」` : '已移出集合（未分类）')
  }

  async function changeCover(): Promise<void> {
    if (!selected) return
    const updated = await window.lexi.pickTrackCover(selected.id)
    if (updated) {
      applyUpdated(updated)
      flash('封面已更新')
    }
  }

  async function saveText(): Promise<void> {
    if (!selected) return
    const updated = await window.lexi.setTrackText(selected.id, textDraft)
    applyUpdated(updated)
    setWords(null)
    flash('文本已保存')
  }

  async function organize(): Promise<void> {
    if (!selected) return
    setBusy(true)
    setError('')
    setProgress({ id: selected.id, done: 0, total: 0 })
    try {
      if (textDraft !== selected.textContent) {
        const saved = await window.lexi.setTrackText(selected.id, textDraft)
        applyUpdated(saved)
        setWords(null)
      }
      const updated = await window.lexi.organizeTrack(selected.id)
      applyUpdated(updated)
      setTab('organized')
      flash(`AI 整理完成：共 ${updated.segments.length} 段（按语义分段，对话标注男女说话人）`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function resetOrganized(): Promise<void> {
    if (!selected) return
    if (!window.confirm('重置整理：清空当前的分段结果？（原文不受影响，之后可重新整理）')) return
    const updated = await window.lexi.clearTrackSegments(selected.id)
    applyUpdated(updated)
    flash('整理结果已重置，可重新整理')
  }

  function saveNotes(next: string): void {
    setNotesDraft(next)
    if (!selected) return
    window.clearTimeout(notesTimer.current)
    notesTimer.current = window.setTimeout(async () => {
      const updated = await window.lexi.setTrackNotes(selected.id, next)
      applyUpdated(updated)
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

  async function onMetaLoaded(el: HTMLAudioElement): Promise<void> {
    const dur = el.duration || 0
    setDuration(dur)
    el.playbackRate = speed
    if (selected && dur > 0 && Math.abs(dur - selected.duration) > 1) {
      const updated = await window.lexi.setTrackDuration(selected.id, dur)
      applyUpdated(updated)
    }
  }

  const progressText =
    busy && selected
      ? progress && progress.id === selected.id && progress.total > 0
        ? `整理中…（第 ${progress.done}/${progress.total} 块）`
        : '整理中…'
      : 'AI 整理文本'

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

      <div className="pt-tabs" style={{ maxWidth: 1020, marginTop: 6 }}>
        <button className={'pt-tab' + (topTab === 'mine' ? ' active' : '')} onClick={() => setTopTab('mine')}>
          我的音频
        </button>
        <button className={'pt-tab' + (topTab === 'online' ? ' active' : '')} onClick={() => setTopTab('online')}>
          在线资源
        </button>
        <button className={'pt-tab' + (topTab === 'ai' ? ' active' : '')} onClick={() => setTopTab('ai')}>
          AI 推荐
        </button>
      </div>

      {topTab !== 'mine' ? (
        <div className="card" style={{ maxWidth: 1020 }}>
          <p className="stub-note">
            {topTab === 'online'
              ? '在线资源：后续版本支持直接搜索 / 播放在线听力材料。当前请用右上角「导入 MP3」把音频放进「我的音频」。'
              : 'AI 推荐：后续版本根据你的学习情况推荐适合的听力材料。当前请用右上角「导入 MP3」建立自己的听力库。'}
          </p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="card" style={{ maxWidth: 1020 }}>
          <div className="empty-illustration" aria-hidden="true">
            <span className="empty-circle">🎧</span>
          </div>
          <p className="stub-note" style={{ textAlign: 'center' }}>
            听力库还是空的。点右上角「导入 MP3」选一个音频文件（App 会复制一份副本，你的原文件不动），再粘贴对应文本让 AI 整理。
          </p>
        </div>
      ) : (
        <div className="music-layout">
          <aside className="card music-playlist">
            <p className="playlist-title">我的音频（{tracks.length}）</p>
            {groups.map(([name, items]) => (
              <div key={name} className="playlist-group">
                <button
                  className="playlist-group-head"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }))}
                >
                  <span className="playlist-group-caret">{collapsed[name] ? '▸' : '▾'}</span>
                  <span className="playlist-group-name">{name}</span>
                  <span className="playlist-group-count">{items.length}</span>
                </button>
                {!collapsed[name] &&
                  items.map((t) => (
                    <button
                      key={t.id}
                      className={'playlist-item' + (selected?.id === t.id ? ' active' : '')}
                      onClick={() => selectTrack(t)}
                    >
                      <TrackCover track={t} size="mini" />
                      <span className="playlist-item-body">
                        <span className="playlist-item-title">{t.title}</span>
                        <span className="playlist-item-meta">
                          {t.duration > 0 ? fmtTime(t.duration) : t.textContent ? '有文本' : '缺文本'}
                          {t.segments.length > 0 ? ` · 整理 ${t.segments.length} 段` : ''}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </aside>

          {selected && (
            <div className="music-main">
              <div className="card player-card">
                <div className="player-head">
                  <TrackCover track={selected} size="lg" />
                  <div className="player-head-main">
                    <h3 className="player-title">{selected.title}</h3>
                    <p className="player-subline">
                      {playing ? '播放中 · 计入听力时间' : '已暂停'} · {fmtTime(current)} /{' '}
                      {fmtTime(duration || selected.duration)}
                    </p>
                    <div className="wave-strip" aria-hidden="true">
                      {waveHeights(selected.title).map((h, i) => (
                        <span key={i} style={{ height: h + 'px' }} />
                      ))}
                    </div>
                    <div className="collection-line">
                      <span>集合：</span>
                      <input
                        className="collection-input"
                        value={collectionDraft}
                        placeholder="未分类（输入后回车归类）"
                        onChange={(e) => setCollectionDraft(e.target.value)}
                        onBlur={() => void saveCollection()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    </div>
                  </div>
                  <div className="player-head-actions">
                    <button className="text-btn" onClick={() => void changeCover()}>
                      换封面
                    </button>
                    <button className="text-btn task-remove" onClick={() => void removeTrack(selected)}>
                      删除
                    </button>
                  </div>
                </div>
                <audio
                  ref={audioRef}
                  src={'lexi-media://music/' + encodeURIComponent(selected.audioFile)}
                  preload="metadata"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => void onMetaLoaded(e.currentTarget)}
                  onError={() => setError('音频加载失败，请删除后重新导入。')}
                />

                <div className="player-progress">
                  <span className="player-time">{fmtTime(current)}</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, duration || selected.duration || 1)}
                    step={1}
                    value={Math.min(current, duration || selected.duration || 1)}
                    onChange={(e) => seek(Number(e.target.value))}
                  />
                  <span className="player-time">{fmtTime(duration || selected.duration)}</span>
                </div>

                <div className="player-controls">
                  <select value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} className="speed-select speed-left">
                    {SPEEDS.map((s) => (
                      <option key={s} value={s}>
                        {s.toFixed(2).replace(/0$/, '')}x
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => seek(current - 15)}>
                    ↺ 15s
                  </button>
                  <button className="btn player-play" onClick={togglePlay}>
                    {playing ? '⏸ 暂停' : '▶ 播放'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => seek(current + 30)}>
                    30s ↻
                  </button>
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
                        {progressText}
                      </button>
                    </div>
                  )}
                </div>

                {tab === 'raw' && (
                  <>
                    <p className="section-note">
                      粘贴或修改对应文本，再点「AI 整理文本」：自动去掉时间戳、按语义分段、对话标注男女说话人，覆盖全文不截断。
                    </p>
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
                    <p className="stub-note">还没有整理结果。先切到「原文」贴上文本，再点「AI 整理文本」。</p>
                  ) : (
                    <>
                      <ol className="segment-list">
                        {selected.segments.map((seg, i) => (
                          <li key={i} className="segment-item">
                            <span className="segment-index">{i + 1}</span>
                            <p>{seg}</p>
                          </li>
                        ))}
                      </ol>
                      <div className="organized-foot">
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void organize()}>
                          {busy ? '整理中…' : 'AI 重新整理'}
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void resetOrganized()}>
                          AI 重置整理
                        </button>
                      </div>
                    </>
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
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </section>
  )
}
