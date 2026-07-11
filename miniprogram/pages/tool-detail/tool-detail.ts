import { getToolDetail, FeatureTool } from '../../services/api/tools'
import { errMsg } from '../../lib/feedback'
import { copyText } from '../../lib/clipboard'
import { PRICE_TYPE_LABEL, ACCESS_TYPE_LABEL, coverColor, initial } from '../../lib/format'
import { currentPagePath } from '../../lib/share'

Page({
  data: {
    loading: true,
    error: '',
    tool: null as FeatureTool | null,
    cover: '',
    coverBg: '',
    tags: [] as string[],
    officialUrl: '',
    downloadUrl: '',
    extractCode: '',
  },

  onShareAppMessage() {
    return { title: (this.data.tool && this.data.tool.name) || '学术工具 · Scholay', path: currentPagePath() }
  },

  onLoad(query: Record<string, string | undefined>) {
    const key = query.idOrSlug ? decodeURIComponent(query.idOrSlug) : ''
    if (!key) {
      this.setData({ loading: false, error: '缺少工具标识' })
      return
    }
    this.load(key)
  },

  async load(key: string) {
    try {
      const t = await getToolDetail(key)
      const tags = [
        t.category_label || '',
        PRICE_TYPE_LABEL[t.price_type || 'unknown'] || '',
        ACCESS_TYPE_LABEL[t.access_type || ''] || '',
        t.is_open_source ? '开源' : '',
      ].filter(Boolean)
      const download = t.access && t.access.download
      this.setData({
        loading: false,
        tool: t,
        cover: initial(t.name_en || t.name),
        coverBg: coverColor(t.name),
        tags,
        officialUrl: t.official_url || '',
        downloadUrl: (download && download.url) || '',
        extractCode: (download && download.extract_code) || '',
      })
      wx.setNavigationBarTitle({ title: t.name.slice(0, 16) })
    } catch (e) {
      this.setData({ loading: false, error: errMsg(e, '加载失败') })
    }
  },

  copyOfficial() {
    if (!this.data.officialUrl) return
    copyText(this.data.officialUrl, '官网链接已复制,请到浏览器打开')
  },

  copyDownload() {
    if (!this.data.downloadUrl) return
    const suffix = this.data.extractCode ? '  提取码: ' + this.data.extractCode : ''
    copyText(this.data.downloadUrl + suffix, '下载链接已复制')
  },

  copyTutorial(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url as string
    if (url) {
      copyText(url, '链接已复制')
    }
  },
})
