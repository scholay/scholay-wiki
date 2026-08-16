import { useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarItem,
} from '@/shared/components/sidebar';
import { MENUS } from '@/app/menus';

/**
 * 首页侧栏 —— 单行功能名,顺序与 menus.ts 一致,不分检索/智能/资源。
 */
export function HomeSidebar() {
  const navigate = useNavigate();

  return (
    <Sidebar>
      <SidebarContent>
        {MENUS.map((m) => {
          const Icon = m.icon;
          return (
            <SidebarItem
              key={m.id}
              icon={<Icon />}
              label={m.label}
              onClick={() => navigate(m.href)}
            />
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
