import { Grid3x3, MessageSquare, Share2, Wrench, X } from 'lucide-react';
import {
  useSearchRightPanelStore,
  WORKSPACE_FUNCTION_LABEL,
  WORKSPACE_FUNCTION_ORDER,
  type WorkspaceFunctionKind,
} from '@/stores/search-right-panel.store';
import { cn } from '@/shared/lib/utils';

export function functionIcon(kind: WorkspaceFunctionKind) {
  switch (kind) {
    case 'pdf-chat':
      return MessageSquare;
    case 'citation-graph':
      return Share2;
    case 'matrix':
      return Grid3x3;
  }
}

function FunctionTabButton({
  kind,
  checked,
  onToggle,
}: {
  kind: WorkspaceFunctionKind;
  checked: boolean;
  onToggle: () => void;
}) {
  const Icon = functionIcon(kind);
  const label = WORKSPACE_FUNCTION_LABEL[kind];
  return (
    <button
      type="button"
      onClick={onToggle}
      title={checked ? `取消 ${label}` : `打开 ${label}`}
      aria-label={checked ? `取消 ${label}` : `打开 ${label}`}
      role="radio"
      aria-checked={checked}
      className={cn(
        'inline-flex h-7 min-w-7 max-w-[7.5rem] shrink items-center gap-1 overflow-hidden rounded-sm border px-1.5 text-xs font-semibold transition-colors',
        checked
          ? 'border-brand-red/30 bg-brand-red/5 text-brand-red shadow-sm'
          : 'border-border bg-background text-subtle hover:border-border-strong hover:bg-surface-1 hover:text-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

/** 文件区功能开关:三项互斥,再点当前项可取消。 */
export function FunctionTabGroup({ className }: { className?: string }) {
  const functionTabs = useSearchRightPanelStore((s) => s.functionTabs);
  const toggleFunctionTab = useSearchRightPanelStore((s) => s.toggleFunctionTab);

  return (
    <div
      className={cn('flex min-w-0 items-center gap-1', className)}
      role="radiogroup"
      aria-label="工作区功能"
    >
      {WORKSPACE_FUNCTION_ORDER.map((kind) => (
        <FunctionTabButton
          key={kind}
          kind={kind}
          checked={functionTabs.includes(kind)}
          onToggle={() => toggleFunctionTab(kind)}
        />
      ))}
    </div>
  );
}

/** 拓展区顶栏里已打开的功能 tab,扳手 + 名称。 */
export function FunctionPageTab({
  kind,
  active,
  onSelect,
  onClose,
}: {
  kind: WorkspaceFunctionKind;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const label = WORKSPACE_FUNCTION_LABEL[kind];
  return (
    <div
      className={cn(
        'group relative inline-flex h-7 max-w-[7.5rem] shrink items-center overflow-hidden rounded-sm border',
        active
          ? 'border-brand-red/30 bg-brand-red/5 text-brand-red shadow-sm'
          : 'border-border bg-background text-subtle hover:border-border-strong hover:bg-surface-1 hover:text-foreground',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="inline-flex h-full min-w-0 items-center gap-1 px-1.5 text-xs font-semibold"
        title={label}
        aria-label={label}
      >
        <Wrench className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={`关闭 ${label}`}
        title={`关闭 ${label}`}
        className={cn(
          'absolute right-0.5 top-1/2 z-[1] inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm',
          'bg-background/90 text-muted-foreground opacity-0 transition-opacity',
          'hover:bg-surface-2 hover:text-foreground',
          'group-hover:opacity-100 group-focus-within:opacity-100',
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
