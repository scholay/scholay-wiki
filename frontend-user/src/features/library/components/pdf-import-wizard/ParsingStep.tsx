import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { ParsingPhase } from './types';

/**
 * Step 2 —— 后端 SSE 推送阶段事件,3 段进度:
 *   上传文件 → 解析标题 + 三源搜索 → 准备就绪
 */
export function ParsingStep({ phase }: { phase: ParsingPhase }) {
  const steps: { key: ParsingPhase; label: string }[] = [
    { key: 'uploading', label: '上传文件' },
    { key: 'searching', label: '解析标题 + 三源搜索' },
    { key: 'done', label: '准备就绪' },
  ];
  const order: ParsingPhase[] = ['uploading', 'parsed', 'searching', 'done'];
  const currentIdx = order.indexOf(phase);

  return (
    <div className="py-8">
      <div className="flex items-center justify-center mb-6 gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">正在处理…</span>
      </div>
      <ul className="space-y-2 max-w-[420px] mx-auto">
        {steps.map((s) => {
          // 已完成判断:除"准备就绪"外,只要当前进入下一阶段就算完
          const stepIdx = order.indexOf(s.key);
          const isActive = phase === s.key;
          const isDone = stepIdx < currentIdx || phase === 'done';
          return (
            <li
              key={s.key}
              className={cn(
                'flex items-center gap-3 text-sm',
                isDone
                  ? 'text-foreground'
                  : isActive
                    ? 'text-foreground font-medium'
                    : 'text-faint'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-pill border shrink-0 text-xs',
                  isDone
                    ? 'bg-brand-green/15 border-brand-green text-brand-green'
                    : isActive
                      ? 'border-foreground text-foreground'
                      : 'border-border text-faint'
                )}
              >
                {isDone ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : isActive ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  '·'
                )}
              </span>
              {s.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
