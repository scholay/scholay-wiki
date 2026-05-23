import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarHeaderCenter,
  SidebarHeaderIcon,
  SidebarSection,
  SidebarItem,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from '@/shared/components/sidebar';
import { CountBadge, StatusDot } from './SidebarBadges';
import { useSidebar } from '@/stores/sidebar.store';
import { ADMIN_NAV, findActiveAdminNav, type AdminNavItem } from '../nav';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminAlerts, type AdminAlerts } from '../hooks/useAdminAlerts';

/**
 * Admin 侧栏 —— 复用 Sidebar 全家桶,nav 数据从 features/admin/nav.ts 单一来源。
 * 头部:返回首页按钮 + "管理员后台" 标题 + 盾牌图标
 * 主体:按 nav group 分段渲染
 * 底部:用户条 + 收起按钮(与其他 sidebar 一致)
 */
export function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const toggleSidebar = useSidebar((s) => s.toggle);
  const user = useAuthStore((s) => s.user);
  const isSuper = user?.role === 'super_admin';
  const { alerts } = useAdminAlerts();

  const active = findActiveAdminNav(location.pathname);

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarHeaderIcon aria-label="返回首页" onClick={() => navigate('/')}>
          <ArrowLeft />
        </SidebarHeaderIcon>
        <SidebarHeaderCenter>
          <span className="text-sm font-semibold text-foreground">管理员后台</span>
        </SidebarHeaderCenter>
        <SidebarHeaderIcon aria-label="角色标识">
          <Shield />
        </SidebarHeaderIcon>
      </SidebarHeader>

      <SidebarContent>
        {ADMIN_NAV.map((group) => {
          const items = group.items.filter((it) => !it.superOnly || isSuper);
          if (items.length === 0) return null;
          return (
            <SidebarSection key={group.id} label={group.label}>
              {items.map((it) => {
                const Icon = it.icon;
                const isActive = active?.id === it.id;
                const badge = badgeFor(it, alerts);
                return (
                  <SidebarItem
                    key={it.id}
                    icon={<Icon />}
                    label={it.label}
                    active={isActive ? 'primary' : false}
                    onClick={() => navigate(it.href)}
                    trailing={badge}
                  />
                );
              })}
            </SidebarSection>
          );
        })}
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}

/**
 * 单一映射:nav 项 id → 该项是否要显示徽章。
 * 红色徽章(待处理数 > 0)/ 灰色徽章(草稿数)/ 红点(配置告警 booleans)
 */
function badgeFor(item: AdminNavItem, a: AdminAlerts): React.ReactNode {
  switch (item.id) {
    case 'feedback':
      return a.pendingFeedback > 0 ? <CountBadge tone="danger" n={a.pendingFeedback} /> : null;
    case 'messages':
      return a.draftMessages > 0 ? <CountBadge tone="muted" n={a.draftMessages} /> : null;
    case 'third-party':
      return a.unhealthyThirdParty > 0 ? <CountBadge tone="danger" n={a.unhealthyThirdParty} /> : null;
    case 'payment':
      return !a.hasActiveAlipay || !a.hasActiveWechatPay ? <StatusDot tone="warning" /> : null;
    case 'system':
      return a.maintenanceMode ? <StatusDot tone="warning" /> : null;
    default:
      return null;
  }
}

// CountBadge / StatusDot 已上移到 shared/components/SidebarBadges
