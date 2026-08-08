import { isLoggedIn } from '../../store/auth'
import { errMsg } from '../../lib/feedback'
import { listLibrary, removeFavorite, LibraryItem } from '../../services/api/library'
import { formatMetric, authorsLine as fmtAuthors } from '../../lib/format'
import { appendPatch } from '../../lib/setdata'
import { ICONS } from '../../lib/icons'
import { reportActivity } from '../../services/activity'

interface LibVM {
  id: number
  source: string
  paperId: string
  title: string
  sub: string
  cite: string
}

function authorsLine(authors: unknown): string {
  return Array.isArray(authors) ? fmtAuthors(authors, { max: 2, suffix: ' 等' }) : ''
}

function buildVM(it: LibraryItem): LibVM {
  const title = it.og_title || it.title || '未命名'
  const venue = it.og_venue || it.venue || ''
  const year = it.og_year || it.year
  const sub = [authorsLine(it.authors), venue, year ? String(year) : ''].filter(Boolean).join(' · ')
  return {
    id: it.id,
    source: it.source,
    paperId: it.source_paper_id,
    title,
    sub,
    cite: it.citation_count ? '被引 ' + formatMetric(it.citation_count) : '',
  }
}

Page({
  data: {
    ic: ICONS,
    loggedIn: true,
    items: [] as LibVM[],
    total: 0,
    loading: false,
    loadingMore: false,
    hasMore: true,
    error: '',
    page: 1,
  },

  onShow() {
    reportActivity()
  },

  onUserActivity() {
    reportActivity()
  },

  onLoad() {
    if (!isLoggedIn()) {
      this.setData({ loggedIn: false })
      return
    }
    this.reload()
  },

  async reload() {
    this.setData({ page: 1, items: [], hasMore: true, loading: true, error: '' })
    try {
      await this.fetchPage(true)
    } catch (e) {
      this.setData({ error: errMsg(e, '加载失败') })
    }
    this.setData({ loading: false })
  },

  async fetchPage(reset: boolean) {
    const page = reset ? 1 : this.data.page
    const resp = await listLibrary(page, 30)
    const vms = (resp.items || []).map(buildVM)
    if (reset) {
      this.setData({ items: vms, total: resp.total, page: page + 1, hasMore: vms.length < resp.total })
    } else {
      const total = this.data.items.length + vms.length
      this.setData(appendPatch('items', this.data.items.length, vms, { total: resp.total, page: page + 1, hasMore: total < resp.total }))
    }
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return
    this.setData({ loadingMore: true })
    try {
      await this.fetchPage(false)
    } catch {
      /* 触底加载失败静默 */
    }
    this.setData({ loadingMore: false })
  },

  async onPullDownRefresh() {
    await this.reload()
    wx.stopPullDownRefresh()
  },

  goPaper(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    if (id) wx.navigateTo({ url: '/pages/paper/paper?id=' + encodeURIComponent(id) })
  },

  onRemove(e: WechatMiniprogram.TouchEvent) {
    const idx = Number(e.currentTarget.dataset.index)
    const item = this.data.items[idx]
    if (!item) return
    wx.showModal({
      title: '移出文献集',
      content: '确定移出《' + item.title.slice(0, 20) + '》?',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await removeFavorite(item.source, item.paperId)
          const items = this.data.items.slice()
          items.splice(idx, 1)
          this.setData({ items, total: Math.max(0, this.data.total - 1) })
          wx.showToast({ title: '已移出', icon: 'none' })
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '操作失败', icon: 'none' })
        }
      },
    })
  },
})
