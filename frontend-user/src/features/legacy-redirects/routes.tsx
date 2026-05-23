import { Navigate, type RouteObject } from 'react-router-dom';
import { SlugToSearchRedirect } from './SlugToSearchRedirect';

/**
 * 旧 frontend-user 路由 → 新 frontend-v2 路由的客户端 redirect。
 *
 * 用于保留外部链接 / SEO 入站权重。技术上是 React Router `<Navigate replace>`
 * 客户端跳转,Google 能识别为 soft redirect;**追求 100% SEO 兼容时,在 Nginx
 * 层配置真 HTTP 301**(参见仓库根目录的 `docs/nginx-legacy-redirects.conf` 片段)。
 *
 * 这里**不包含**:
 *   - /alipay-return  支付宝回调 —— 等支付功能上线时单独补
 *
 * 仅做用户端 redirect;admin 旧路径在 admin/routes 内单独处理。
 */
export const legacyRedirectRoutes: RouteObject[] = [
  // ── 搜索类 ─────────────────────────────────────────
  // 旧 /search-results → 新 /search
  {
    path: 'search-results',
    element: <Navigate to="/search" replace />,
  },
  // 旧 /search-results/:slug → 新 /search?q=<slug>
  {
    path: 'search-results/:slug',
    element: <SlugToSearchRedirect />,
  },
  // 旧 /advanced-search → 新 /search(高级筛选直接进搜索页,filters 由用户调)
  {
    path: 'advanced-search',
    element: <Navigate to="/search" replace />,
  },

  // ── 期刊 ───────────────────────────────────────────
  // 旧 /journals 列表页 → 新 /journals/search
  {
    path: 'journals',
    element: <Navigate to="/journals/search" replace />,
  },

  // ── 论文 / 作者 SEO slug ──────────────────────────
  // 旧 /paper/:slug 和 /author/:slug 已经是 redirect 到 / 的占位 ——
  // 保持同一行为(新前端这两类 SEO slug 入口尚未规划)
  {
    path: 'paper/:slug',
    element: <Navigate to="/" replace />,
  },
  {
    path: 'author/:slug',
    element: <Navigate to="/" replace />,
  },

  // ── 智能写作 ──────────────────────────────────────
  // 旧 /latex-writer → 新 /prism(同一 feature 改名)
  {
    path: 'latex-writer',
    element: <Navigate to="/prism" replace />,
  },

  // ── 智能助手 / 聊天 ───────────────────────────────
  // 旧 /assistant / /chat → 新 /claw
  {
    path: 'assistant',
    element: <Navigate to="/claw" replace />,
  },
  {
    path: 'chat',
    element: <Navigate to="/claw" replace />,
  },

  // ── 旧 peer-review v2 实验路径 ──────────────────
  // 旧 /peer-review-v2 → 新 /peer-review(v2 已合并为主)
  {
    path: 'peer-review-v2',
    element: <Navigate to="/peer-review" replace />,
  },
];

/**
 * Admin 旧路径 redirect(收藏夹兼容,SEO 不重要)。
 *
 * 路径变化的来源:
 *   旧 /admin/feedbacks(复数) → 新 /admin/feedback
 *   旧 /admin/config/* → 新 /admin/*(去掉 /config 前缀)
 *   旧 /admin/config/platform → 新 /admin/system
 *   旧 /dashboard/* → /admin
 *   /admin/prompts(原 Prompt 模板)已下线
 */
export const adminLegacyRedirectRoutes: RouteObject[] = [
  {
    path: 'admin/feedbacks',
    element: <Navigate to="/admin/feedback" replace />,
  },
  {
    path: 'admin/prompt-templates',
    element: <Navigate to="/admin" replace />,
  },
  {
    path: 'admin/prompts',
    element: <Navigate to="/admin" replace />,
  },
  {
    path: 'admin/config/third-party',
    element: <Navigate to="/admin/third-party" replace />,
  },
  {
    path: 'admin/config/payment',
    element: <Navigate to="/admin/payment" replace />,
  },
  {
    path: 'admin/config/oauth',
    element: <Navigate to="/admin/oauth" replace />,
  },
  {
    path: 'admin/config/platform',
    element: <Navigate to="/admin/system" replace />,
  },
  // 旧根仪表盘路径
  {
    path: 'dashboard/*',
    element: <Navigate to="/admin" replace />,
  },
];
