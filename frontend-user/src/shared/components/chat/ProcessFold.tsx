import { useState } from 'react';
import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * 「处理过程」可收起容器(prism 发源,admin 会话监控渲染 prism transcript 复用):
 * 流式中默认展开(让用户实时看到工具步骤),完成后默认收起成一行「处理过程 · N 步」标题。
 * 用户可点标题手动 override 展开/收起。
 */
export function ProcessFold({
  streaming,
  toolSteps,
  children,
}: {
  streaming: boolean;
  toolSteps: number;
  children: React.ReactNode;
}) {
  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const expanded = override ?? streaming;
  return (
    <div className="rounded-12 border border-border-soft bg-surface-1/60">
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {streaming ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-brand-green" />
        ) : (
          <Sparkles className="size-3 shrink-0 text-brand-green" />
        )}
        <span className="font-medium">处理过程{toolSteps > 0 ? ` · ${toolSteps} 步` : ''}</span>
        <ChevronRight
          className={cn('ml-auto size-3 shrink-0 transition-transform', expanded && 'rotate-90')}
        />
      </button>
      {expanded && <div className="flex flex-col gap-2 px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}
