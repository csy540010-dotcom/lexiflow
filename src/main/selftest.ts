import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings, SettingsPatch, AiTestResult, ImportPreview, ImportResult, WordListResult, WordDetailData, BookSummary } from '../shared/types'

interface LibraryHooks {
  listBooks: () => BookSummary[]
  queryWords: (args: { bookId: number; query?: string; filter?: string; page?: number; pageSize?: number }) => WordListResult
  getWord: (id: number) => WordDetailData | null
  updateWord: (id: number, patch: { favorite?: 0 | 1; notes?: string; status?: 0 | 1 | 2 }) => WordDetailData | null
  createBook: (name: string) => number
  deleteBook: (id: number) => void
}

interface ImportHooks {
  detect: (dir: string) => ImportPreview
  run: (dir: string) => ImportResult
  cleanup: (slugs: string[]) => number
}

export interface SelfTestHooks {
  loadSettings: () => AppSettings
  saveSettingsPatch: (patch: SettingsPatch) => AppSettings
  testAi: (cfg?: Partial<{ preset: string; baseUrl: string; apiKey: string; model: string }>) => Promise<AiTestResult>
  saveAiKey: (plain: string) => void
  storedKey: () => string
  library: LibraryHooks
  import: ImportHooks
}

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('自检失败：' + label)
  console.log('[lexiflow] selftest ✓ ' + label)
}

const FIXTURE = {
  index: {
    rev: 1,
    books: { personal: ['alpha', 'beta'], 'zz-test': ['gamma'] },
    customBooks: [{ id: 'zz-test', name: 'ZZ测试词书' }],
    selectedBook: 'personal'
  },
  review: {
    rev: 1,
    review: { alpha: { due: '2026-10-06', lastTape: '2026-10-05', added: '2026-10-05' } }
  },
  entries: {
    rev: 1,
    entries: { alpha: { phonetic: '/ˈælfə/', meaning: '第一个字母；开端', prompts: ['Alpha 是希腊字母表的第一个。'] } }
  },
  translations: {
    rev: 1,
    translations: {
      '@english-wordbook::alpha': {
        current: 0,
        exercises: [{ sentence: 'Alpha is the first.', reference: 'Alpha 是第一个。', structure: '主系表' }]
      }
    }
  },
  betaShard: { rev: 1, updatedAt: '2026-10-05T00:00:00.000Z', word: 'beta', card: { word: 'beta', phonetic: '/ˈbiːtə/', meaning: '第二个字母；测试版' } }
}

function writeFixture(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'words'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'library-index.json'), JSON.stringify(FIXTURE.index))
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(FIXTURE.review))
  fs.writeFileSync(path.join(dir, 'entries.json'), JSON.stringify(FIXTURE.entries))
  fs.writeFileSync(path.join(dir, 'translations.json'), JSON.stringify(FIXTURE.translations))
  fs.writeFileSync(path.join(dir, 'words', 'beta-1.json'), JSON.stringify(FIXTURE.betaShard))
}

