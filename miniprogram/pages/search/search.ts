import { searchPapers, Paper, SearchPapersBody } from '../../services/api/papers'
import { errMsg } from '../../lib/feedback'
import { searchJournals, JournalUnified } from '../../services/api/journals'
import { formatMetric, formatIF, parseQuartile, coverColor, initial, authorsLine as fmtAuthors } from '../../lib/format'
import { closeAnimated } from '../../lib/anim'
import { appendPatch } from '../../lib/setdata'
import { reportActivity } from '../../services/activity'
import {
  SearchFilters,
  SearchSource,
  TimeRange,
  DEFAULT_FILTERS,
  SOURCE_OPTIONS,
  TIME_OPTIONS,
  MIN_CITATION_OPTIONS,
  sortOptionsForSource,
  subjectsForSource,
  typesForSource,
  isSubjectsSingle,
  supportsAdvanced,
  resolveYearRange,
  activeFilterCount,
} from '../../lib/search-filters'

type Mode = 'papers' | 'journals'

interface PaperRowVM { paperId: string; title: string; sub: string; cite: string; oa: boolean }
interface JournalRowVM { id: number; name: string; sub: string; badges: string[]; cover: string; coverBg: string }

function buildPaperRow(p: Paper): PaperRowVM {
  const sub = [fmtAuthors(p.authors, { max: 2, suffix: '' }), p.venue, p.year ? String(p.year) : '']
    .filter(Boolean)
    .join(' · ')
  return { paperId: p.paperId, title: p.title, sub, cite: '被引 ' + formatMetric(p.citationCount), oa: !!p.isOpenAccess }
}

function buildJournalRow(j: JournalUnified): JournalRowVM {
  const badges: string[] = []
  if (j.jcr_quartile) badges.push('JCR ' + j.jcr_quartile)
  if (j.jcr_impact_factor) badges.push('IF ' + formatIF(j.jcr_impact_factor))
  const fqb = parseQuartile(j.fqb_major_quartile)
  if (fqb) badges.push('中科院' + fqb)
  const sub = [j.crossref_publisher, j.openalex_country].filter(Boolean).join(' · ')
  return { id: j.id, name: j.canonical_name, sub, badges, cover: initial(j.canonical_name), coverBg: coverColor(j.canonical_name) }
}

