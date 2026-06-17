import { useEffect } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { toast } from 'sonner';
import {
  consumeAutoRedirectedFlag,
  setPrefersDesktop,
} from '@/shared/lib/device';
import { AnimatePresence, LazyMotion, domMax, MotionConfig, m } from 'framer-motion';
import { useMobileSearchOverlay } from '@/stores/mobile-search.store';
import { useShareSheet } from '@/stores/share.store';
import { useReplayPendingAction } from '@/shared/hooks';
import { ShareSheet } from '@/shared/components/share/ShareSheet';
import { MobileAuthSheet } from '@/features/auth/components/MobileAuthSheet';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { MobileSearchOverlay } from '../components/MobileSearchOverlay';

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

  // 鉴权:/m/* 下任何代码触发 openDialog(分享面板「登录后生成」、收藏、401 失效…)→
  // 由下方 <MobileAuthSheet> 从底部滑出弹窗就地登录,**不再跳 /m/auth 整页**,原面板上下文保留;
  // 登录成功后 useReplayPendingAction 继续后续动作。无需在此桥接。

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

  // 悬浮搜索:由 Feed 顶栏搜索 icon 触发,覆盖在 feed 之上(feed 不卸载、位置保留)。
  // 只在 feed 路由渲染:既保证「点结果进详情→返回」时浮层带 store 状态自动复原(含滚动条位置),
  // 又避免 open=true 残留到 /m/me 等非 feed 页(浮层只属于 feed)。不再用「路由变化即关闭」的粗暴守卫。
  const searchOpen = useMobileSearchOverlay((s) => s.open);
  const isFeedRoute = location.pathname.startsWith('/m/feed');
  // 路由转场用:当前匹配的子路由元素(替代直接 <Outlet/>,以便 AnimatePresence 包裹)
  const outlet = useOutlet();
  // 仅在「顶层版块」间淡入(/m/feed、/m/library、/m/me、/m/tools…);版块内部(论文↔期刊 feed、
  // 列表↔详情、设置子页)key 不变 → 即时切换、不淡入,tab/钻取更跟手,也避免给已在 remount 的页叠淡入。
  const sectionKey = '/' + location.pathname.split('/').filter(Boolean).slice(0, 2).join('/');

  // 全局分享面板:论文/期刊/文献集的「分享」按钮统一弹这一份(多方式:海报/二维码/链接/口令)。
  const shareTarget = useShareSheet((s) => s.target);
  const closeShare = useShareSheet((s) => s.closeShare);

  return (
    // LazyMotion(domMax)= 只装 dom 动画特性(drag/layout/手势),比整包 motion 小;
    // 树内一律用 framer-motion 的 m.* 命中瘦身。MotionConfig reducedMotion="user" 让所有
    // m.* 自动尊重系统「减少动态」(只动 opacity、跳过位移/布局动画)。
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user">
        <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background">
          <main className="min-h-0 flex-1">
            {/* 路由转场:/m/* 各页切换快速淡入(opacity-only,snappy);reduced-motion 由 MotionConfig 兜底 */}
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={sectionKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="h-full"
              >
                {outlet}
              </m.div>
            </AnimatePresence>
          </main>
          <MobileBottomNav />

          {/* 悬浮搜索浮层(absolute 覆盖整个移动列,含底部 Tab);仅 feed 路由 + open 时挂载,进退场带动效。 */}
          <AnimatePresence>{searchOpen && isFeedRoute && <MobileSearchOverlay />}</AnimatePresence>

          {/* 全局分享面板(论文/期刊/文献集通用) */}
          <ShareSheet target={shareTarget} open={!!shareTarget} onOpenChange={(v) => !v && closeShare()} />

          {/* 全局登录/注册底部弹窗(openDialog 触发,就地登录不跳页) */}
          <MobileAuthSheet />
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
