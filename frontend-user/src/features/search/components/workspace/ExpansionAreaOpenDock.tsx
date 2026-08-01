import { PanelRightOpen } from 'lucide-react';
import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
import { cn } from '@/shared/lib/utils';

/** 右上角图标 —— 打开右侧拓展区(论文详情 / 产物 / 工作区功能)。 */
export function ExpansionAreaOpenButton({
  className,
}: {
  className?: string;
}) {
  const infoTabs = useSearchRightPanelStore((s) => s.infoTabs);
  const setActiveInfoTab = useSearchRightPanelStore((s) => s.setActiveInfoTab);
  const openShell = useSearchRightPanelStore((s) => s.openShell);

  const openExpansionArea = () => {
    const lastInfo = infoTabs.at(-1);
    if (lastInfo) setActiveInfoTab(lastInfo.id);
    else openShell();
  };

  return (
    <button
      type="button"
      onClick={openExpansionArea}
      title="打开右侧扩展区"
      aria-label="打开右侧扩展区"
      className={cn(
        'inline-flex size-9 cursor-pointer items-center justify-center',
        'rounded-lg border border-border bg-background text-muted-foreground shadow-sm',
        'transition-colors hover:border-border-strong hover:bg-surface-1 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
        className,
      )}
    >
      <PanelRightOpen className="size-4" strokeWidth={2} />
    </button>
  );
}

/** 叠在宿主容器右上角的扩展区入口(智能助手 / 检索工作区共用)。 */
export function ExpansionAreaOpenDock({ className }: { className?: string }) {
  return (
    <aside
      aria-label="扩展区入口"
      className={cn('pointer-events-none absolute inset-0 z-40', className)}
    >
      <ExpansionAreaOpenButton className="pointer-events-auto absolute right-3 top-3" />
    </aside>
  );
}