Page({
  data: {
    mode: 'papers' as Mode,
    q: '',
    submitted: false,
    papers: [] as PaperRowVM[],
    journals: [] as JournalRowVM[],
    loading: false,
    loadingMore: false,
    hasMore: true,
    empty: false,
    error: '',
    offset: 0,
    page: 1,
    // 高级筛选(仅论文)
    filters: DEFAULT_FILTERS as SearchFilters,
    filterCount: 0,
    showFilter: false,
    closingFilter: false,
    advanced: true,
    sourceOptions: SOURCE_OPTIONS,
    timeOptions: TIME_OPTIONS,
    minCiteOptions: MIN_CITATION_OPTIONS,
    sortOptions: sortOptionsForSource('auto'),
    subjectOptions: subjectsForSource('auto').map((o) => ({ value: o.value, label: o.label, sel: false })),
    typeOptions: typesForSource('auto').map((o) => ({ value: o.value, label: o.label, sel: false })),
  },

  onShow() {
    reportActivity()
  },

  onUserActivity() {
    reportActivity()
  },

  onLoad(query: Record<string, string | undefined>) {
    const mode: Mode = query.mode === 'journals' ? 'journals' : 'papers'
    this.setData({ mode })
    wx.setNavigationBarTitle({ title: mode === 'journals' ? '搜索期刊' : '搜索论文' })
  },

  onInput(e: WechatMiniprogram.Input) {
    reportActivity()
    this.setData({ q: e.detail.value })
  },

  onSearch() {
    reportActivity()
    if (!this.data.q.trim()) return
    this.setData({
      papers: [],
      journals: [],
      offset: 0,
      page: 1,
      hasMore: true,
      submitted: true,
      empty: false,
      error: '',
    })
    this.run(true)
  },

  async run(reset: boolean) {
    this.setData({ loading: reset, loadingMore: !reset })
    try {
      if (this.data.mode === 'papers') await this.runPapers(reset)
      else await this.runJournals(reset)
    } catch (e) {
      this.setData({ error: errMsg(e, '搜索失败') })
    }
    this.setData({ loading: false, loadingMore: false })
  },

  async runPapers(reset: boolean) {
    const offset = reset ? 0 : this.data.offset
    const f = this.data.filters
    const yr = resolveYearRange(f.timeRange)
    const body: SearchPapersBody = { query: this.data.q.trim(), limit: 12, offset, source: f.source, sort: f.sort }
    if (yr.yearFrom) body.yearFrom = yr.yearFrom
    if (yr.yearTo) body.yearTo = yr.yearTo
    if (f.openAccess) body.openAccessPdf = 'true'
    if (f.minCitations > 0) body.minCitationCount = f.minCitations
    if (f.subjects.length) body.fieldsOfStudy = f.subjects
    if (f.types.length) body.publicationTypes = f.types
    const list = await searchPapers(body)
    const vms = list.filter((p) => p.paperId && p.title).map(buildPaperRow)
    const meta = { offset: offset + 12, hasMore: list.length >= 12 }
    if (reset) {
      this.setData({ papers: vms, ...meta, empty: vms.length === 0 })
    } else {
      this.setData(appendPatch('papers', this.data.papers.length, vms, meta)) // 追加不重发整列表
    }
  },

  // ── 筛选 ────────────────────────────────────────────────────────────────
  openFilter() {
    this.setData({ showFilter: true })
  },
  closeFilter() {
    closeAnimated(this, 'showFilter', 'closingFilter')
  },
  renderAdvOptions() {
    const f = this.data.filters
    this.setData({
      subjectOptions: subjectsForSource(f.source).map((o) => ({ ...o, sel: f.subjects.indexOf(o.value) >= 0 })),
      typeOptions: typesForSource(f.source).map((o) => ({ ...o, sel: f.types.indexOf(o.value) >= 0 })),
      advanced: supportsAdvanced(f.source),
    })
  },
  pickSource(e: WechatMiniprogram.TouchEvent) {
    const source = e.currentTarget.dataset.v as SearchSource
    const sortOpts = sortOptionsForSource(source)
    const f = this.data.filters
    const sort = sortOpts.some((o) => o.value === f.sort) ? f.sort : 'relevance'
    const adv = supportsAdvanced(source)
    this.setData({
      filters: {
        ...f,
        source,
        sort,
        subjects: adv ? f.subjects : [],
        types: adv ? f.types : [],
        openAccess: adv ? f.openAccess : false,
        minCitations: adv ? f.minCitations : 0,
      },
      sortOptions: sortOpts,
    })
    this.renderAdvOptions()
  },
  pickTime(e: WechatMiniprogram.TouchEvent) {
    this.setData({ filters: { ...this.data.filters, timeRange: e.currentTarget.dataset.v as TimeRange } })
  },
  pickSort(e: WechatMiniprogram.TouchEvent) {
    this.setData({ filters: { ...this.data.filters, sort: e.currentTarget.dataset.v as string } })
  },
  pickMinCite(e: WechatMiniprogram.TouchEvent) {
    this.setData({ filters: { ...this.data.filters, minCitations: Number(e.currentTarget.dataset.v) } })
  },
  toggleOA(e: WechatMiniprogram.SwitchChange) {
    this.setData({ filters: { ...this.data.filters, openAccess: !!e.detail.value } })
  },
  noop() {
    /* 拦截 sheet 内部点击冒泡 */
  },
  toggleSubject(e: WechatMiniprogram.TouchEvent) {
    const v = e.currentTarget.dataset.v as string
    const f = this.data.filters
    let subjects: string[]
    if (isSubjectsSingle(f.source)) subjects = f.subjects[0] === v ? [] : [v]
    else subjects = f.subjects.indexOf(v) >= 0 ? f.subjects.filter((x) => x !== v) : f.subjects.concat([v])
    this.setData({ filters: { ...f, subjects } })
    this.renderAdvOptions()
  },
  toggleType(e: WechatMiniprogram.TouchEvent) {
    const v = e.currentTarget.dataset.v as string
    const f = this.data.filters
    const types = f.types.indexOf(v) >= 0 ? f.types.filter((x) => x !== v) : f.types.concat([v])
    this.setData({ filters: { ...f, types } })
    this.renderAdvOptions()
  },
  resetFilters() {
    this.setData({ filters: { ...DEFAULT_FILTERS, subjects: [], types: [] }, sortOptions: sortOptionsForSource('auto') })
    this.renderAdvOptions()
  },
  applyFilter() {
    this.setData({ showFilter: false, filterCount: activeFilterCount(this.data.filters) })
    if (this.data.submitted) this.onSearch()
  },

  async runJournals(reset: boolean) {
    const page = reset ? 1 : this.data.page
    const resp = await searchJournals(this.data.q.trim(), page, 12)
    const vms = (resp.rows || []).map((r) => r.unified).filter((j) => j && j.id).map(buildJournalRow)
    const meta = { page: page + 1, hasMore: !!resp.hasMore }
    if (reset) {
      this.setData({ journals: vms, ...meta, empty: vms.length === 0 })
    } else {
      this.setData(appendPatch('journals', this.data.journals.length, vms, meta))
    }
  },

  onReachBottom() {
    if (!this.data.submitted || !this.data.hasMore || this.data.loading || this.data.loadingMore) return
    this.run(false)
  },

  goPaper(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.navigateTo({ url: '/pages/paper/paper?id=' + encodeURIComponent(id) })
  },
  goJournal(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.navigateTo({ url: '/pages/journal/journal?id=' + id })
  },
})
