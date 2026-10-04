import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {
  AppSettings,
  SettingsPatch,
  AiTestResult,
  ImportPreview,
  ImportResult,
  WordListResult,
  WordDetailData,
  BookSummary,
  TodaySummary,
  CustomTaskItem,
  MasteryData,
  GradeScores
} from '../shared/types'

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

interface TaskHooks {
  list: () => CustomTaskItem[]
  add: (kind: string, title: string, target: string) => CustomTaskItem[]
  toggle: (id: number, done: boolean) => CustomTaskItem[]
  remove: (id: number) => CustomTaskItem[]
}

interface StudyHooks {
  summary: (bookId?: number) => TodaySummary
  queue: (bookId?: number) => number[]
  selectBook: (bookId: number) => void
  genPrompts: (wordId: number) => Promise<{ prompts: string[] }>
  tasks: TaskHooks
  favs: {
    list: (wordId: number) => Array<{ id: number; wordId: number; sentence: string; source: string; createdAt: string }>
    add: (wordId: number, sentence: string, source: string) => Array<{ id: number }>
    remove: (id: number) => Array<{ id: number }>
  }
}

interface ReviewHooks {
  queue: () => { items: Array<{ wordId: number; headword: string; reason: string }>; counts: Record<string, number>; total: number }
  graduate: (wordId: number) => void
  tape: (wordId: number) => void
  seed: (wordId: number, dueDate: string) => void
}

interface MasteryHooks {
  applyGradeToMastery: (prev: MasteryData, g: GradeScores) => MasteryData
  average: (m: MasteryData) => number
}

export interface SelfTestHooks {
  loadSettings: () => AppSettings
  saveSettingsPatch: (patch: SettingsPatch) => AppSettings
  testAi: (cfg?: Partial<{ preset: string; baseUrl: string; apiKey: string; model: string }>) => Promise<AiTestResult>
  saveAiKey: (plain: string) => void
  storedKey: () => string
  library: LibraryHooks
  import: ImportHooks
  study: StudyHooks
  review: ReviewHooks
  parse: {
    mcq: (text: string) => { stem: string; options: string[]; answer: number; explanation: string } | null
  }
  mastery: MasteryHooks
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
    // 0. 快照用户真实配置——自检绝不能破坏用户已保存的 Key 和设置
    const snap = hooks.loadSettings()
    const snapKey = hooks.storedKey()

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

    // 4. 恢复用户真实配置（Key 原样放回，设置原样写回）
    hooks.saveAiKey(snapKey)
    hooks.saveSettingsPatch({
      ai: { preset: snap.ai.preset, baseUrl: snap.ai.baseUrl, model: snap.ai.model },
      plan: snap.plan,
      appearance: snap.appearance
    })
    s = hooks.loadSettings()
    assert(hooks.storedKey() === snapKey, '用户 API Key 已原样恢复')
    assert(
      s.plan.dailyNew === snap.plan.dailyNew &&
        s.appearance.theme === snap.appearance.theme &&
        s.ai.baseUrl === snap.ai.baseUrl,
      '用户设置已原样恢复'
    )

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

    // 9.5 掌握度规则
    const m1 = hooks.mastery.applyGradeToMastery({}, { usage: 4, grammar: 5, collocation: 3, naturalness: 4 })
    assert(m1.recognition === 1 && m1.comprehension === 4 && m1.production === 4 && m1.transfer === 4,
      `掌握度规则（首评 4/5/3/4 → 识别${m1.recognition} 理解${m1.comprehension} 使用${m1.production} 迁移${m1.transfer}）`)
    const m2 = hooks.mastery.applyGradeToMastery(m1, { usage: 2, grammar: 2, collocation: 2, naturalness: 2 })
    assert(m2.recognition === 2 && m2.production === 4 && m2.transfer === 4, '掌握度只升不降')
    assert(hooks.mastery.average({ recognition: 5, comprehension: 5, production: 5, transfer: 5 }) === 5, '掌握度均分')

    // 9.6 今日学习：摘要 / 队列 / 自定义任务
    hooks.study.selectBook(hooks.library.listBooks().find((b) => b.slug === 'cet4')!.id)
    const sum = hooks.study.summary()
    assert(sum.bookName === '大学英语四级词书' && sum.newRemaining === 20 && sum.totalWords === 4544,
      `今日摘要（新词 ${sum.newRemaining} / 全书 ${sum.totalWords}）`)
    const q = hooks.study.queue()
    assert(q.length === 20, `今日队列 20 词（实际 ${q.length}）`)
    let tasks = hooks.study.tasks.add('reading', '六级阅读', '1 篇')
    assert(tasks.length === 1 && tasks[0].doneToday === false, '自定义任务：添加')
    tasks = hooks.study.tasks.toggle(tasks[0].id, true)
    assert(tasks[0].doneToday === true, '自定义任务：打卡')
    tasks = hooks.study.tasks.toggle(tasks[0].id, false)
    assert(tasks[0].doneToday === false, '自定义任务：取消打卡')
    tasks = hooks.study.tasks.remove(tasks[0].id)
    assert(tasks.length === 0, '自定义任务：删除')

