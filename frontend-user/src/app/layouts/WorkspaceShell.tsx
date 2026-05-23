import { type ReactNode } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/shared/ui/resizable';
import { cn } from '@/shared/lib/utils';

interface WorkspaceShellProps {
  /** 侧栏(必填)— 文件夹树 / TOC / 菜单 */
  sidebar: ReactNode;
  /** 主区 — 列表 / 编辑器 / 表格 */
  children: ReactNode;
  /** 右栏(可选)— 详情面板 / 矩阵 / 智能体 / 引用网络 */
  rightPanel?: ReactNode;

  sidebarDefaultSize?: number;
  sidebarMinSize?: number;
  sidebarMaxSize?: number;
  rightDefaultSize?: number;
  rightMinSize?: number;
  rightMaxSize?: number;

  /** localStorage 的 autoSaveId,不同页面给不同 key 避免互串 */
  autoSaveId?: string;
  className?: string;
}

/**
 * 三栏可调宽度工作区 — 对照 .pen Collection-2/3/4 + Prism + Peer-Review 布局。
 * 没传 rightPanel 时降级为标准两栏。
 *
 * 默认尺寸按 1920 设计宽度反推:240/240px 侧栏 ≈ 12.5% / 12.5%。
 */
export function WorkspaceShell({
  sidebar,
  children,
  rightPanel,
  sidebarDefaultSize = 14,
  sidebarMinSize = 10,
  sidebarMaxSize = 25,
  rightDefaultSize = 28,
  rightMinSize = 18,
  rightMaxSize = 45,
  autoSaveId,
  className,
}: WorkspaceShellProps) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId={autoSaveId}
      className={cn('h-full', className)}
    >
      <ResizablePanel
        defaultSize={sidebarDefaultSize}
        minSize={sidebarMinSize}
        maxSize={sidebarMaxSize}
        className="bg-background"
      >
        {sidebar}
      </ResizablePanel>
      <ResizableHandle />

      <ResizablePanel defaultSize={rightPanel ? 100 - sidebarDefaultSize - rightDefaultSize : 100 - sidebarDefaultSize} className="bg-surface-1 min-w-0">
        <div className="h-full overflow-auto">{children}</div>
      </ResizablePanel>

      {rightPanel && (
        <>
          <ResizableHandle />
          <ResizablePanel
            defaultSize={rightDefaultSize}
            minSize={rightMinSize}
            maxSize={rightMaxSize}
            className="bg-background"
          >
            {rightPanel}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
