import { lazy, Suspense, useRef } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, LazyMotion, domMax, MotionConfig, m } from 'framer-motion';
import { useMobileSearchOverlay } from '@/stores/mobile-search.store';
import { useShareSheet } from '@/stores/share.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useReplayPendingAction } from '@/shared/hooks';
import { MobileBottomNav } from '../components/MobileBottomNav';

const ShareSheet = lazy(() =>
  import('@/shared/components/share/ShareSheet').then((m) => ({
    default: m.ShareSheet,
  })),
);
const MobileAuthSheet = lazy(() =>
  import('@/features/auth/components/MobileAuthSheet').then((m) => ({
    default: m.MobileAuthSheet,
  })),
);
const MobileSearchOverlay = lazy(() =>
  import('../components/MobileSearchOverlay').then((m) => ({
    default: m.MobileSearchOverlay,
  })),
);

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
  const location = useLocation();

  // 登录后重放"未登录时点的收藏"等动作 —— 桌面挂在 AppShell,移动壳对等挂一份
  useReplayPendingAction();

  // 鉴权:/m/* 下任何代码触发 openDialog(分享面板「登录后生成」、收藏、401 失效…)→
  // 由下方 <MobileAuthSheet> 从底部滑出弹窗就地登录,**不再跳 /m/auth 整页**,原面板上下文保留;
  // 登录成功后 useReplayPendingAction 继续后续动作。无需在此桥接。
  //
  // PC↔移动切换完全由 UA 决定(router 的 / 与 /m 两个 loader 双向自动分流),
  // App 内不提供任何手动切换入口,故此处不再有「使用电脑版」toast。

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

  // 全局分享面板:论文/期刊/文件夹的「分享」按钮统一弹这一份(多方式:海报/二维码/链接/口令)。
  const shareTarget = useShareSheet((s) => s.target);
  const closeShare = useShareSheet((s) => s.closeShare);
  const authOpen = useAuthDialog((s) => s.open);
  const authMode = useAuthDialog((s) => s.mode);
  const shareEverOpened = useRef(false);
  const authEverOpened = useRef(false);
  if (shareTarget) shareEverOpened.current = true;
  if (authOpen && authMode !== 'wechat-qr') authEverOpened.current = true;

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
          <Suspense fallback={null}>
            <AnimatePresence>
              {searchOpen && isFeedRoute && <MobileSearchOverlay />}
            </AnimatePresence>
          </Suspense>

          {/* 全局分享面板:首次打开再下载，之后保持挂载让 Sheet 正常完成关闭清理。 */}
          {shareEverOpened.current && (
            <Suspense fallback={null}>
              <ShareSheet
                target={shareTarget}
                open={!!shareTarget}
                onOpenChange={(v) => !v && closeShare()}
              />
            </Suspense>
          )}

          {/* 登录表单全家桶仅在首次打开底部弹窗时下载，关闭后仍保持挂载。 */}
          {authEverOpened.current && (
            <Suspense fallback={null}>
              <MobileAuthSheet />
            </Suspense>
          )}
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
