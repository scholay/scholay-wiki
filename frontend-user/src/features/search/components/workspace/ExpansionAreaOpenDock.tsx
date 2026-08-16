import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FolderOpen, PanelRightOpen } from 'lucide-react';
import {
  useSearchRightPanelStore,
  type RightPanelVariant,
} from '@/stores/search-right-panel.store';
import { PAGE_TRANSITION } from '@/shared/lib/motion';
import { cn } from '@/shared/lib/utils';

const DOCK_BTN_CLASS = cn(
  'inline-flex shrink-0 cursor-pointer items-center justify-center',
  'rounded-8 border transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
);

const DOCK_BTN_IDLE = cn(
  'border-border bg-background text-muted-foreground',
  'hover:border-border-strong hover:bg-surface-1 hover:text-foreground',
);

const DOCK_BTN_SELECTED = cn(
  'border-brand-red bg-brand-red text-on-brand',
  'hover:border-brand-red hover:bg-brand-red/90 hover:text-on-brand',
);

function DockIconButton({
  selected,
  title,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  title: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      className={cn(
        DOCK_BTN_CLASS,
        'size-7',
        selected ? DOCK_BTN_SELECTED : DOCK_BTN_IDLE,
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 打开 / 收起左侧文件区(文献卡列)。 */
export function FileAreaOpenButton({
  className,
}: {
  className?: string;
}) {
  const fileAreaOpen = useSearchRightPanelStore((s) => s.fileAreaOpen);
  const functionOpen = useSearchRightPanelStore(
    (s) => s.activePanel?.group === 'function',
  );
  const openFileArea = useSearchRightPanelStore((s) => s.openFileArea);
  const closeFileArea = useSearchRightPanelStore((s) => s.closeFileArea);

  return (
    <DockIconButton
      selected={fileAreaOpen}
      title={
        fileAreaOpen
          ? functionOpen
            ? '关闭工作区与扩展功能'
            : '关闭工作区'
          : '打开工作区'
      }
      onClick={() => (fileAreaOpen ? closeFileArea() : openFileArea())}
      className={className}
    >
      <FolderOpen className="size-4" strokeWidth={2} />
    </DockIconButton>
  );
}

/** 打开 / 收起右侧拓展区(论文详情 / 产物 / 工作区功能)。 */
export function ExpansionAreaOpenButton({
  className,
  variant = 'search',
}: {
  className?: string;
  variant?: RightPanelVariant;
}) {
  const activePanel = useSearchRightPanelStore((s) => s.activePanel);
  const infoTabs = useSearchRightPanelStore((s) => s.infoTabs);
  const setActiveInfoTab = useSearchRightPanelStore((s) => s.setActiveInfoTab);
  const setActiveFunction = useSearchRightPanelStore((s) => s.setActiveFunction);
  const openShell = useSearchRightPanelStore((s) => s.openShell);
  const dismissToHub = useSearchRightPanelStore((s) => s.dismissToHub);
  const expanded = Boolean(activePanel);

  const toggle = () => {
    if (expanded) {
      dismissToHub();
      return;
    }
    const lastInfo = infoTabs.at(-1);
    if (lastInfo) setActiveInfoTab(lastInfo.id);
    else if (variant === 'assistant') openShell();
    else setActiveFunction('matrix');
  };

  return (
    <DockIconButton
      selected={expanded}
      title={expanded ? '关闭扩展区' : '打开扩展区'}
      onClick={toggle}
      className={className}
    >
      <PanelRightOpen className="size-4" strokeWidth={2} />
    </DockIconButton>
  );
}

/**
 * 叠在宿主容器右上角的入口(助手页)。
 * 只显示尚未展开的那一侧。
 */
export function ExpansionAreaOpenDock({
  className,
  variant = 'search',
}: {
  className?: string;
  variant?: RightPanelVariant;
}) {
  const fileAreaOpen = useSearchRightPanelStore((s) => s.fileAreaOpen);
  const activePanel = useSearchRightPanelStore((s) => s.activePanel);
  const assistant = variant === 'assistant';

  // 文件区已开时,「打开扩展区」改挂在文件区顶栏「关闭文件区」右侧,这里不再浮一层。
  const showFileBtn = !fileAreaOpen;
  const showExpansionBtn = !activePanel && !fileAreaOpen;

  if (!showFileBtn && !showExpansionBtn) return null;

  return (
    <aside
      aria-label={assistant ? '扩展区入口' : '工作区与扩展区入口'}
      className={cn('pointer-events-none absolute inset-0 z-40', className)}
    >
      <div className="pointer-events-auto absolute right-3 top-3 flex gap-2">
        {showFileBtn ? <FileAreaOpenButton /> : null}
        {showExpansionBtn ? (
          <ExpansionAreaOpenButton variant={variant} />
        ) : null}
      </div>
    </aside>
  );
}

/** Width-animated column: full pane when open, 0 when collapsed. */
export function AnimatedPane({
  open,
  openWidth,
  flexWhenOpen,
  children,
}: {
  open: boolean;
  openWidth?: number;
  flexWhenOpen?: boolean;
  children?: ReactNode;
}) {
  const reduce = !!useReducedMotion();
  const transition = reduce ? { duration: 0 } : PAGE_TRANSITION;

  return (
    <motion.div
      initial={false}
      animate={
        open
          ? flexWhenOpen
            ? { width: 'auto', flexGrow: 1 }
            : { width: openWidth, flexGrow: 0 }
          : { width: 0, flexGrow: 0 }
      }
      transition={transition}
      className={cn(
        'relative h-full min-h-0 overflow-hidden',
        open && flexWhenOpen ? 'min-w-0' : 'shrink-0',
      )}
    >
      <div
        className="h-full min-h-0"
        style={
          open || flexWhenOpen
            ? { width: '100%' }
            : { width: openWidth ?? 0 }
        }
      >
        {children}
      </div>
    </motion.div>
  );
}
