/**
 * 「SPA 已完成首次挂载」的模块级标记 —— browser 详情路由 loader 的数据 prefetch 用它
 * 区分两种进入方式(2026-08-12 对抗审查):
 *   · 冷进入(SEO 直达 / 新标签 / 刷新):loader 先于 React 首次渲染运行,此时标记还是
 *     false → prefetch 与 lazy chunk 下载并行,正是它要优化的三段串行场景;
 *   · 站内导航:列表侧经 openXxx.prepare 已把实体写进 tabs store,详情 hook 因此
 *     disabled —— loader 再 prefetch 的请求没有任何消费方(store ≠ react-query 缓存,
 *     「同 key 去重」在这条最热路径上不成立),纯浪费,直接跳过。
 * Providers 首次挂载(= 首屏 commit)时置 true。
 */
let appMounted = false;

export function markAppMounted(): void {
  appMounted = true;
}

export function isAppMounted(): boolean {
  return appMounted;
}
