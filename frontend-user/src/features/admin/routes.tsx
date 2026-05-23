import { redirect, type RouteObject } from 'react-router-dom';
import { useAuthStore, isAdminRole } from '@/stores/auth.store';

/**
 * 管理员路由守卫 —— React Router v7 loader 模式。
 * 非 admin 用户尝试访问 /admin/* 时,被踢回首页。
 *
 * 注:loader 在 element 渲染前同步执行,符合 v2 CLAUDE.md §7
 * "不在组件里 useEffect + navigate"。
 */
function adminGuard() {
  const user = useAuthStore.getState().user;
  if (!isAdminRole(user?.role)) {
    return redirect('/');
  }
  return null;
}

/** 每个 admin 子路由共用一个 lazy() 包装,自动 code-split */
const lazyPage =
  (loader: () => Promise<Record<string, unknown>>) =>
  (key: string) =>
  () =>
    loader().then((m) => ({ Component: m[key] as React.ComponentType }));

/**
 * 每条 admin 路由的 `handle.title` 在 AdminShell 中由 useMatches 取出,
 * 通过 React 19 原生 `<title>` 标签注入文档头(代替过去每页手写)。
 * 集中维护:加新路由时只需在这里填 title,无需改 page 文件。
 */
export const adminRoutes: RouteObject[] = [
  {
    path: 'admin',
    loader: adminGuard,
    lazy: () =>
      import('./layouts/AdminShell').then((m) => ({ Component: m.AdminShell })),
    children: [
      {
        index: true,
        handle: { title: '总览' },
        lazy: lazyPage(() => import('./pages/DashboardPage'))('DashboardPage'),
      },
      {
        path: 'users',
        handle: { title: '用户管理' },
        lazy: lazyPage(() => import('./pages/UsersPage'))('UsersPage'),
      },
      {
        path: 'code-snippets',
        handle: { title: '代码片段' },
        lazy: lazyPage(() => import('./pages/CodeSnippetsPage'))('CodeSnippetsPage'),
      },
      {
        path: 'announcements',
        handle: { title: '公告' },
        lazy: lazyPage(() => import('./pages/AnnouncementsPage'))('AnnouncementsPage'),
      },
      {
        path: 'hot-content',
        handle: { title: '热门内容' },
        lazy: lazyPage(() => import('./pages/HotContentPage'))('HotContentPage'),
      },
      {
        path: 'feedback',
        handle: { title: '用户反馈' },
        lazy: lazyPage(() => import('./pages/FeedbackPage'))('FeedbackPage'),
      },
      {
        path: 'messages',
        handle: { title: '消息中心' },
        lazy: lazyPage(() => import('./pages/MessagesPage'))('MessagesPage'),
      },
      {
        path: 'message-templates',
        handle: { title: '消息模板' },
        lazy: lazyPage(() => import('./pages/MessageTemplatesPage'))('MessageTemplatesPage'),
      },
      {
        path: 'analytics',
        handle: { title: '数据统计' },
        lazy: lazyPage(() => import('./pages/AnalyticsPage'))('AnalyticsPage'),
      },
      {
        path: 'usage-logs',
        handle: { title: '用量记录' },
        lazy: lazyPage(() => import('./pages/UsageLogsPage'))('UsageLogsPage'),
      },
      {
        path: 'audit-logs',
        handle: { title: '操作日志' },
        lazy: lazyPage(() => import('./pages/AuditLogsPage'))('AuditLogsPage'),
      },
      {
        path: 'pdf-cache',
        handle: { title: 'PDF 缓存' },
        lazy: lazyPage(() => import('./pages/PdfCachePage'))('PdfCachePage'),
      },
      {
        path: 'third-party',
        handle: { title: '第三方账号' },
        lazy: lazyPage(() => import('./pages/ThirdPartyPage'))('ThirdPartyPage'),
      },
      {
        path: 'latex-agent',
        handle: { title: 'LaTeX 助手' },
        lazy: lazyPage(() => import('./pages/LatexAgentPage'))('LatexAgentPage'),
      },
      {
        path: 'dimensions',
        handle: { title: '分析维度' },
        lazy: lazyPage(() => import('./pages/DimensionsPage'))('DimensionsPage'),
      },
      {
        path: 'wechat-official',
        handle: { title: '微信公众号' },
        lazy: lazyPage(() => import('./pages/WechatOfficialPage'))('WechatOfficialPage'),
      },
      {
        path: 'system',
        handle: { title: '系统配置' },
        lazy: lazyPage(() => import('./pages/SystemConfigPage'))('SystemConfigPage'),
      },
      {
        path: 'oauth',
        handle: { title: 'OAuth 配置' },
        lazy: lazyPage(() => import('./pages/OAuthConfigPage'))('OAuthConfigPage'),
      },
      {
        path: 'payment',
        handle: { title: '支付配置' },
        lazy: lazyPage(() => import('./pages/PaymentConfigPage'))('PaymentConfigPage'),
      },
    ],
  },
];
