import { syncTabBar } from '../../services/tabbar'
import { errMsg } from '../../lib/feedback'
import {
  planPaperPage,
  planJournalStartPage,
  newSeed,
  FEED_MAX_PAGES,
  EMPTY_STOP,
} from '../../lib/feed-plan'
import {
  formatMetric,
  formatIF,
  formatCount,
  relativeTime,
  parseQuartile,
  coverColor,
  initial,
  authorsLine as fmtAuthors,
} from '../../lib/format'
import { searchPapers, Paper } from '../../services/api/papers'
import { listJournals, JournalUnified } from '../../services/api/journals'
import { listNews, NewsCard } from '../../services/api/news'
import { addFavorite, removeFavorite, listFolders, LibraryFolder } from '../../services/api/library'
import { isLoggedIn, onAuthChange } from '../../store/auth'
import { ensureLogin } from '../../services/auth'
import { appendPatch } from '../../lib/setdata'
import { ICONS } from '../../lib/icons'
import { reportActivity } from '../../services/activity'

type Mode = 'papers' | 'journals' | 'news'

// 渲染窗口:swiper 数组保持全长(索引稳定,current 不重映射不跳帧),但只有 current±R 的
// swiper-item 才用 wx:if 渲染卡片内容,远处 unmount → DOM 有界(见体检 P1)。配合追加式 setData 过桥也有界。
const WIN_RADIUS = 6

interface Badge { text: string; kind: string }
interface Metric { label: string; value: string }

interface PaperVM {
  paperId: string
  source: string
  title: string
  abstract: string
  metaLine: string
  cover: string
  coverBg: string
  badges: Badge[]
  metrics: Metric[]
  authorsLine: string
  fav: boolean
}
interface JournalVM {
  id: number
  name: string
  scope: string
  cover: string
  coverBg: string
  badges: Badge[]
  metrics: Metric[]
}
interface NewsVM {
  slug: string
  title: string
  summary: string
  sectionLabel: string
  timeText: string
  cover: string
  featured: boolean
  heat: string
  surge: boolean
  sourceLabel: string
}

interface ModeState {
  page: number
  hasMore: boolean
  seed: number
  loaded: boolean
  loading: boolean
  seen: Set<string>
}

const state: Record<Mode, ModeState> = {
  papers: { page: 0, hasMore: true, seed: newSeed(), loaded: false, loading: false, seen: new Set() },
  journals: { page: 0, hasMore: true, seed: newSeed(), loaded: false, loading: false, seen: new Set() },
  news: { page: 1, hasMore: true, seed: 0, loaded: false, loading: false, seen: new Set() },
}
// 各模式已构建的卡片(内存缓存,切 tab 秒回)。
const cache: { papers: PaperVM[]; journals: JournalVM[]; news: NewsVM[] } = {
  papers: [],
  journals: [],
  news: [],
}
// 论文原始对象(收藏需整篇快照)。
const paperById = new Map<string, Paper>()
// 文献集文件夹缓存(收藏选夹用)。
let folderCache: LibraryFolder[] | null = null

// 账号切换/登出:清模块级缓存避免串账号(见体检 A5),并置脏 → 下次 onShow 重载。
let feedDirty = false
onAuthChange(() => {
  cache.papers.length = 0
  cache.journals.length = 0
  cache.news.length = 0
  ;(['papers', 'journals', 'news'] as Mode[]).forEach((m) => {
    state[m].page = m === 'news' ? 1 : 0
    state[m].hasMore = true
    state[m].loaded = false
    state[m].seen = new Set()
  })
  folderCache = null
  paperById.clear()
  feedDirty = true
})

