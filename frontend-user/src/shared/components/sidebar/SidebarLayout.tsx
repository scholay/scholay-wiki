import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSidebar } from '@/stores/sidebar.store';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/utils';
import { SidebarExpandButton } from './SidebarCollapse';

interface SidebarLayoutProps {
  /** 完整 sidebar 组件 — 展开时渲染在主区左侧 */
  sidebar: ReactNode;
  /** 主区内容 */
  children: ReactNode;
  /** sidebar 宽度,默认 240(.pen 所有 sidebar 变体的统一宽度) */
  width?: number;
  className?: string;
  /**
   * 隐藏收起态的左下浮动展开按钮(默认 false = 显示)。
   *
   * 只给「左下角另有内容、浮动按钮会打架」的页面用 —— 目前是文献搜索与
   * 智能助手(ConversationWorkspace,含制作PPT模式;2026-08-02 设计走查拍板)。
   * ⚠️ 隐藏后侧栏并非无法展开:顶栏的 rail chip(TopNav/RailLinks)仍可展开,
   *    所以这不是把用户关在门外。若哪天顶栏入口也没了,这个 prop 就得重新评估。
   */
  hideExpandButton?: boolean;
}

/**
 * Feature 页面专用布局壳 — 把"侧栏 + 主区"拼装在一起,受 useSidebar 全局开合控制。
 *
 * **响应式**(移动端后台适配的地基):
 *   - 桌面(≥640px):侧栏 inline,宽度 0↔240 CSS 过渡「推挤」主区(原行为,逐字保留)。
 *   - 移动(<640px):侧栏改成**覆盖式抽屉** —— fixed 滑入 + 半透明背板,不挤压 390px 的主区;
 *     点背板或切换路由(点了某个导航项)自动收起。用户端 /m 走底部 Tab 不经这里,但 /admin 是
 *     同 URL 响应式(不跳 /m),手机上就靠这套抽屉;其它用 SidebarLayout 的 PC 功能页在窄窗也受益。
 *
 * 设计点(两种模式共有):
 *   - sidebar 始终挂载(内部选中项 / 展开文件夹跨折叠保留);内层固定宽度 div 防动画期重排;
 *   - mount 期间 setHasPanel(true) → 让 ☰ 在没有 panel 的页面灰显。
 *
 * (不用 framer-motion:首屏 eager 组件,CSS transition 与 motion 行为等价、零额外 JS。)
 */
export function SidebarLayout({
  sidebar,
  children,
  width = 240,
  className,
  hideExpandButton = false,
}: SidebarLayoutProps) {
  const expanded = useSidebar((s) => s.expanded);
  const isMobile = useMediaQuery('(max-width: 639px)');
  const { pathname } = useLocation();

  useEffect(() => {
    useSidebar.getState().setHasPanel(true);
    return () => useSidebar.getState().setHasPanel(false);
  }, []);

  // 移动抽屉:切换路由(点了侧栏某项)后自动收起,避免抽屉盖住刚进的页面。
  useEffect(() => {
    if (isMobile) useSidebar.getState().setExpanded(false);
  }, [pathname, isMobile]);

  const inner = (
    <div style={{ width, minWidth: width }} className="h-full">
      {sidebar}
    </div>
  );

  if (isMobile) {
    return (
      <div className={cn('relative flex h-full min-h-0', className)}>
        {!expanded && !hideExpandButton && (
          <SidebarExpandButton
            onClick={() => useSidebar.getState().setExpanded(true)}
            /* 移动分支只服务 <640px 的 /admin(用户端 /m 走 MobileShell 不经这里),
               没有底部 tab 栏冲突。悬浮在屏幕左下角 → 必须给全面屏 home indicator 让位:
               走 --safe-bottom(= max(env(safe-area-inset-bottom), 1rem))——
               无刘海/桌面 = 16px(与原来的字面值 bottom-4 逐像素相同),iPhone X+ = 34px。
               🔴 原来这里写的是字面 `bottom-4` + 一句「与 --safe-bottom 下限一致」的注释,
               于是 token 全站渲染消费为 0(render-audit-2026-07-28 P1-6):
               「注释里提到 token」不等于「接上了 token」—— 下限相等只在无刘海机型上成立。 */
            className="absolute bottom-[var(--safe-bottom)] left-4 z-chrome"
          />
        )}
        {/* 背板:抽屉打开时覆盖全屏,点击收起 */}
        {expanded && (
          <div
            className="fixed inset-0 z-scrim bg-foreground/40 backdrop-blur-[1px]"
            aria-hidden
            onClick={() => useSidebar.getState().setExpanded(false)}
          />
        )}
        <aside
          style={{ width }}
          className={cn(
            'fixed inset-y-0 left-0 z-modal h-full overflow-hidden border-r border-border bg-background transition-transform duration-200 ease-in-out',
            expanded ? 'translate-x-0' : '-translate-x-full'
          )}
          aria-hidden={!expanded}
          inert={!expanded}
        >
          {inner}
        </aside>
        <main className="flex-1 min-w-0 min-h-0 overflow-auto">{children}</main>
      </div>
    );
  }

  return (
    <div className={cn('relative flex h-full min-h-0', className)}>
      {/* 收起态的悬浮展开按钮 —— 挂在 SidebarLayout 这一层,
          所以【所有带侧栏的页面】(首页/检索/文件夹/期刊/Prism/审稿/广场/claw/admin)一次性都有。
          left-6 与 TopNav 的 px-6 同一内缩,与顶栏的 ☰ 竖直对齐。 */}
      {!expanded && !hideExpandButton && (
        <SidebarExpandButton
          onClick={() => useSidebar.getState().setExpanded(true)}
          /* 底距取 max(24px, --safe-bottom):桌面恒为 24px(与改动前逐像素相同),
             有 home indicator 的设备则自动让位 —— 移动分支早就走 --safe-bottom 了,
             这里此前是裸 bottom-6,在带刘海的横屏/平板上会压进指示条区域。 */
          className="absolute bottom-[max(1.5rem,var(--safe-bottom))] left-6 z-chrome"
        />
      )}
      <aside
        // 动态计算尺寸(token 表无对应值)→ 内联 style 合规;CSS transition 不在初次渲染触发,
        // 等价于 framer 的 initial={false}(挂载即定型,只在 expanded 翻转时过渡)。
        style={{ width: expanded ? width : 0 }}
        className="shrink-0 h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-in-out"
        aria-hidden={!expanded}
        inert={!expanded}
      >
        {inner}
      </aside>
      <main className="flex-1 min-w-0 min-h-0 overflow-auto">{children}</main>
    </div>
  );
}
