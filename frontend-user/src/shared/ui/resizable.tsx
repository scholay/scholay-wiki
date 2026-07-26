import { GripVertical } from'lucide-react';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type PanelGroupProps,
  type PanelProps,
  type PanelResizeHandleProps,
} from'react-resizable-panels';
import { cn } from'@/shared/lib/utils';

/**
 * shadcn 风格的 ResizablePanel 封装。
 * 三栏布局直接组合:
 *
 * <ResizablePanelGroup direction="horizontal">
 * <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>侧栏</ResizablePanel>
 * <ResizableHandle />
 * <ResizablePanel>主区</ResizablePanel>
 * <ResizableHandle />
 * <ResizablePanel defaultSize={25}>右栏</ResizablePanel>
 * </ResizablePanelGroup>
 */

export const ResizablePanelGroup = ({
  className,
  ...props
}: PanelGroupProps) => (
  <PanelGroup
    className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
      className
    )}
    {...props}
  />
);

export const ResizablePanel = (props: PanelProps) => <Panel {...props} />;

export interface ResizableHandleProps extends PanelResizeHandleProps {
  withHandle?: boolean;
}

export const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: ResizableHandleProps) => (
  <PanelResizeHandle
    className={cn('group relative flex w-px items-center justify-center bg-border', 'after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2', 'hover:bg-border-strong data-[resize-handle-state=drag]:bg-foreground', '', 'data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full', 'data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0',
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-raised flex h-5 w-3 items-center justify-center rounded-4 border border-border bg-surface-card opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="h-2.5 w-2.5 text-muted-foreground"/>
      </div>
    )}
  </PanelResizeHandle>
);
