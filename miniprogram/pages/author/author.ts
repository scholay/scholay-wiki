import { getAuthorDetail, getAuthorPapers } from '../../services/api/authors'
import { errMsg } from '../../lib/feedback'
import { copyText } from '../../lib/clipboard'
import { formatMetric } from '../../lib/format'
import { currentPagePath } from '../../lib/share'
import { reportActivity } from '../../services/activity'

interface Stat { label: string; value: string }
interface TopPaper { paperId: string; title: string; sub: string; cite: string }

Page({
  data: {
    loading: true,
    error: '',
    name: '',
    affiliation: '',
    orcid: '',
    stats: [] as Stat[],
    fields: [] as string[],
    topPapers: [] as TopPaper[],
  },

  onShow() {
    reportActivity()
  },

  onUserActivity() {
    reportActivity()
  },

  onShareAppMessage() {
    reportActivity()
    return { title: this.data.name || '学者 · Scholay 学术', path: currentPagePath() }
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query.id ? decodeURIComponent(query.id) : ''
    if (!id) {
      this.setData({ loading: false, error: '缺少作者 ID' })
      return
    }
    this.load(id)
  },

  async load(id: string) {
    try {
      const a = await getAuthorDetail(id)
      const stats: Stat[] = [
        { label: '发表', value: formatMetric(a.paperCount) },
        { label: '被引', value: formatMetric(a.citationCount) },
        { label: 'H 指数', value: a.hIndex ? String(a.hIndex) : '—' },
      ]
      const affs = a.affiliations || []
      const affiliation = affs.length ? affs[0] + (affs.length > 1 ? ' 等 ' + affs.length + ' 个机构' : '') : ''
      this.setData({
        loading: false,
        name: a.name || '未知作者',
        affiliation,
        orcid: a.orcid || '',
        stats,
      })
      wx.setNavigationBarTitle({ title: (a.name || '作者').slice(0, 16) })
      this.loadPapers(id)
    } catch (e) {
      this.setData({ loading: false, error: errMsg(e, '加载失败') })
    }
  },

  async loadPapers(id: string) {
    try {
      const resp = await getAuthorPapers(id, 50)
      const papers = resp.data || []
      const freq: Record<string, number> = {}
      papers.forEach((p) => (p.fieldsOfStudy || []).forEach((f) => (freq[f] = (freq[f] || 0) + 1)))
      const fields = Object.keys(freq)
        .sort((x, y) => freq[y] - freq[x])
        .slice(0, 6)
      const topPapers: TopPaper[] = papers
        .slice()
        .sort((x, y) => (y.citationCount || 0) - (x.citationCount || 0))
        .slice(0, 10)
        .map((p) => ({
          paperId: p.paperId,
          title: p.title,
          sub: [p.venue, p.year ? String(p.year) : ''].filter(Boolean).join(' · '),
          cite: '被引 ' + formatMetric(p.citationCount),
        }))
      this.setData({ fields, topPapers })
    } catch {
      /* 作品列表失败静默 */
    }
  },

  goPaper(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    if (id) wx.navigateTo({ url: '/pages/paper/paper?id=' + encodeURIComponent(id) })
  },

  copyOrcid() {
    if (!this.data.orcid) return
    copyText('https://orcid.org/' + this.data.orcid, 'ORCID 已复制')
  },
})
