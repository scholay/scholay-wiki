/**
 * DashboardLayout v2 — Sidebar + 主内容 + 移动端 Drawer
 *
 * 与老 DashboardLayout 的区别:
 *   - 用 shadcn/Tailwind,自然继承品牌绿主题
 *   - 移动端 sidebar 收起为左侧 Drawer (sheet),覆盖式打开
 *   - Profile 数据由 react-query 缓存,所有页面共用
 */

import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Menu, X } from 'lucide-react';
import { adminAPI } from '../../services/api';
import { Button } from '../ui/button';
import { AdminSidebar } from './AdminSidebar';

interface ProfileShape {
  id?: number;
  username?: string;
  role?: string;
  is_super_admin?: boolean;
}

export default function DashboardLayoutV2() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const profileQuery = useQuery({
    queryKey: ['admin', 'profile'],
    queryFn: async () => {
      const r = await adminAPI.getProfile();
      return (r.data?.data || {}) as ProfileShape;
    },
    staleTime: 5 * 60 * 1000,
  });

  // 路由切换关掉移动端抽屉
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // body 锁滚动 (移动端抽屉打开时)
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const username = profileQuery.data?.username;
  const roleLabel =
    profileQuery.data?.role === 'super_admin'
      ? '超级管理员'
      : profileQuery.data?.role === 'admin'
      ? '管理员'
      : undefined;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-muted/30">
      {/* 桌面侧栏 */}
      <div className="hidden md:flex">
        <AdminSidebar username={username} roleLabel={roleLabel} />
      </div>

      {/* 移动端 Drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <AdminSidebar
              username={username}
              roleLabel={roleLabel}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </>
      )}

      {/* 主内容 */}
      <main className="flex-1 overflow-y-auto">
        {/* 移动端顶栏(只在小屏幕显示) */}
        <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="打开菜单"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="text-sm font-medium">Scholay 后台</span>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
