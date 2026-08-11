import { redirect, type RouteObject } from 'react-router-dom';
import { useAuthStore, canAccessAdmin } from '@/stores/auth.store';
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
  // 运营(operations)也能进后台外壳;进来后由 nav/后端 permissions 限制可见页面。
  if (!canAccessAdmin(user?.role)) {
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
        // 代码片段库已并入「系统设置」页的 tab;老书签重定向。
        path: 'code-snippets',
        loader: () => redirect('/admin/system'),
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
        path: 'journal-sync',
        handle: { title: '期刊数据同步' },
        lazy: lazyPage(() => import('./pages/JournalSyncPage'))('JournalSyncPage'),
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
        path: 'skills-review',
        handle: { title: 'Skill 审核' },
        lazy: lazyPage(() => import('./pages/SkillReviewPage'))('SkillReviewPage'),
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
        // 使用日志(旧)已下线:usagelog v1 模块 + 后端 /admin/usage-logs 接口早已移除,
        // usage_logs 表零写入(stranded 历史数据)。老书签回总览。
        path: 'usage-logs',
        loader: () => redirect('/admin'),
      },
      {
        path: 'token-usage',
        handle: { title: '算力用量统计' },
        lazy: lazyPage(() => import('./pages/TokenUsageStatsPage'))('TokenUsageStatsPage'),
      },
      {
        path: 'invites',
        handle: { title: '邀请监控' },
        lazy: lazyPage(() => import('./pages/InvitesPage'))('InvitesPage'),
      },
      {
        path: 'orders',
        handle: { title: '订单与营收' },
        lazy: lazyPage(() => import('./pages/OrdersPage'))('OrdersPage'),
      },
      {
        path: 'mail-center',
        handle: { title: '邮件中心' },
        lazy: lazyPage(() => import('./pages/MailCenterPage'))('MailCenterPage'),
      },
      {
        path: 'support-config',
        handle: { title: '客服配置' },
        lazy: lazyPage(() => import('./pages/SupportCenterConfigPage'))('SupportCenterConfigPage'),
      },
      {
        path: 'vip-codes',
        handle: { title: '会员兑换码' },
        lazy: lazyPage(() => import('./pages/VipCodesPage'))('VipCodesPage'),
      },
      {
        path: 'activities',
        handle: { title: '活动管理' },
        lazy: lazyPage(() => import('./pages/ActivitiesPage'))('ActivitiesPage'),
      },
      {
        // 限时活动统一管理(2026-07-31):原独立「限时领取会员」页并入 /admin/activities;老书签重定向。
        path: 'promo-config',
        loader: () => redirect('/admin/activities'),
      },
      {
        // 三方账号已并入「模型与账号」页的 tab;老书签重定向。
        path: 'third-party',
        loader: () => redirect('/admin/model-catalog'),
      },
      {
        // 「AI Agent 服务」页已并入模型目录(默认端点=Provider 列表第一行);老书签重定向。
        path: 'agent-config',
        loader: () => redirect('/admin/model-catalog'),
      },
      {
        // 模型目录 + 三方账号合并为「模型与账号」页(tab 切换)
        path: 'model-catalog',
        handle: { title: '模型与账号' },
        lazy: lazyPage(() => import('./pages/AiUpstreamPage'))('AiUpstreamPage'),
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
        // 「小程序登录」已并入 OAuth / SSO 页作为「微信小程序」tab;老书签重定向。
        path: 'wechat-miniprogram',
        loader: () => redirect('/admin/oauth'),
      },
      {
        path: 'news-webhook',
        handle: { title: '情报 Webhook' },
        lazy: lazyPage(() => import('./pages/NewsWebhookConfigPage'))('NewsWebhookConfigPage'),
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
