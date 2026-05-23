/**
 * 应用内路由合法性校验 —— 给"链接来自外部数据"的场景兜底。
 *
 * 典型场景:
 *   - 后台运营写好的通知(message.link_url)指向已下线的页面
 *   - 历史用户分享链接 / 外站 referrer 写错路径
 *
 * **不用 react-router 的 matchRoutes**(避免把整棵路由树 + 所有 feature 代码
 * 都拖进 shared/ 的 chunk)。改用维护成本极低的"首段路径白名单"。
 *
 * 维护契约:**新增顶级路由时,把它的第一段路径加进 KNOWN_FIRST_SEGMENTS。**
 * 与 frontend-v2/src/app/router.tsx 的真实路由表保持一致。
 */

// 'root' 代表 `/`(即首段为空字符串)
const KNOWN_FIRST_SEGMENTS: ReadonlySet<string> = new Set([
  'root',
  // ─── 主功能 ───
  'search',
  'advanced-search',
  'search-results',
  'library',
  'journals',
  'tools',
  'prism',
  'claw',
  'peer-review',
  'peer-review-v2',
  'latex-writer',
  'chat',
  'assistant',
  // ─── 详情 pane 路由(原 /browser/*,2026-05 改 SEO canonical 无前缀) ───
  'paper',
  'author',
  'journal',
  'pdf',
  // ─── 商业 / 信息页 ───
  'pricing',
  'features',
  // ─── 帮助 / 法务 / 内容 ───
  'about',
  'help',
  'blog',
  'contact',
  'terms',
  'privacy',
  'feedback',
  'disclaimer',
  'resources',
  // ─── 账户 / 设置 / 通知 ───
  'settings',
  'profile',
  'messages',
  'announcements',
  // ─── 管理后台 ───
  'admin',
  'dashboard',
  // ─── 第三方回调 / OAuth ───
  'oauth',
  'wechat',
  'github',
  'google',
  'orcid',
  'apple',
  'microsoft',
]);

/**
 * 给定一个站内 path(必须以 `/` 起头),判断是否能落到真实路由。
 *
 * 判断口径 = 首段属于白名单。子路径不再细查 —— feature 内部 404 由各自 routes 兜
 *(例如 /library/nonexistent-folder 会渲染 LibraryPage 自己的空态,不算"未知路由")。
 *
 * 返回 false 的情况:
 *   - path 不以 `/` 起头(等价于外链,本函数不处理)
 *   - 首段不在白名单内
 */
export function isValidAppPath(path: string): boolean {
  if (!path || !path.startsWith('/')) return false;
  // 切掉 query / hash,只看 pathname
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname === '/') return true;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  return KNOWN_FIRST_SEGMENTS.has(segments[0]);
}
