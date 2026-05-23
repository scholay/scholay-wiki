import type { RouteObject } from 'react-router-dom';

/**
 * 浏览器(论文 / 期刊 / 学者 / PDF 详情承载路由)。
 *
 * **URL 设计**:用不带 `/browser` 前缀的 canonical 路径,作为 runtime + SEO 共用:
 *   /paper/:source/:paperId        论文详情
 *   /author/:source/:authorId      学者详情
 *   /journal/:id                   期刊详情 (legacy, 后端会 301 到带 slug 的形式)
 *   /journal/:id/:slug             期刊详情 SEO canonical (slug 仅做 SEO 关键词增益)
 *   /pdf/:libPaperId               用户上传 PDF 预览
 *
 * 为啥不带 `/browser` 前缀:
 *   - "browser" 对 Google 没语义价值,稀释 URL 关键词权重
 *   - 想让 sitemap emit 同样的 URL,实现 SEO 与 runtime 单一表面
 *   - 老路由 `/browser/p/:source/:paperId` 由 Nginx / Backend 301 兼容
 *
 * 三类详情共用同一个 BrowserPage shell(tabs 条 + 详情 pane);
 * 入口:tabs 非空时 TopNav 的 Globe 按钮 / 详情 deep link 都行。
 */
export const browserRoutes: RouteObject[] = [
  {
    path: 'paper/:source/:paperId',
    lazy: () =>
      import('./pages/BrowserPage').then((m) => ({ Component: m.BrowserPage })),
  },
  {
    path: 'journal/:id',
    lazy: () =>
      import('./pages/BrowserPage').then((m) => ({ Component: m.BrowserPage })),
  },
  {
    // SEO canonical 形态 /journal/{id}/{slug}, slug 仅做 URL 关键词增益,
    // 组件读 id 渲染, 完全不用 slug —— slug 不匹配也由后端 SSR 层 301 校正。
    path: 'journal/:id/:slug',
    lazy: () =>
      import('./pages/BrowserPage').then((m) => ({ Component: m.BrowserPage })),
  },
  {
    path: 'author/:source/:authorId',
    lazy: () =>
      import('./pages/BrowserPage').then((m) => ({ Component: m.BrowserPage })),
  },
  {
    // PDF 单独成 tab —— libPaperId = 文献集 row.id(用户上传 PDF 绑在 row 上,
    // 与上游 source/paperId 解耦)。父级 BrowserPage 看到 /pdf/* 时
    // 渲染 PdfBrowserPane 替代 paper detail pane。
    path: 'pdf/:libPaperId',
    lazy: () =>
      import('./pages/BrowserPage').then((m) => ({ Component: m.BrowserPage })),
  },
];
