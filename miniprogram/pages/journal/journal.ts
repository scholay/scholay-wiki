import { getJournal } from '../../services/api/journals'
import { errMsg } from '../../lib/feedback'
import { formatIF, formatCount, parseQuartile } from '../../lib/format'
import { currentPagePath } from '../../lib/share'

interface Badge { text: string; kind: string }
interface Metric { label: string; value: string }

Page({
  data: {
    loading: true,
    error: '',
    name: '',
    scope: '',
    publisherLine: '',
    issn: '',
    badges: [] as Badge[],
    metrics: [] as Metric[],
    submission: '',
  },

  onShareAppMessage() {
    return { title: this.data.name || '期刊 · Scholay 学术', path: currentPagePath() }
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = Number(query.id)
    if (!id) {
      this.setData({ loading: false, error: '缺少期刊 ID' })
      return
    }
    this.load(id)
  },

  async load(id: number) {
    try {
      const d = await getJournal(id)
      const j = d.unified
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

      const metrics: Metric[] = []
      if (j.jcr_impact_factor) metrics.push({ label: '影响因子', value: formatIF(j.jcr_impact_factor) })
      if (j.openalex_h_index) metrics.push({ label: 'H 指数', value: String(j.openalex_h_index) })
      if (j.openalex_works_count) metrics.push({ label: '累计发文', value: formatCount(j.openalex_works_count) })
      if (j.scirev_first_review_months) metrics.push({ label: '平均初审', value: j.scirev_first_review_months + ' 月' })
      else if (j.scimago_sjr) metrics.push({ label: 'SJR', value: j.scimago_sjr })
      if (j.source_count) metrics.push({ label: '数据源', value: String(j.source_count) })

      const issn = [j.issn_l, j.print_issn, j.electronic_issn].filter(Boolean)[0] || ''
      const publisherLine = [j.crossref_publisher || j.doaj_publisher, j.openalex_country].filter(Boolean).join(' · ')
      const scope = [j.wikidata_label_zh, j.fqb_major_category].filter(Boolean).join(' · ')

      const sub = d.sources && d.sources.submission && d.sources.submission.main
      const submission = sub
        ? [sub.has_guideline ? '投稿须知' : '', sub.has_latex ? 'LaTeX 模板' : ''].filter(Boolean).join(' · ')
        : ''

      this.setData({
        loading: false,
        name: j.canonical_name,
        scope,
        publisherLine,
        issn,
        badges,
        metrics,
        submission,
      })
      wx.setNavigationBarTitle({ title: j.canonical_name.slice(0, 16) })
    } catch (e) {
      this.setData({ loading: false, error: errMsg(e, '加载失败') })
    }
  },
})
