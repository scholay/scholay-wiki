import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  consumeAutoRedirectedFlag,
  setPrefersDesktop,
} from '@/shared/lib/device';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useReplayPendingAction } from '@/shared/hooks';
import { MobileBottomNav } from '../components/MobileBottomNav';

/**
 * 移动端壳(.pen `tdZMB` 等移动画板的公共骨架):
 * 上下结构 = 页面内容(Outlet) + 底部 Tab 导航,整体占满动态视口高(h-dvh,
 * 兼容移动端浏览器地址栏伸缩)。
 *
 * 与 AppShell 完全独立 —— 移动端是全新设计逻辑,不是桌面端的响应式适配
 * (技术选型已拍板:同 SPA 独立 feature + 独立 shell,挂 /m/* 顶层路由)。
 * 桌面浏览器访问时用 max-w-md 居中,模拟手机宽度方便调试。
 */
export function MobileShell() {
  const navigate = useNavigate();
  const location = useLocation();

  // 登录后重放"未登录时点的收藏"等动作 —— 桌面挂在 AppShell,移动壳对等挂一份
  useReplayPendingAction();

  // 鉴权弹窗 → 整页登录的**单点桥接**:/m/* 下任何代码触发 openDialog(智能助手
  // 输入、收藏按钮、401 失效自动弹窗…),这里统一拦下转跳 /m/auth 整页(PC 弹窗
  // 在移动端体验突兀)。带 from 回跳参数,登录成功回到触发位置。
  // 例外:wechat-qr 扫码视图保留弹窗(整页登录的微信入口就是它)。
  const authOpen = useAuthDialog((s) => s.open);
  const authMode = useAuthDialog((s) => s.mode);
  useEffect(() => {
    if (!authOpen || authMode === 'wechat-qr') return;
    // 注意用 store.close() 而不是 AuthDialog 的 handleClose —— 后者会清掉
    // pendingAction(用户主动放弃语义),这里是"换个形态继续登录",重放要保留。
    useAuthDialog.getState().close();
    if (location.pathname.startsWith('/m/auth')) return; // 已在整页,防循环
    const params = new URLSearchParams();
    if (authMode === 'register') params.set('mode', 'register');
    params.set('from', location.pathname + location.search);
    void navigate(`/m/auth?${params.toString()}`);
  }, [authOpen, authMode, location.pathname, location.search, navigate]);

  // 被首页自动分流进来的访问 → 弹一次性「使用电脑版」逃生口
  // (点了就持久记住偏好,之后访问 / 不再自动跳;手动访问 /m 永远可用)
  useEffect(() => {
    if (!consumeAutoRedirectedFlag()) return;
    toast('已为你切换到移动版', {
      duration: 5000,
      action: {
        label: '使用电脑版',
        onClick: () => {
          setPrefersDesktop(true);
          void navigate('/');
        },
      },
    });
  }, [navigate]);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background">
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