export async function runSelfTest(win: BrowserWindow, hooks: SelfTestHooks): Promise<void> {
  try {
    // 1. 设置读写回环
    hooks.saveSettingsPatch({ plan: { dailyNew: 25 }, appearance: { theme: 'dark' } })
    let s = hooks.loadSettings()
    assert(s.plan.dailyNew === 25, '设置写入/读取（plan.dailyNew=25）')
    assert(s.appearance.theme === 'dark', '设置写入/读取（theme=dark）')

    // 2. Key 加密回环
    hooks.saveAiKey('sk-selftest-1234567890')
    assert(hooks.storedKey() === 'sk-selftest-1234567890', 'API Key 加密存储/解密回环')
    s = hooks.loadSettings()
    assert(s.ai.hasKey && s.ai.keyMasked.endsWith('7890'), 'Key 掩码（' + s.ai.keyMasked + '）')

    // 3. 配置不完整时测试连接应给出中文引导（不打网络）
    const bad = await hooks.testAi({ preset: 'custom', baseUrl: '', model: '' })
    assert(!bad.ok && /补全/.test(bad.error ?? ''), '未配置时测试连接返回引导文案')

    // 4. 恢复默认，避免自检数据残留
    hooks.saveAiKey('')
    hooks.saveSettingsPatch({ plan: { dailyNew: 20 }, appearance: { theme: 'light' } })
    s = hooks.loadSettings()
    assert(s.plan.dailyNew === 20 && !s.ai.hasKey, '自检数据已清理')

    // 5. 内置词典与四六级书
    const books = hooks.library.listBooks()
    const cet4 = books.find((b) => b.slug === 'cet4')
    const cet6 = books.find((b) => b.slug === 'cet6')
    assert(!!cet4 && cet4.total === 4544, `内置四级书 4544 词（实际 ${cet4?.total ?? 0}）`)
    assert(!!cet6 && cet6.total === 3991, `内置六级书 3991 词（实际 ${cet6?.total ?? 0}）`)

    // 6. Obsidian 导入器：fixture 全链路（先幂等清理上一次的 fixture 残留）
    hooks.import.cleanup(['personal', 'zz-test'])
    const selftestDir = path.join(process.cwd(), '.selftest')
    const fixtureDir = path.join(selftestDir, 'fixture-data')
    writeFixture(fixtureDir)
    const preview = hooks.import.detect(fixtureDir)
    assert(preview.found && preview.books.length === 2, '导入检测：发现 2 本词书')
    assert(preview.reviewQueue === 1 && preview.translationWords === 1, '导入检测：复习 1 条 / 练习 1 词')
    const result = hooks.import.run(fixtureDir)
    assert(result.addedWords === 3, `导入：新增 3 词（实际 ${result.addedWords}）`)
    assert(result.addedReviews === 1 && result.addedRecords === 1, `导入：复习 ${result.addedReviews} / 记录 ${result.addedRecords}`)

    // 7. 词汇库查询与更新
    const booksAfter = hooks.library.listBooks()
    const personal = booksAfter.find((b) => b.slug === 'personal')
    assert(!!personal && personal.total === 2 && personal.learning === 1, '导入后词书统计（学习中=1）')
    const search = hooks.library.queryWords({ bookId: personal!.id, query: 'alp' })
    assert(search.total === 1 && search.items[0].headword === 'alpha', '搜索「alp」命中 alpha')
    assert(search.items[0].phonetic === '/ˈælfə/', '词条分片音标已导入')
    const alpha = hooks.library.getWord(search.items[0].id)
    assert(!!alpha && alpha.records.length === 1 && alpha.records[0].kind === 'translation', '练习历史已导入')
    assert(!!alpha && alpha.dueDate === '2026-10-06', '复习到期日已导入')
    const fav = hooks.library.updateWord(search.items[0].id, { favorite: 1 })
    assert(!!fav && fav.favorite === 1, '收藏切换')
    const beta = hooks.library.queryWords({ bookId: personal!.id, query: 'beta' })
    assert(beta.total === 1 && beta.items[0].phonetic === '/ˈbiːtə/', 'words/ 分片音标已导入')

    // 8. 清理 fixture 导入数据
    const removed = hooks.import.cleanup(['personal', 'zz-test'])
    assert(removed >= 2, `fixture 数据已清理（移除 ${removed} 本词书）`)

    // 9. 真实 Obsidian 数据检测（只读，不导入）
    const realDir = 'D:\\YYos(ob)\\YYos\\.obsidian\\plugins\\english-wordbook\\data'
    if (fs.existsSync(realDir)) {
      const real = hooks.import.detect(realDir)
      console.log(
        `[lexiflow] selftest 真实数据检测：found=${real.found} books=${real.books.map((b) => b.name + ':' + b.wordCount).join(', ')} review=${real.reviewQueue}`
      )
      if (real.found) assert(real.books.length >= 3, '真实库检测到 ≥3 本词书（personal/cet4/cet6）')
    } else {
      console.log('[lexiflow] selftest 真实库不存在，跳过真实数据检测')
    }

    // 10. 截图：词汇库 + 单词详情
    fs.mkdirSync(selftestDir, { recursive: true })
    await new Promise((r) => setTimeout(r, 500))
    await win.webContents.executeJavaScript("location.hash = '#/vocabulary'")
    await new Promise((r) => setTimeout(r, 1200))
    const vocabShot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(selftestDir, 'm2-vocabulary.png'), vocabShot.toPNG())

    const cet4After = hooks.library.listBooks().find((b) => b.slug === 'cet4')
    const sample = hooks.library.queryWords({ bookId: cet4After!.id, pageSize: 10 })
    const sampleDetail = hooks.library.getWord(sample.items[0].id)
    assert(!!sampleDetail && sampleDetail.phonetic.startsWith('/') && sampleDetail.meaning.length > 0,
      `内置词条典音标释义齐全（${sampleDetail?.headword}: ${sampleDetail?.phonetic}）`)
    await win.webContents.executeJavaScript(`location.hash = '#/vocabulary/word/${sample.items[0].id}'`)
    await new Promise((r) => setTimeout(r, 900))
    const detailShot = await win.webContents.capturePage()
    fs.writeFileSync(path.join(selftestDir, 'm2-word.png'), detailShot.toPNG())
    console.log('[lexiflow] selftest screenshots saved')

    console.log('[lexiflow] selftest OK')
    setTimeout(() => process.exit(0), 200)
  } catch (err) {
    console.error('[lexiflow] selftest FAILED:', err instanceof Error ? err.message : err)
    setTimeout(() => process.exit(1), 200)
  }
}
