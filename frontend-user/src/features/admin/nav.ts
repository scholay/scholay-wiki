import {
  LayoutDashboard,
  Users,
  Megaphone,
  MessageSquare,
  Bell,
  Flame,
  BarChart3,
  BarChart2,
  Coins,
  Gift,
  Settings,
  KeyRound,
  CreditCard,
  Layers,
  Send,
  Compass,
  Boxes,
  ScanEye,
  Mail,
  ShoppingCart,
  Inbox,
  Headset,
  Sparkles,
  Newspaper,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PERM, type Permission } from './permissions';

/**
 * Admin 侧栏导航配置 —— 后端 domain 分组到 8 个段(含「订单与计费」收费经营区)。
 * 单一来源:AdminSidebar 渲染 + AdminLayout 标题渲染都从这里取。
 */
export interface AdminNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /**
   * 访问该菜单所需的权限点(与后端 RequirePermission 对齐):
   *   - analytics.view : 运营 / 管理员 / 超管 可见(只读看板/统计/监控/营收)
   *   - content.manage : 运营 / 管理员 / 超管 可见(内容/互动运营)
   *   - users.view     : 运营 / 管理员 / 超管 可见(用户列表只读)
   *   - config.manage  : 仅管理员 / 超管 可见(系统/凭证/财务/AI 配置)
   * 前端据此过滤菜单;真正的准入闸在后端(藏了菜单也拦不住直接打 API)。
   */
  requires: Permission;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: 'overview',
    label: '总览',
    items: [
      { id: 'dashboard', label: '看板', icon: LayoutDashboard, href: '/admin', requires: PERM.analyticsView },
    ],
  },
  {
    id: 'users',
    label: '用户与权限',
    items: [
      { id: 'users', label: '用户管理', icon: Users, href: '/admin/users', requires: PERM.usersView },
    ],
  },
  {
    id: 'commerce',
    label: '订单与计费',
    items: [
      { id: 'orders', label: '订单与营收', icon: ShoppingCart, href: '/admin/orders', requires: PERM.analyticsView },
      { id: 'vip-codes', label: '会员兑换码', icon: Gift, href: '/admin/vip-codes', requires: PERM.configManage },
      { id: 'promo-config', label: '限时领取会员', icon: Sparkles, href: '/admin/promo-config', requires: PERM.contentManage },
      { id: 'billing-config', label: '计费配置', icon: Coins, href: '/admin/billing-config', requires: PERM.configManage },
    ],
  },
  {
    id: 'content',
    label: '内容运营',
    items: [
      // 代码片段库 = 全站脚本注入(安全高危),归入仅管理员;不是运营内容项。
      { id: 'announcements', label: '公告', icon: Megaphone, href: '/admin/announcements', requires: PERM.contentManage },
      { id: 'hot-content', label: '热门内容', icon: Flame, href: '/admin/hot-content', requires: PERM.analyticsView },
      { id: 'tools', label: '功能广场', icon: Boxes, href: '/admin/tools', requires: PERM.contentManage },
      { id: 'skills-review', label: 'Skill 审核', icon: Sparkles, href: '/admin/skills-review', requires: PERM.contentManage },
    ],
  },
  {
    id: 'ops',
    label: '运营互动',
    items: [
      { id: 'feedback', label: '用户反馈', icon: MessageSquare, href: '/admin/feedback', requires: PERM.contentManage },
      { id: 'mail-center', label: '邮件中心', icon: Inbox, href: '/admin/mail-center', requires: PERM.contentManage },
      { id: 'support-config', label: '客服配置', icon: Headset, href: '/admin/support-config', requires: PERM.configManage },
      { id: 'messages', label: '站内消息', icon: Bell, href: '/admin/messages', requires: PERM.contentManage },
      { id: 'email-logs', label: '发送记录', icon: Mail, href: '/admin/email-logs', requires: PERM.analyticsView },
    ],
  },
  {
    id: 'observability',
    label: '观测与日志',
    items: [
      { id: 'session-monitor', label: '用户会话监控', icon: ScanEye, href: '/admin/session-monitor', requires: PERM.analyticsView },
      { id: 'analytics', label: '数据统计', icon: BarChart3, href: '/admin/analytics', requires: PERM.analyticsView },
      { id: 'usage-stats', label: '使用统计', icon: BarChart2, href: '/admin/usage-stats', requires: PERM.analyticsView },
      { id: 'token-usage', label: 'Token 用量', icon: Coins, href: '/admin/token-usage', requires: PERM.analyticsView },
    ],
  },
  {
    id: 'integrations',
    label: '集成与 AI',
    items: [
      // 模型目录 + 三方账号合并页(同属 AI 上游接入,tab 切换)
      { id: 'model-catalog', label: '模型与账号', icon: Layers, href: '/admin/model-catalog', requires: PERM.configManage },
      { id: 'dimensions', label: '分析维度', icon: Compass, href: '/admin/dimensions', requires: PERM.configManage },
      { id: 'wechat-official', label: '公众号', icon: Send, href: '/admin/wechat-official', requires: PERM.configManage },
      { id: 'news-webhook', label: '情报 Webhook', icon: Newspaper, href: '/admin/news-webhook', requires: PERM.configManage },
    ],
  },
  {
    id: 'config',
    label: '系统配置',
    items: [
      { id: 'system', label: '系统设置', icon: Settings, href: '/admin/system', requires: PERM.configManage },
      { id: 'oauth', label: 'OAuth / SSO', icon: KeyRound, href: '/admin/oauth', requires: PERM.configManage },
      // 支付配置 = 商户凭证(支付宝/微信),属系统集成;订单/计费的经营面在「订单与计费」组
      { id: 'payment', label: '支付配置', icon: CreditCard, href: '/admin/payment', requires: PERM.configManage },
    ],
  },
];

/** 扁平化以便按 pathname 查找 active item */
export const ADMIN_NAV_FLAT: AdminNavItem[] = ADMIN_NAV.flatMap((g) => g.items);

/** 当前 pathname 对应的 nav 项(精确 + 前缀匹配,最长前缀优先) */
export function findActiveAdminNav(pathname: string): AdminNavItem | undefined {
  const sorted = [...ADMIN_NAV_FLAT].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((it) => pathname === it.href || pathname.startsWith(it.href + '/'));
}