function buildPaperVM(p: Paper, fallbackSource: string): PaperVM {
  const badges: Badge[] = []
  if (p.isOpenAccess) badges.push({ text: '开放获取', kind: 'oa' })
  ;(p.fieldsOfStudy || []).slice(0, 2).forEach((f) => badges.push({ text: f, kind: 'field' }))
  const metrics: Metric[] = [
    { label: '被引', value: formatMetric(p.citationCount) },
    { label: '参考文献', value: formatMetric(p.referenceCount) },
    { label: '高影响引用', value: formatMetric(p.influentialCitationCount) },
    { label: '发表年份', value: p.year ? String(p.year) : '—' },
  ]
  const authorsLine = fmtAuthors(p.authors, { max: 2, suffix: ' 等 {n} 位作者' }) || '未知作者'
  const venue = p.venue || '未知来源'
  const metaLine = p.publicationDate
    ? venue + ' · ' + p.publicationDate
    : p.year
    ? venue + ' · ' + p.year
    : venue
  return {
    paperId: p.paperId,
    source: p.source || fallbackSource,
    title: p.title,
    abstract: p.abstract || '该论文暂无摘要',
    metaLine,
    cover: initial(venue),
    coverBg: coverColor(venue),
    badges,
    metrics,
    authorsLine,
    fav: !!p.isFavorited,
  }
}

function buildJournalVM(j: JournalUnified): JournalVM {
  const badges: Badge[] = []
  if (j.jcr_quartile) badges.push({ text: 'JCR ' + j.jcr_quartile, kind: 'jcr' })
  if (j.jcr_impact_factor) badges.push({ text: 'IF ' + formatIF(j.jcr_impact_factor), kind: 'if' })
  const fqb = parseQuartile(j.fqb_major_quartile)
  if (fqb) badges.push({ text: '中科院' + fqb, kind: 'fqb' })
  const xr = parseQuartile(j.xr_major_quartile)
  if (xr) badges.push({ text: '新锐' + xr, kind: 'xr' })
  if (j.ccf_rank) badges.push({ text: 'CCF ' + j.ccf_rank.toUpperCase(), kind: 'ccf' })
  if (j.gjqk_warning_level) badges.push({ text: '预警 ' + j.gjqk_warning_level, kind: 'warn' })
  if (j.openalex_is_oa === 1 || j.openalex_is_oa === true) badges.push({ text: '开放获取', kind: 'oa' })

  const metrics: Metric[] = [
    { label: 'H 指数', value: j.openalex_h_index ? String(j.openalex_h_index) : '—' },
    { label: '累计发文', value: j.openalex_works_count ? formatCount(j.openalex_works_count) : '—' },
  ]
  if (j.scirev_first_review_months) {
    metrics.push({ label: '平均初审', value: j.scirev_first_review_months + ' 个月' })
  } else if (j.scimago_sjr) {
    metrics.push({ label: 'SJR', value: j.scimago_sjr })
  }
  const scopeParts = [j.wikidata_label_zh, j.fqb_major_category, j.crossref_publisher].filter(Boolean)
  return {
    id: j.id,
    name: j.canonical_name,
    scope: scopeParts.join(' · '),
    cover: initial(j.canonical_name),
    coverBg: coverColor(j.canonical_name),
    badges,
    metrics,
  }
}

function buildNewsVM(n: NewsCard): NewsVM {
  const metaParts: string[] = []
  if (n.sources && n.sources[0] && n.sources[0].label) metaParts.push('来源 · ' + n.sources[0].label)
  return {
    slug: n.slug,
    title: n.title,
    summary: n.summary || '',
    sectionLabel: n.section_label || '情报',
    timeText: relativeTime(n.published_at),
    cover: n.cover_image || '',
    featured: !!n.is_featured,
    heat: n.heat_external && n.heat_external > 0 ? String(n.heat_external) : '',
    surge: (n.heat_trend || 0) >= 5,
    sourceLabel: metaParts.join(''),
  }
}

