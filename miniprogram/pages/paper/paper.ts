import { getPaperDetail, getPaperReferences, Paper, PaperReference } from '../../services/api/papers'
import { errMsg } from '../../lib/feedback'
import { copyText } from '../../lib/clipboard'
import { formatMetric, authorsLine as fmtAuthors } from '../../lib/format'
import { currentPagePath } from '../../lib/share'
import { generateCitation, CITATION_FORMATS, CitationFormat } from '../../lib/citation'
import { translatePaper, TranslateResult } from '../../services/api/translate'
import { QUOTA_CODE, showQuotaModal } from '../../services/request'
import { isLoggedIn } from '../../store/auth'
import { ensureLogin } from '../../services/auth'
import { closeAnimated } from '../../lib/anim'

interface RefVM {
  paperId?: string
  line: string
}

Page({
  data: {
    loading: true,
    error: '',
    paper: null as Paper | null,
    metaLine: '',
    authorsLine: '',
    fields: [] as string[],
    doi: '',
    pdfUrl: '',
    citeText: '',
    refText: '',
    refs: [] as RefVM[],
    refsLoading: false,
    // 引用生成
    showCite: false,
    closingCite: false,
    citeFormat: 'gbt7714' as CitationFormat,
    citeFormats: CITATION_FORMATS,
    citation: '',
    // AI 翻译
    translating: false,
    translated: null as TranslateResult | null,
    showTranslated: false,
    translatePreview: '',
  },

  onShareAppMessage() {
    return { title: (this.data.paper && this.data.paper.title) || 'Scholay 学术', path: currentPagePath() }
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query.id ? decodeURIComponent(query.id) : ''
    if (!id) {
      this.setData({ loading: false, error: '缺少论文 ID' })
      return
    }
    this.load(id)
  },

  openCite() {
    this.setData({ showCite: true })
    this.genCite(this.data.citeFormat)
  },
  closeCite() {
    closeAnimated(this, 'showCite', 'closingCite')
  },
  pickFormat(e: WechatMiniprogram.TouchEvent) {
    this.genCite(e.currentTarget.dataset.f as CitationFormat)
  },
  genCite(f: CitationFormat) {
    const p = this.data.paper
    if (!p) return
    const text = generateCitation({ title: p.title, authors: p.authors, year: p.year, venue: p.venue }, f)
    this.setData({ citeFormat: f, citation: text })
  },
  copyCite() {
    if (!this.data.citation) return
    copyText(this.data.citation, '引用已复制')
  },
  async onTranslate() {
    if (this.data.translating) return
    if (this.data.translated) {
      this.setData({ showTranslated: !this.data.showTranslated })
      return
    }
    const p = this.data.paper
    if (!p) return
    if (!isLoggedIn()) {
      try {
        await ensureLogin()
      } catch {
        return
      }
    }
    this.setData({ translating: true, translatePreview: '' })
    try {
      const r = await translatePaper({ title: p.title, abstract: p.abstract }, (preview) =>
        this.setData({ translatePreview: preview }),
      )
      this.setData({ translated: r, showTranslated: true, translating: false })
    } catch (e) {
      this.setData({ translating: false })
      const err = e as { code?: number; message?: string }
      if (err.code === QUOTA_CODE) {
        // 统一额度提示(services/request 单一执行点):content 透传后端动态文案(含重置时刻)。
        // 翻译走 SSE 通道不经 request(),须在此显式接入。
        showQuotaModal(err.message)
      } else {
        wx.showToast({ title: err.message || '翻译失败', icon: 'none' })
      }
    }
  },

  stopProp() {
    /* 拦截 sheet 内部点击冒泡到遮罩 */
  },

  async load(id: string) {
    try {
      const paper = await getPaperDetail(id)
      const metaParts = [paper.venue, paper.publicationDate || (paper.year ? String(paper.year) : '')].filter(Boolean)
      const authorsLine = fmtAuthors(paper.authors, { max: 12, suffix: ' 等 {n} 位' }) || '未知作者'
      const ext = paper.externalIds || {}
      const doi = ext.DOI || ext.doi || ext.Doi || ''
      const pdfUrl = (paper.openAccessPdf && paper.openAccessPdf.url) || ''
      this.setData({
        paper,
        loading: false,
        metaLine: metaParts.join(' · '),
        authorsLine,
        fields: (paper.fieldsOfStudy || []).slice(0, 12),
        doi,
        pdfUrl,
        citeText: '被引 ' + formatMetric(paper.citationCount) + ' · 参考文献 ' + formatMetric(paper.referenceCount),
      })
      wx.setNavigationBarTitle({ title: paper.title.slice(0, 16) })
      if (paper.referenceCount) this.loadRefs(id)
    } catch (e) {
      this.setData({ loading: false, error: errMsg(e, '加载失败') })
    }
  },

  async loadRefs(id: string) {
    this.setData({ refsLoading: true })
    try {
      const refs = await getPaperReferences(id)
      const vms: RefVM[] = refs.slice(0, 30).map((r: PaperReference) => {
        const al = fmtAuthors(r.authors, { max: 3, sep: ', ', suffix: ' et al.' })
        const authorPart = al ? al + '. ' : ''
        const yearPart = r.year ? '(' + r.year + '). ' : ''
        const venuePart = r.venue ? ' ' + r.venue + '.' : ''
        const vm: RefVM = { line: authorPart + yearPart + (r.title || '') + venuePart }
        if (r.paperId) vm.paperId = r.paperId
        return vm
      })
      this.setData({ refs: vms })
    } catch {
      /* 参考文献拉取失败静默 */
    }
    this.setData({ refsLoading: false })
  },

  copyDoi() {
    if (!this.data.doi) return
    copyText('https://doi.org/' + this.data.doi, 'DOI 链接已复制')
  },

  openPdf() {
    const url = this.data.pdfUrl
    if (!url) return
    copyText(url, '全文链接已复制,请到浏览器打开')
  },

  goRef(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    if (id) wx.navigateTo({ url: '/pages/paper/paper?id=' + encodeURIComponent(id) })
  },
})
