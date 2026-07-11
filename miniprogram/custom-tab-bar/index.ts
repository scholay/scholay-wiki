// 自定义底部导航(对标 Web 端 MobileBottomNav):浏览 / AI Claw / 功能 / 我的。
// 忠实照设计:激活=前景黑(foreground),非激活=faint 灰,无彩色指示条。图标用两色线性 SVG。
const ACTIVE = '#111111'
const INACTIVE = '#999999'

// 24x24 线性图标 → data URI(stroke=currentColor 无法在 <image> 生效,故按色各生成一份)。
function icon(inner: string, color: string): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
    'fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    '</svg>'
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

const PATHS: Record<string, string> = {
  feed: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  claw: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  tools: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  me: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
}

interface TabItem {
  key: string
  text: string
  pagePath: string
  iconOff: string
  iconOn: string
}

const LIST: TabItem[] = [
  { key: 'feed', text: '浏览', pagePath: '/pages/feed/feed', iconOff: icon(PATHS.feed, INACTIVE), iconOn: icon(PATHS.feed, ACTIVE) },
  { key: 'claw', text: 'AI Claw', pagePath: '/pages/claw/claw', iconOff: icon(PATHS.claw, INACTIVE), iconOn: icon(PATHS.claw, ACTIVE) },
  { key: 'tools', text: '功能', pagePath: '/pages/tools/tools', iconOff: icon(PATHS.tools, INACTIVE), iconOn: icon(PATHS.tools, ACTIVE) },
  { key: 'me', text: '我的', pagePath: '/pages/me/me', iconOff: icon(PATHS.me, INACTIVE), iconOn: icon(PATHS.me, ACTIVE) },
]

Component({
  data: {
    selected: 0,
    list: LIST,
    active: ACTIVE,
    inactive: INACTIVE,
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const idx = Number(e.currentTarget.dataset.index)
      if (idx === this.data.selected) return
      wx.switchTab({ url: LIST[idx].pagePath })
    },
  },
})
