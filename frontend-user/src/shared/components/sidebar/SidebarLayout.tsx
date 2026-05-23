import { type ReactNode, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSidebar } from '@/stores/sidebar.store';
import { cn } from '@/shared/lib/utils';

interface SidebarLayoutProps {
  /** 完整 sidebar 组件 — 展开时渲染在主区左侧 */
  sidebar: ReactNode;
  /** 主区内容 */
  children: ReactNode;
  /** sidebar 宽度,默认 240(.pen 所有 sidebar 变体的统一宽度) */
  width?: number;
  className?: string;
}

/**
 * Feature 页面专用布局壳 — 把"侧栏 + 主区"拼装在一起,
 * 受 useSidebar 全局开合控制 + framer-motion 平滑滑入滑出。
 *
 * 设计点:
 *   - sidebar 始终挂载,只动 width 0 ↔ 240,所以内部状态(选中项 / 展开文件夹)能跨折叠保留
 *   - 内层用固定宽度 div + minWidth,避免动画期间内容被压缩重排
 *   - aria-hidden 同步可访问性
 *
 * 同时在 mount 期间向 store 报告 "本页有 panel 可展开"(setHasPanel),
 * 让 ☰ 按钮在没有 panel 的页面(home 除外)灰显。
 */
export function SidebarLayout({
  sidebar,
  children,
  width = 240,
  className,
}: SidebarLayoutProps) {
  const expanded = useSidebar((s) => s.expanded);

  useEffect(() => {
    useSidebar.getState().setHasPanel(true);
    return () => useSidebar.getState().setHasPanel(false);
  }, []);

  return (
    <div className={cn('flex h-full min-h-0', className)}>
      <motion.aside
        initial={false}
        animate={{ width: expanded ? width : 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="shrink-0 h-full min-h-0 overflow-hidden"
        aria-hidden={!expanded}
      >
        <div style={{ width, minWidth: width }} className="h-full">
          {sidebar}
        </div>
      </motion.aside>
      <main className="flex-1 min-w-0 min-h-0 overflow-auto">{children}</main>
    </div>
  );
}