    // 9.65 AI 生成提示：未配置时给出引导（已配置则跳过，不打真实 API）
    const aiCfg = hooks.loadSettings().ai
    if (!aiCfg.hasKey || !aiCfg.baseUrl) {
      try {
        await hooks.study.genPrompts(q[0])
        assert(false, '未配置 AI 时生成提示应当报错')
      } catch (e) {
        assert(/配置/.test(e instanceof Error ? e.message : String(e)), '未配置 AI 时生成提示给出引导文案')
      }
    } else {
      console.log('[lexiflow] selftest AI 已配置，跳过生成提示的未配置断言')
    }

    // 9.7 句子收藏（去重 + 删除）
    const favTarget = q[0]
    let favs = hooks.study.favs.add(favTarget, 'The road ended abruptly.', 'revised')
    assert(favs.length === 1 && favs[0].source === 'revised', '句子收藏：添加')
    favs = hooks.study.favs.add(favTarget, 'The road ended abruptly.', 'revised')
    assert(favs.length === 1, '句子收藏：重复添加自动去重')
    favs = hooks.study.favs.remove(favs[0].id)
    assert(favs.length === 0, '句子收藏：删除')

    // 9.8 复习队列：种子 → 薄弱分组 → 毕业/胶带 → 清理
    hooks.review.seed(q[0], '2026-10-04')
    hooks.review.seed(q[1], '2026-10-04')
    const rq = hooks.review.queue()
    assert(rq.total >= 2, `复习队列到期词 ≥2（实际 ${rq.total}）`)
    const mine = rq.items.filter((i) => i.wordId === q[0] || i.wordId === q[1])
    assert(mine.length === 2 && mine.every((i) => i.reason === 'relearn'), '薄弱分组：无批改记录归「需要重新理解」')
    hooks.review.graduate(q[0])
    assert(hooks.review.queue().items.every((i) => i.wordId !== q[0]), '毕业出队（不再出现在到期队列）')
    hooks.review.tape(q[1])
    assert(hooks.review.queue().items.every((i) => i.wordId !== q[1]), '胶带 = 明天再来（今日到期消失）')
    hooks.review.graduate(q[1])
    assert(hooks.review.queue().items.every((i) => i.wordId !== q[0] && i.wordId !== q[1]), '种子已清理')

    // 9.9 选择题解析回归（修复：批改解析器要求 issues 字段，导致选择类练习全部「格式异常」）
    const mcq1 = hooks.parse.mcq(
      '{"stem":"The ____ changed suddenly.","options":["weather","whether","wether","weater"],"answer":0,"explanation":"weather 是天气。"}'
    )
    assert(!!mcq1 && mcq1.answer === 0 && mcq1.options.length === 4, 'MCQ 解析：纯 JSON（answer=0）')
    const mcq2 = hooks.parse.mcq(
      '好的，下面是题目：\n```json\n{"stem":"a ____ b","options":["x","y","z","w"],"answer":2,"explanation":"选 z"}\n```\n希望有帮助'
    )
    assert(!!mcq2 && mcq2.answer === 2, 'MCQ 解析：围栏+前后杂文（answer=2）')
    assert(hooks.parse.mcq('这不是 JSON') === null, 'MCQ 解析：坏输入返回 null')
    assert(hooks.parse.mcq('{"stem":"x","options":["a","b","c"],"answer":0}') === null, 'MCQ 解析：选项不足 4 个拒绝')

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

    // 11. 截图：今日学习 + 单词学习会话 + 复习 + 练习中心
    await win.webContents.executeJavaScript("location.hash = '#/today'")
    await new Promise((r) => setTimeout(r, 1000))
    fs.writeFileSync(path.join(selftestDir, 'm3-today.png'), (await win.webContents.capturePage()).toPNG())
    await win.webContents.executeJavaScript("location.hash = '#/today/study'")
    await new Promise((r) => setTimeout(r, 1000))
    fs.writeFileSync(path.join(selftestDir, 'm3-study.png'), (await win.webContents.capturePage()).toPNG())
    hooks.review.seed(q[0], '2026-10-04')
    hooks.review.seed(q[1], '2026-10-04')
    await win.webContents.executeJavaScript("location.hash = '#/today/review'")
    await new Promise((r) => setTimeout(r, 1200))
    const reviewText = (await win.webContents.executeJavaScript('document.body.innerText')) as string
    assert(/复习|造句|毕业|返回今日学习/.test(reviewText), '复习页渲染出内容（DOM 文本断言）')
    fs.writeFileSync(path.join(selftestDir, 'm4-review.png'), (await win.webContents.capturePage()).toPNG())
    hooks.review.graduate(q[0])
    hooks.review.graduate(q[1])
    await win.webContents.executeJavaScript("location.hash = '#/today/practice'")
    await new Promise((r) => setTimeout(r, 800))
    const practiceText = (await win.webContents.executeJavaScript('document.body.innerText')) as string
    assert(/单词练习|中译英|语境选词|自由表达/.test(practiceText), '练习中心渲染出内容（DOM 文本断言）')
    fs.writeFileSync(path.join(selftestDir, 'm4-practice.png'), (await win.webContents.capturePage()).toPNG())
    console.log('[lexiflow] selftest screenshots saved')

    console.log('[lexiflow] selftest OK')
    setTimeout(() => process.exit(0), 200)
  } catch (err) {
    console.error('[lexiflow] selftest FAILED:', err instanceof Error ? err.message : err)
    setTimeout(() => process.exit(1), 200)
  }
}
