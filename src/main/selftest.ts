import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getDb } from './db'
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
  profile: (wordId: number) => Promise<{ profile: { definitions: string[]; examples: Array<{ en: string; zh: string }> }; cached: boolean }>
  tasks: TaskHooks
  favs: {
    list: (wordId: number) => Array<{ id: number; wordId: number; sentence: string; source: string; createdAt: string }>
    add: (wordId: number, sentence: string, source: string) => Array<{ id: number }>
    remove: (id: number) => Array<{ id: number }>
  }
}

interface ReviewHooks {
  queue: () => { items: Array<{ wordId: number; headword: string; reason: string }>; counts: Record<string, number>; total: number; graduateLine: number }
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
  stats: {
    summary: (days: number | null) => {
      studyMinutes: number
      newMastered: number
      gradedCount: number
      gradeAvg: number
      mcqTotal: number
      mcqCorrect: number
      reviewGraduated: number
      reviewTaped: number
      topMistakes: Array<{ word: string; count: number }>
      tasksDone: Array<{ kind: string; count: number }>
      mastery: { unlearned: number; learning: number; mastered: number }
      readingArticles: number
      readingChars: number
      listeningMinutes: number
    }
    seed: () => { wordId: number }
    cleanup: () => void
    cleanupReviewEvents: (wordIds: number[]) => void
    cleanupReading: (articleId: number) => void
  }
  reading: {
    list: () => Array<{ id: number; title: string; content: string; chars: number }>
    create: (title: string, content: string, source: string) => { id: number; title: string; chars: number }
    delete: (id: number) => void
    log: (id: number) => void
    lookup: (word: string, bookId?: number) => { word: string; found: boolean; phonetic: string; meaning: string; inBook: boolean; wordId?: number; bookId: number }
    addWord: (headword: string, bookId?: number) => { word: { id: number } | null; added: boolean }
    translate: (text: string) => Promise<{ translated: string; cached: boolean }>
  }
  music: {
    list: () => Array<{ id: number; title: string; audioFile: string; textContent: string; segments: string[]; notes: string }>
    importFromPath: (srcPath: string) => { id: number; title: string; audioFile: string }
    setText: (id: number, text: string) => { id: number; textContent: string }
    setNotes: (id: number, notes: string) => { id: number; notes: string }
    words: (id: number) => Array<{ word: string; meaning: string; inBook: boolean }>
    remove: (id: number) => Array<{ id: number }>
    tick: (seconds: number) => void
    untick: (seconds: number) => void
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
    assert(sum.bookName === '大学英语四级词书' && sum.totalWords === 4544 && sum.dailyNew === 20,
      `今日摘要（全书 ${sum.totalWords} / 每日 ${sum.dailyNew}）`)
    assert(sum.newRemaining >= 0 && sum.newRemaining <= sum.dailyNew, `今日剩余新词按计划计数（${sum.newRemaining}）`)
    const q = hooks.study.queue()
    assert(q.length === Math.min(sum.dailyNew, sum.totalWords - sum.learnedWords), `今日队列 ${q.length} 词（≤ 每日新词量）`)
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
    hooks.stats.cleanupReviewEvents([q[0], q[1]])

    // 9.85 学习计划调节：词汇量（每日新词）/ 复习上限 / 复习强度（毕业线）
    const planSnap = hooks.loadSettings().plan
    hooks.saveSettingsPatch({ plan: { dailyNew: 3 } })
    assert(hooks.study.queue().length === 3, '计划调节：每日新词量=3 → 学习队列跟随')
    hooks.saveSettingsPatch({ plan: { dailyReviewLimit: 1 } })
    hooks.review.seed(q[0], '2026-10-04')
    hooks.review.seed(q[1], '2026-10-04')
    assert(hooks.review.queue().total === 1, `计划调节：复习上限=1 → 复习队列 1 词（实际 ${hooks.review.queue().total}）`)
    hooks.review.graduate(q[0])
    hooks.review.graduate(q[1])
    hooks.saveSettingsPatch({ plan: { reviewIntensity: 1 } })
    assert(hooks.review.queue().graduateLine === 3, '计划调节：强度=轻松 → 毕业线 3.0')
    hooks.saveSettingsPatch({ plan: { reviewIntensity: 5 } })
    assert(hooks.review.queue().graduateLine === 4, '计划调节：强度=强化 → 毕业线 4.0')
    hooks.stats.cleanupReviewEvents([q[0], q[1]])
    hooks.saveSettingsPatch({ plan: planSnap })
    assert(
      hooks.loadSettings().plan.dailyNew === planSnap.dailyNew && hooks.study.queue().length === Math.min(planSnap.dailyNew, sum.totalWords - sum.learnedWords),
      '计划调节：用户原计划已恢复'
    )

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

    // 9.95 统计分析：幂等预清理 → seed → 断言聚合 → 清理
    hooks.stats.cleanup() // 上次失败运行可能留下 seed 残留，先清掉保证基线干净
    const baseline = hooks.stats.summary(7)
    hooks.stats.seed()
    const st = hooks.stats.summary(7)
    assert(
      st.studyMinutes >= baseline.studyMinutes + 2,
      `统计：学习时长 +2 分钟（${baseline.studyMinutes} → ${st.studyMinutes}）`
    )
    // 真实库里已有其他批改记录，分数未知：断言「新增 4.0 分记录后，均值落在 [基线,4.0] 区间内」
    const lo = Math.min(baseline.gradeAvg, 4) - 0.1
    const hi = Math.max(baseline.gradeAvg, 4) + 0.1
    assert(
      st.gradedCount === baseline.gradedCount + 1 && st.gradeAvg >= lo && st.gradeAvg <= hi,
      `统计：批改次数 +1、均值含新记录（${baseline.gradeAvg} → ${st.gradeAvg}）`
    )
    assert(st.mcqTotal === baseline.mcqTotal + 5 && st.mcqCorrect === baseline.mcqCorrect + 4,
      '统计：选择题准确率（+4/5，造句类不计入）')
    assert(st.reviewGraduated === baseline.reviewGraduated + 1, '统计：复习毕业 +1')
    assert(st.topMistakes.some((m) => m.count >= 2), '统计：高频错误词含 2 个错误点')
    hooks.stats.cleanup()
    const cleaned = hooks.stats.summary(7)
    assert(
      cleaned.gradedCount === baseline.gradedCount && cleaned.mcqTotal === baseline.mcqTotal &&
        cleaned.reviewGraduated === baseline.reviewGraduated && cleaned.studyMinutes === baseline.studyMinutes,
      '统计：seed 数据已清理'
    )

    // 9.96 阅读：导入 → 查词 → 入词库 → 阅读量 → 删除（连带清理）
    const baselineM6 = hooks.stats.summary(7)
    const article = hooks.reading.create(
      'M6 自检文章',
      'The road ended abruptly. A curious cat watched the rain.',
      'paste'
    )
    assert(article.id > 0 && article.chars > 20, `阅读：导入文章（${article.chars} 字符）`)
    assert(hooks.reading.list().some((a) => a.id === article.id), '阅读：列表包含新文章')
    const lookup = hooks.reading.lookup('abruptly')
    assert(lookup.found && lookup.phonetic.startsWith('/') && lookup.meaning.length > 0, `阅读：点词查义（abruptly ${lookup.phonetic}）`)
    assert(hooks.reading.lookup('curious').found, '阅读：点词查义（curious）')
    const existed = hooks.reading.addWord('abruptly')
    assert(!existed.added && !!existed.word, '阅读：已在词库的词不重复添加')
    const created = hooks.reading.addWord('zqxselftestword')
    assert(created.added && !!created.word, '阅读：生词加入词库')
    getDb().prepare("DELETE FROM words WHERE headword = 'zqxselftestword'").run()
    hooks.reading.log(article.id)
    const withReading = hooks.stats.summary(7)
    assert(
      withReading.readingChars === baselineM6.readingChars + article.chars &&
        withReading.readingArticles >= baselineM6.readingArticles + 1,
      `阅读：阅读量 +${article.chars} 字符`
    )
    hooks.reading.delete(article.id)
    const afterDelete = hooks.stats.summary(7)
    assert(
      afterDelete.readingChars === baselineM6.readingChars && !hooks.reading.list().some((a) => a.id === article.id),
      '阅读：删除文章（统计同步回退）'
    )

    // 9.965 阅读增强：翻译缓存（本地命中，不打 AI）+ 自定义书加词进学习队列
    const srcText = 'Selftest cached sentence for translation.'
    const srcHash = crypto.createHash('md5').update(srcText).digest('hex')
    getDb()
      .prepare('INSERT OR REPLACE INTO translation_cache (hash, source, translated) VALUES (?, ?, ?)')
      .run(srcHash, srcText, '自检缓存译文。')
    const tr = await hooks.reading.translate(srcText)
    assert(tr.cached && tr.translated === '自检缓存译文。', '阅读：整段翻译命中本地缓存（不打 AI）')
    getDb().prepare('DELETE FROM translation_cache WHERE hash = ?').run(srcHash)
    const customBookId = hooks.library.createBook('M6自检自定义书')
    assert(hooks.reading.lookup('abruptly', customBookId).inBook === false, '自定义书：查词按所选书判断')
    const addedCustom = hooks.reading.addWord('lexiflowcustomword', customBookId)
    assert(addedCustom.added && !!addedCustom.word, '自定义书：生词加入')
    const customList = hooks.library.queryWords({ bookId: customBookId })
    assert(customList.total === 1 && customList.items[0].status === 0 && customList.items[0].headword === 'lexiflowcustomword',
      '自定义书：新词状态=未学习（可进入造句训练队列）')
    assert(hooks.reading.lookup('lexiflowcustomword', customBookId).inBook === true, '自定义书：加入后查词状态正确')
    hooks.library.deleteBook(customBookId)
    assert(hooks.library.queryWords({ bookId: customBookId }).total === 0, '自定义书：删除后词条清理')

    // 9.91 单词详情增强：AI 词条缓存（本地命中，不打 AI）+ 手动标记已掌握补时间戳
    const profWordId = q[0]
    getDb()
      .prepare("INSERT INTO learning_records (word_id, kind, payload) VALUES (?, 'ai_profile', ?)")
      .run(
        profWordId,
        JSON.stringify({
          profile: {
            definitions: ['自检释义'],
            examples: [{ en: 'Selftest example.', zh: '自检例句。' }],
            collocations: [],
            related: [],
            forms: []
          }
        })
      )
    const prof = await hooks.study.profile(profWordId)
    assert(prof.cached && prof.profile.definitions[0] === '自检释义', '单词详情：AI 词条命中本地缓存（不打 AI）')
    getDb().prepare("DELETE FROM learning_records WHERE word_id = ? AND kind = 'ai_profile'").run(profWordId)
    const beforeMaster = hooks.library.getWord(q[0])!
    hooks.library.updateWord(q[0], { status: 2 })
    const afterMaster = hooks.library.getWord(q[0])!
    assert(afterMaster.status === 2, '单词详情：标记已掌握')
    hooks.library.updateWord(q[0], { status: beforeMaster.status })

    // 9.97 音乐听力：导入音频 → 听力时间 → 删除（连带删除副本）
    const audioSrc = path.join(selftestDir, 'm6-audio.mp3')
    fs.mkdirSync(selftestDir, { recursive: true })
    fs.writeFileSync(audioSrc, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2048)]))
    const track = hooks.music.importFromPath(audioSrc)
    assert(track.id > 0 && track.audioFile.length > 0, `听力：导入音频（${track.audioFile}）`)
    assert(hooks.music.list().some((t) => t.id === track.id), '听力：列表包含新音频')
    hooks.music.setText(track.id, 'The curious cat watched as the road ended abruptly.')
    assert(hooks.music.list().find((t) => t.id === track.id)?.textContent.length > 0, '听力：文本已保存')
    const trackWords = hooks.music.words(track.id)
    assert(
      trackWords.some((w) => w.word === 'curious' && w.meaning.length > 0) &&
        trackWords.some((w) => w.word === 'abruptly'),
      `听力：生词析出（${trackWords.length} 个词，含 curious/abruptly）`
    )
    hooks.music.setNotes(track.id, '自检笔记：注意连读。')
    assert(hooks.music.list().find((t) => t.id === track.id)?.notes === '自检笔记：注意连读。', '听力：笔记自动保存')
    hooks.music.tick(60)
    const withListen = hooks.stats.summary(7)
    assert(withListen.listeningMinutes === baselineM6.listeningMinutes + 1, `听力：听力时间 +1 分钟（${baselineM6.listeningMinutes} → ${withListen.listeningMinutes}）`)
    hooks.music.untick(60)
    assert(hooks.stats.summary(7).listeningMinutes === baselineM6.listeningMinutes, '听力：听力时间已回退')
    hooks.music.remove(track.id)
    assert(!hooks.music.list().some((t) => t.id === track.id), '听力：删除条目（音频副本同步删除）')

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
    const todayText = (await win.webContents.executeJavaScript('document.body.innerText')) as string
    assert(/学习计划|调整计划/.test(todayText), '今日页含学习计划入口（DOM 文本断言）')
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

    // 12. 截图：统计分析
    await win.webContents.executeJavaScript("location.hash = '#/stats'")
    await new Promise((r) => setTimeout(r, 900))
    const statsText = (await win.webContents.executeJavaScript('document.body.innerText')) as string
    assert(/统计分析|学习时长|练习准确率|高频错误词/.test(statsText), '统计页渲染出内容（DOM 文本断言）')
    fs.writeFileSync(path.join(selftestDir, 'm5-stats.png'), (await win.webContents.capturePage()).toPNG())

    // 13. 截图：阅读 + 音乐听力
    await win.webContents.executeJavaScript("location.hash = '#/reading'")
    await new Promise((r) => setTimeout(r, 900))
    const readingText = (await win.webContents.executeJavaScript('document.body.innerText')) as string
    assert(/阅读|粘贴文章|导入文件/.test(readingText), '阅读页渲染出内容（DOM 文本断言）')
    fs.writeFileSync(path.join(selftestDir, 'm6-reading.png'), (await win.webContents.capturePage()).toPNG())
    await win.webContents.executeJavaScript("location.hash = '#/music'")
    await new Promise((r) => setTimeout(r, 900))
    const musicText = (await win.webContents.executeJavaScript('document.body.innerText')) as string
    assert(/音乐听力|导入 MP3/.test(musicText), '听力页渲染出内容（DOM 文本断言）')
    fs.writeFileSync(path.join(selftestDir, 'm6-music.png'), (await win.webContents.capturePage()).toPNG())
    console.log('[lexiflow] selftest screenshots saved')

    console.log('[lexiflow] selftest OK')
    setTimeout(() => process.exit(0), 200)
  } catch (err) {
    console.error('[lexiflow] selftest FAILED:', err instanceof Error ? err.message : err)
    setTimeout(() => process.exit(1), 200)
  }
}
