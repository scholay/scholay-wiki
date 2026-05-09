/**
 * AdminSidebar v2 — 5 个一级菜单 + 配置中心二级
 *
 * IA 设计:
 *   仪表盘
 *   用户与权限     - 用户管理
 *   内容运营       - 热门内容 / 反馈管理 / 站内信 / 消息模板 / 代码片段
 *   AI 配置        - Prompt 模板 / LaTeX Agent / 分析维度
 *   数据分析       - 使用日志
 *   配置中心       - (可展开)
 *     ├ 第三方账号 (API Keys)
 *     ├ 支付配置  (支付宝 + 微信支付)
 *     ├ 第三方登录 (GitHub/Google/Apple/Microsoft/ORCID/Discourse)
 *     ├ 消息服务  (邮件 + SMS)
 *     └ 平台配置  (隐私协议 / 服务条款 / 系统配置)
 */

import { useState, useMemo, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Bot,
  BarChart3,
  Settings,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface NavItem {
  label: string;
  to: string;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  to?: string; // single-link group
  items?: NavItem[]; // collapsible sub-items
  defaultOpen?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  { label: '仪表盘', icon: LayoutDashboard, to: '/admin' },
  {
    label: '用户与权限',
    icon: Users,
    items: [
      { label: '用户管理', to: '/admin/users' },
      { label: '用户标签', to: '/admin/user-tags' },
    ],
    defaultOpen: true,
  },
  {
    label: '内容运营',
    icon: Megaphone,
    items: [
      { label: '公告 / Banner', to: '/admin/announcements' },
      { label: '热门内容', to: '/admin/hot-content' },
      { label: '反馈管理', to: '/admin/feedbacks' },
      { label: '站内信', to: '/admin/messages' },
      { label: '消息模板', to: '/admin/message-templates' },
      { label: '代码片段', to: '/admin/code-snippets' },
    ],
  },
  {
    label: 'AI 配置',
    icon: Bot,
    items: [
      { label: 'Prompt 模板', to: '/admin/prompt-templates' },
      { label: 'LaTeX Agent', to: '/admin/latex-agent' },
      { label: '分析维度', to: '/admin/business-data' },
    ],
  },
  {
    label: '数据分析',
    icon: BarChart3,
    items: [
      { label: '使用日志', to: '/admin/usage-logs' },
      { label: '审计日志', to: '/admin/audit-logs' },
    ],
  },
  {
    label: '配置中心',
    icon: Settings,
    items: [
      { label: '第三方账号', to: '/admin/config/third-party' },
      { label: '支付配置', to: '/admin/config/payment' },
      { label: '第三方登录', to: '/admin/config/oauth' },
      { label: '消息服务', to: '/admin/config/messaging' },
      { label: '平台配置', to: '/admin/config/platform' },
    ],
  },
];

interface SidebarProps {
  onLogout?: () => void;
  username?: string;
  roleLabel?: string;
  onNavigate?: () => void;
}

export function AdminSidebar({ onLogout, username, roleLabel, onNavigate }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => {
      if (g.items) init[g.label] = !!g.defaultOpen;
    });
    return init;
  });

  // 当前活跃菜单展开
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      NAV_GROUPS.forEach((g) => {
        if (g.items?.some((i) => location.pathname.startsWith(i.to))) {
          next[g.label] = true;
        }
      });
      return next;
    });
  }, [location.pathname]);

  const activeTopLevel = useMemo(() => {
    for (const g of NAV_GROUPS) {
      if (g.to && (g.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(g.to))) {
        return g.label;
      }
      if (g.items?.some((i) => location.pathname.startsWith(i.to))) {
        return g.label;
      }
    }
    return null;
  }, [location.pathname]);

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-background">
      {/* Logo / 标题 */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
          S
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Scholay 后台</p>
          {roleLabel && (
            <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
          )}
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((g) => {
          const Icon = g.icon;
          const isActive = activeTopLevel === g.label;

          if (g.to) {
            return (
              <NavLink
                key={g.label}
                to={g.to}
                end={g.to === '/admin'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {g.label}
              </NavLink>
            );
          }

          const open = openMap[g.label];
          return (
            <div key={g.label}>
              <button
                onClick={() =>
                  setOpenMap((m) => ({ ...m, [g.label]: !m[g.label] }))
                }
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{g.label}</span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    open ? 'rotate-0' : '-rotate-90',
                  )}
                />
              </button>
              {open && g.items && (
                <div className="ml-6 mt-1 space-y-0.5 border-l pl-2">
                  {g.items.map((i) => (
                    <NavLink
                      key={i.to}
                      to={i.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'block rounded-md px-3 py-1.5 text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      {i.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 底部 — 用户信息 + 退出 */}
      <div className="border-t p-3">
        {username && (
          <div className="mb-2 px-2">
            <p className="text-xs text-muted-foreground">已登录</p>
            <p className="truncate text-sm font-medium">{username}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            if (onLogout) {
              onLogout();
            } else {
              localStorage.removeItem('user_token');
              localStorage.removeItem('user_data');
              navigate('/');
            }
          }}
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </Button>
      </div>
    </aside>
  );
}
