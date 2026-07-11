// 同步自定义 tabBar 的高亮态。自定义 tabBar 下每个 tab 页需在 onShow 里调一次
// syncTabBar(index),否则切页后高亮不跟随(小程序自定义 tabBar 规定)。
export function syncTabBar(selected: number): void {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  const tabBar =
    page && typeof page.getTabBar === 'function' ? page.getTabBar() : null
  if (tabBar) tabBar.setData({ selected })
}
