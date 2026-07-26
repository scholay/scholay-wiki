import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { WizardStep } from '../../types';

/**
 * 4 步进度条 —— 对照 .pen `yf01S` 的步骤列规格:
 *
 *   ○ ─── ○ ─── ● ─── ○
 *   已完成   已完成   当前   未到
 *
 *   - 圆点尺寸:28×28 圆角 14
 *   - 已完成:bg #E5E5E5 + ✓ 浅灰
 *   - 当前:bg #FFF5F5 + 1.5px #CC2222 描边 + 数字浅灰
 *   - 未到:bg #FFFFFF + 1.5px #E5E5E5 描边 + 数字 #AAAAAA
 *   - 标签:10px,当前 #CC2222 bold,其它 #888888 normal
 *   - 连接线:1.5px,已完成段 #E5E5E5,未到段 #E5E5E5(目前同色,设计稿如此)
 */
export interface StepIndicatorProps {
  current: WizardStep;
  steps: { id: WizardStep; label: string; subtitle?: string }[];
  /** 点击已完成 step 跳回 */
  onJump?: (step: WizardStep) => void;
}

export function StepIndicator({ current, steps, onJump }: StepIndicatorProps) {
  return (
    <ol className="flex w-full items-center">
      {steps.map((s, idx) => {
        const done = s.id < current;
        const active = s.id === current;
        const clickable = (done || s.id === current) && !!onJump;
        return (
          <li key={s.id} className="flex flex-1 items-center">
            {/* 节点 (圆点 + label) — 固定宽度避免被连接线挤压 */}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onJump?.(s.id)}
              className={cn(
                'flex w-20 shrink-0 flex-col items-center gap-1.5',
                clickable && 'cursor-pointer'
              )}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-pill border-[1.5px] text-2xs font-bold transition',
                  done && 'border-transparent bg-[#E5E5E5] text-faint',
                  active && 'border-brand-red bg-danger-soft text-brand-red',
                  !done && !active && 'border-border bg-background text-faint'
                )}
              >
                {done ? <Check className="size-3" /> : s.id}
              </span>
              <span
                className={cn(
                  'text-2xs whitespace-nowrap',
                  active ? 'font-bold text-brand-red' : 'text-faint'
                )}
              >
                {s.label}
              </span>
            </button>

            {/* 连接线 — 最后一节后面不画 */}
            {idx < steps.length - 1 && <div className="-mt-5 h-[1.5px] flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