Page({
  data: {
    ic: ICONS,
    mode: 'papers' as Mode,
    index: 0,
    winLo: -WIN_RADIUS, // 渲染窗口 [winLo, winHi](wx:for 的 index 落区间内才渲染卡片)
    winHi: WIN_RADIUS,
    loading: false,
    error: '',
    papers: [] as PaperVM[],
    journals: [] as JournalVM[],
    news: [] as NewsVM[],
  },

  onUserActivity() {
    reportActivity()
  },

  onShow() {
    reportActivity()
    syncTabBar(0)
    if (feedDirty) {
      // 账号变过 → 清屏重载,避免带上一个账号的收藏/已读态。
      feedDirty = false
      this.setData({ papers: [], journals: [], news: [], index: 0, winLo: -WIN_RADIUS, winHi: WIN_RADIUS })
      this.loadMode(this.data.mode)
    }
  },

  onShareAppMessage() {
    reportActivity()
    return { title: 'Scholay 学术 · 论文 / 期刊 / 情报检索', path: '/pages/feed/feed' }
  },

  onLoad() {
    this.loadMode('papers')
  },

  switchMode(e: WechatMiniprogram.TouchEvent) {
    const mode = e.currentTarget.dataset.mode as Mode
    if (mode === this.data.mode) return
    this.setData({ mode, index: 0, winLo: -WIN_RADIUS, winHi: WIN_RADIUS, error: '' })
    if (!state[mode].loaded) {
      this.loadMode(mode)
    }
  },

  async loadMode(mode: Mode) {
    const s = state[mode]
    if (s.loading || !s.hasMore) return
    s.loading = true
    this.setData({ loading: cache[mode].length === 0, error: '' })
    try {
      if (mode === 'papers') await this.loadPapers()
      else if (mode === 'journals') await this.loadJournals()
      else await this.loadNews()
      s.loaded = true
    } catch (e) {
      if (cache[mode].length === 0) this.setData({ error: errMsg(e, '加载失败') })
    } finally {
      s.loading = false
      this.setData({ loading: false })
    }
  },

  async loadPapers() {
    const s = state.papers
    let emptyRun = 0
    // 冷启动首屏:一次 loadMore 拉 1 页,拉到有内容为止(最多试几页,避免首屏空)。
    const coldStart = cache.papers.length === 0
    // 单次检索超时:后端实测 <2s,故设短超时 —— 命中 DevTools 首个 localhost 请求偶发挂起时
    // 快速失败并换下一「源/主题」重试(feed 每页轮换 stc/olx/pmd + 不同 topic),而不是整屏报错干等。
    const perTryTimeout = coldStart ? 15000 : undefined
    let lastErr: unknown = null
    for (let tries = 0; tries < (cache.papers.length ? 1 : 4); tries++) {
      if (s.page >= FEED_MAX_PAGES) {
        s.hasMore = false
        break
      }
      const plan = planPaperPage(s.seed, s.page)
      s.page++
      let list: Paper[]
      try {
        list = await searchPapers(plan, perTryTimeout)
      } catch (e) {
        // 某源超时/网络抖动:记下错误,换下一源再试(冷启动挂起多是首个请求的偶发,重试即恢复)。
        lastErr = e
        if (cache.papers.length === 0 && tries < 3) continue
        break
      }
      let added = 0
      for (const p of list) {
        if (!p.paperId || !p.title || s.seen.has(p.paperId)) continue
        s.seen.add(p.paperId)
        if (!p.source) p.source = plan.source
        paperById.set(p.paperId, p)
        cache.papers.push(buildPaperVM(p, plan.source))
        added++
      }
      if (added === 0) {
        emptyRun++
        if (emptyRun >= EMPTY_STOP) {
          s.hasMore = false
          break
        }
      } else {
        emptyRun = 0
        break
      }
    }
    const base = this.data.papers.length
    if (cache.papers.length > base) this.setData(appendPatch('papers', base, cache.papers.slice(base)))
    // 一篇都没拿到且确有错误 → 抛出让 loadMode 落错误态(否则空转会被当成「暂无内容」)。
    else if (cache.papers.length === 0 && lastErr) throw lastErr
  },

  async loadJournals() {
    const s = state.journals
    const start = planJournalStartPage(s.seed)
    const page = start + s.page
    s.page++
    const resp = await listJournals(page, 10)
    for (const row of resp.rows || []) {
      const j = row.unified
      if (!j || !j.id || s.seen.has(String(j.id))) continue
      s.seen.add(String(j.id))
      cache.journals.push(buildJournalVM(j))
    }
    s.hasMore = !!resp.hasMore
    const base = this.data.journals.length
    if (cache.journals.length > base) this.setData(appendPatch('journals', base, cache.journals.slice(base)))
  },

  async loadNews() {
    const s = state.news
    const resp = await listNews('latest', s.page, 8)
    s.page++
    for (const n of resp.items || []) {
      if (!n.slug || s.seen.has(n.slug)) continue
      s.seen.add(n.slug)
      cache.news.push(buildNewsVM(n))
    }
    s.hasMore = !!resp.has_more
    const base = this.data.news.length
    if (cache.news.length > base) this.setData(appendPatch('news', base, cache.news.slice(base)))
  },

  onSwiperChange(e: WechatMiniprogram.SwiperChange) {
    const index = e.detail.current
    // 滑动窗口:只 setData 三个数字(index + 窗口边界),WXML 据此切换远处卡片的 wx:if 渲染。
    this.setData({ index, winLo: index - WIN_RADIUS, winHi: index + WIN_RADIUS })
    const mode = this.data.mode
    const total = cache[mode].length
    if (index >= total - 2 && state[mode].hasMore && !state[mode].loading) {
      this.loadMode(mode)
    }
  },

  async onPullDownRefresh() {
    const mode = this.data.mode
    const s = state[mode]
    s.seed = newSeed()
    s.page = mode === 'news' ? 1 : 0
    s.hasMore = true
    s.seen = new Set()
    cache[mode] = []
    this.setData({ index: 0, [mode]: [] })
    await this.loadMode(mode)
    wx.stopPullDownRefresh()
  },

  retry() {
    this.loadMode(this.data.mode)
  },

  goPaper(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.navigateTo({ url: '/pages/paper/paper?id=' + encodeURIComponent(id) })
  },
  goJournal(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.navigateTo({ url: '/pages/journal/journal?id=' + id })
  },
  goNews(e: WechatMiniprogram.TouchEvent) {
    const slug = e.currentTarget.dataset.slug as string
    wx.navigateTo({ url: '/pages/news/news?slug=' + encodeURIComponent(slug) })
  },
  goSearch() {
    const mode = this.data.mode === 'journals' ? 'journals' : 'papers'
    wx.navigateTo({ url: '/pages/search/search?mode=' + mode })
  },
  onFilterSoon() {
    wx.showToast({ title: '筛选即将上线', icon: 'none' })
  },

  async toggleFav(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    const idx = Number(e.currentTarget.dataset.index)
    const raw = paperById.get(id)
    const cur = cache.papers[idx]
    if (!raw || !cur) return
    if (!isLoggedIn()) {
      try {
        await ensureLogin()
      } catch {
        return
      }
    }
    if (cur.fav) {
      // 取消收藏
      cur.fav = false
      this.setData({ ['papers[' + idx + '].fav']: false })
      try {
        await removeFavorite(raw.source || cur.source, raw.paperId)
        wx.showToast({ title: '已取消收藏', icon: 'none' })
      } catch (err) {
        cur.fav = true
        this.setData({ ['papers[' + idx + '].fav']: true })
        wx.showToast({ title: (err as Error).message || '操作失败', icon: 'none' })
      }
      return
    }
    // 收藏:多文件夹时先选夹
    const folders = await this.getFolders()
    if (folders.length > 1) {
      wx.showActionSheet({
        itemList: folders.map((f) => f.name + (f.is_default ? '(默认)' : '')),
        success: (r) => this.doFav(idx, raw, folders[r.tapIndex].id),
      })
    } else {
      this.doFav(idx, raw, undefined)
    }
  },

  async getFolders(): Promise<LibraryFolder[]> {
    if (folderCache) return folderCache
    try {
      folderCache = await listFolders()
    } catch {
      folderCache = []
    }
    return folderCache
  },

  async doFav(idx: number, raw: Paper, folderId?: number) {
    cache.papers[idx].fav = true
    this.setData({ ['papers[' + idx + '].fav']: true })
    try {
      await addFavorite(raw, folderId)
      wx.showToast({ title: '已收藏', icon: 'none' })
    } catch (err) {
      cache.papers[idx].fav = false
      this.setData({ ['papers[' + idx + '].fav']: false })
      wx.showToast({ title: (err as Error).message || '收藏失败', icon: 'none' })
    }
  },
})
