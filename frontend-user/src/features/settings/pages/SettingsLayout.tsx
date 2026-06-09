import { NavLink, Outlet } from 'react-router-dom';
import { User, Shield, Link2, Crown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Settings 页壳:左侧 tab,右侧 Outlet。
 * 顶部 AppShell 的 TopNav 已经在,这里只渲染设置区的左侧 nav。
 */
const TABS = [
  { to: '/settings/profile', label: '个人资料', icon: User },
  { to: '/settings/membership', label: '账户资产', icon: Crown },
  { to: '/settings/security', label: '安全', icon: Shield },
  { to: '/settings/connections', label: '已连接账号', icon: Link2 },
];

export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6 h-full max-w-6xl mx-auto px-6 lg:px-12 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">设置</h1>
        <p className="text-sm text-muted-foreground mt-1">管理你的账号信息、安全与登录方式。</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-10">
        <nav className="flex flex-col gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2.5 px-3 h-9 rounded-sm text-sm transition-colors',
                  isActive
                    ? 'bg-surface-2 font-semibold text-foreground'
                    : 'text-subtle hover:bg-surface-1 hover:text-foreground'
                )
              }
            >
              <t.icon className="size-4" />
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default SettingsLayout;
