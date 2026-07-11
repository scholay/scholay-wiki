// 转发路径:小程序分享走 onShareAppMessage(不是海报),path 指回当前页(带参数),
// 对方点开直接落到同一详情/列表页。

export function currentPagePath(): string {
  const pages = getCurrentPages()
  const p = pages[pages.length - 1] as unknown as { route: string; options: Record<string, string> }
  if (!p) return '/pages/feed/feed'
  const opts = p.options || {}
  const q = Object.keys(opts)
    .map((k) => k + '=' + opts[k])
    .join('&')
  return '/' + p.route + (q ? '?' + q : '')
}
