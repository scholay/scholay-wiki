import { getNewsDetail, NewsSource } from '../../services/api/news'
import { errMsg } from '../../lib/feedback'
import { copyText } from '../../lib/clipboard'
import { relativeTime } from '../../lib/format'
import { currentPagePath } from '../../lib/share'
import { reportActivity } from '../../services/activity'

Page({
  data: {
    loading: true,
    error: '',
    title: '',
    sectionLabel: '',
    timeText: '',
    cover: '',
    body: '',
    sources: [] as NewsSource[],
  },

  onShow() {
    reportActivity()
  },

  onUserActivity() {
    reportActivity()
  },

  onShareAppMessage() {
    reportActivity()
    return { title: this.data.title || 'Scholay 学术情报', path: currentPagePath() }
  },

  onLoad(query: Record<string, string | undefined>) {
    const slug = query.slug ? decodeURIComponent(query.slug) : ''
    if (!slug) {
      this.setData({ loading: false, error: '缺少情报标识' })
      return
    }
    this.load(slug)
  },

  async load(slug: string) {
    try {
      const n = await getNewsDetail(slug)
      // 去掉 markdown 内嵌图片语法(小程序无 rehype-raw,原样显示会是字面文字)。
      const raw = n.content || n.body_md || n.summary || ''
      const body = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()
      this.setData({
        loading: false,
        title: n.title,
        sectionLabel: n.section_label || '情报',
        timeText: relativeTime(n.published_at),
        cover: n.cover_image || '',
        body,
        sources: (n.sources || []).filter((s) => !!s.url),
      })
      wx.setNavigationBarTitle({ title: n.title.slice(0, 16) })
    } catch (e) {
      this.setData({ loading: false, error: errMsg(e, '加载失败') })
    }
  },

  copySource(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url as string
    if (url) {
      copyText(url, '链接已复制')
    }
  },
})
