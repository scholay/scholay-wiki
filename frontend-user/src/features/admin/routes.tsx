import { redirect, type RouteObject } from 'react-router-dom';
import { useAuthStore, isAdminRole } from '@/stores/auth.store';
import { getAuthToken } from '@/shared/lib/auth-token';

/**
 * 管理员路由守卫 —— React Router v7 loader 模式。
 * 非 admin 用户尝试访问 /admin/* 时,被踢回首页。
 *
 * 以 **token 真源**(getAuthToken)为第一道闸:没 token 一律踢回,避免 persist 残留的
 * stale user 混进后台(退出登录后状态残留 bug 的一环);再校验角色。
 * loader 在 element 渲染前同步执行,符合 v2 CLAUDE.md §7"不在组件里 useEffect + navigate"。
 */
function adminGuard() {
  if (!getAuthToken()) {
    return redirect('/');
  }
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
        path: 'tools',
        handle: { title: '功能广场' },
        lazy: lazyPage(() => import('./pages/FeatureToolsPage'))('FeatureToolsPage'),
      },
      {
        path: 'tools-import',
        handle: { title: '导入工具' },
        lazy: lazyPage(() => import('./pages/FeatureToolImportPage'))('FeatureToolImportPage'),
      },
      {
        path: 'tools-jobs',
        handle: { title: '导入任务' },
        lazy: lazyPage(() => import('./pages/FeatureToolJobsPage'))('FeatureToolJobsPage'),
      },
      {
        path: 'tools-webhooks',
        handle: { title: 'Webhook 同步' },
        lazy: lazyPage(() => import('./pages/FeatureToolWebhooksPage'))('FeatureToolWebhooksPage'),
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
        path: 'email-logs',
        handle: { title: '发送记录' },
        lazy: lazyPage(() => import('./pages/EmailLogsPage'))('EmailLogsPage'),
      },
      {
        path: 'session-monitor',
        handle: { title: '用户会话监控' },
        lazy: lazyPage(() => import('./pages/SessionMonitorPage'))('SessionMonitorPage'),
      },
      {
        path: 'analytics',
        handle: { title: '数据统计' },
        lazy: lazyPage(() => import('./pages/AnalyticsPage'))('AnalyticsPage'),
      },
      {
        path: 'usage-stats',
        handle: { title: '使用统计' },
        lazy: lazyPage(() => import('./pages/UsageStatsPage'))('UsageStatsPage'),
      },
      {
        path: 'usage-logs',
        handle: { title: '用量记录(旧)' },
        lazy: lazyPage(() => import('./pages/UsageLogsPage'))('UsageLogsPage'),
      },
      {
        path: 'token-usage',
        handle: { title: 'Token 用量统计' },
        lazy: lazyPage(() => import('./pages/TokenUsageStatsPage'))('TokenUsageStatsPage'),
      },
      {
        path: 'vip-codes',
        handle: { title: '会员兑换码' },
        lazy: lazyPage(() => import('./pages/VipCodesPage'))('VipCodesPage'),
      },
      {
        path: 'third-party',
        handle: { title: '第三方账号' },
        lazy: lazyPage(() => import('./pages/ThirdPartyPage'))('ThirdPartyPage'),
      },
      {
        path: 'agent-config',
        handle: { title: 'AI Agent 服务' },
        lazy: lazyPage(() => import('./pages/AgentConfigPage'))('AgentConfigPage'),
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
      {
        path: 'billing-config',
        handle: { title: '计费配置' },
        lazy: lazyPage(() => import('./pages/BillingConfigPage'))('BillingConfigPage'),
      },
    ],
  },
];
