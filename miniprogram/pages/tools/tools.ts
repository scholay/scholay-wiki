import { syncTabBar } from '../../services/tabbar'
import { errMsg } from '../../lib/feedback'
import { listTools, listToolCategories, FeatureTool, ToolCategoryMeta } from '../../services/api/tools'
import { PRICE_TYPE_LABEL, coverColor, initial } from '../../lib/format'
import { appendPatch } from '../../lib/setdata'

interface ToolVM {
  id: number
  slug: string
  name: string
  tagline: string
  logo: string
  priceLabel: string
  cover: string
  coverBg: string
}

function buildVM(t: FeatureTool): ToolVM {
  return {
    id: t.id,
    slug: t.slug || String(t.id),
    name: t.name,
    tagline: t.tagline || '',
    logo: t.logo || '',
    priceLabel: PRICE_TYPE_LABEL[t.price_type || 'unknown'] || '',
    cover: initial(t.name_en || t.name),
    coverBg: coverColor(t.name),
  }
}

Page({
  data: {
    q: '',
    category: '',
    categories: [] as ToolCategoryMeta[],
    tools: [] as ToolVM[],
    total: 0,
    loading: false,
    loadingMore: false,
    hasMore: true,
    error: '',
    page: 1,
  },

  onShow() {
    syncTabBar(2)
  },

  onShareAppMessage() {
    return { title: 'Scholay 功能广场 · 科研工具导航', path: '/pages/tools/tools' }
  },

  onLoad() {
    this.loadCategories()
    this.reload()
  },

  async loadCategories() {
    try {
      const r = await listToolCategories()
      this.setData({ categories: r.categories || [] })
    } catch {
      /* 分类失败不阻塞列表 */
    }
  },

  async reload() {
    this.setData({ page: 1, tools: [], hasMore: true, loading: true, error: '' })
    try {
      await this.fetchPage(true)
    } catch (e) {
      this.setData({ error: errMsg(e, '加载失败') })
    }
    this.setData({ loading: false })
  },

  async fetchPage(reset: boolean) {
    const page = reset ? 1 : this.data.page
    const resp = await listTools({
      page,
      page_size: 20,
      q: this.data.q || undefined,
      category: this.data.category || undefined,
      sort_by: 'view_count',
      sort_order: 'desc',
    })
    const vms = (resp.items || []).map(buildVM)
    if (reset) {
      this.setData({ tools: vms, total: resp.total, page: page + 1, hasMore: vms.length < resp.total })
    } else {
      const total = this.data.tools.length + vms.length
      this.setData(appendPatch('tools', this.data.tools.length, vms, { total: resp.total, page: page + 1, hasMore: total < resp.total }))
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ q: e.detail.value })
  },
  onSearch() {
    this.reload()
  },
  pickCategory(e: WechatMiniprogram.TouchEvent) {
    const slug = (e.currentTarget.dataset.slug as string) || ''
    if (slug === this.data.category) return
    this.setData({ category: slug })
    this.reload()
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return
    this.setData({ loadingMore: true })
    try {
      await this.fetchPage(false)
    } catch {
      /* 触底加载失败静默 */
    }
    this.setData({ loadingMore: false })
  },

  onLogoError(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.currentTarget.dataset.index)
    if (!isNaN(idx)) this.setData({ ['tools[' + idx + '].logo']: '' })
  },

  goDetail(e: WechatMiniprogram.TouchEvent) {
    const slug = e.currentTarget.dataset.slug as string
    wx.navigateTo({ url: '/pages/tool-detail/tool-detail?idOrSlug=' + encodeURIComponent(slug) })
  },
})
