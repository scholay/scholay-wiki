import {
  LayoutDashboard,
  Users,
  Code2,
  Megaphone,
  MessageSquare,
  Bell,
  Flame,
  Activity,
  BarChart3,
  BarChart2,
  Coins,
  Gift,
  Settings,
  KeyRound,
  CreditCard,
  Plug,
  Cpu,
  Send,
  Compass,
  Boxes,
  ScanEye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Admin 侧栏导航配置 —— 17 个后端 domain 分组到 6 个段。
 * 单一来源:AdminSidebar 渲染 + AdminLayout 标题渲染都从这里取。
 */
export interface AdminNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** super_admin 专属(目前只有"角色分配"是,但留口子) */
  superOnly?: boolean;
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
      { id: 'dashboard', label: '看板', icon: LayoutDashboard, href: '/admin' },
    ],
  },
  {
    id: 'users',
    label: '用户与权限',
    items: [
      { id: 'users', label: '用户管理', icon: Users, href: '/admin/users' },
      { id: 'vip-codes', label: '会员兑换码', icon: Gift, href: '/admin/vip-codes' },
    ],
  },
  {
    id: 'content',
    label: '内容运营',
    items: [
      { id: 'code-snippets', label: '代码片段库', icon: Code2, href: '/admin/code-snippets' },
      { id: 'announcements', label: '公告', icon: Megaphone, href: '/admin/announcements' },
      { id: 'hot-content', label: '热门内容', icon: Flame, href: '/admin/hot-content' },
      { id: 'tools', label: '功能广场', icon: Boxes, href: '/admin/tools' },
    ],
  },
  {
    id: 'ops',
    label: '运营互动',
    items: [
      { id: 'feedback', label: '用户反馈', icon: MessageSquare, href: '/admin/feedback' },
      { id: 'messages', label: '站内消息', icon: Bell, href: '/admin/messages' },
    ],
  },
  {
    id: 'observability',
    label: '观测与日志',
    items: [
      { id: 'session-monitor', label: '用户会话监控', icon: ScanEye, href: '/admin/session-monitor' },
      { id: 'analytics', label: '数据统计', icon: BarChart3, href: '/admin/analytics' },
      { id: 'usage-stats', label: '使用统计', icon: BarChart2, href: '/admin/usage-stats' },
      { id: 'token-usage', label: 'Token 用量', icon: Coins, href: '/admin/token-usage' },
      { id: 'usage-logs', label: '使用日志(旧)', icon: Activity, href: '/admin/usage-logs' },
    ],
  },
  {
    id: 'integrations',
    label: '集成与 AI',
    items: [
      { id: 'third-party', label: '三方账号', icon: Plug, href: '/admin/third-party' },
      { id: 'agent-config', label: 'AI Agent 服务', icon: Cpu, href: '/admin/agent-config' },
      { id: 'dimensions', label: '分析维度', icon: Compass, href: '/admin/dimensions' },
      { id: 'wechat-official', label: '公众号', icon: Send, href: '/admin/wechat-official' },
    ],
  },
  {
    id: 'config',
    label: '系统配置',
    items: [
      { id: 'system', label: '系统设置', icon: Settings, href: '/admin/system' },
      { id: 'oauth', label: 'OAuth / SSO', icon: KeyRound, href: '/admin/oauth' },
      { id: 'payment', label: '支付配置', icon: CreditCard, href: '/admin/payment' },
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
