import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { WizardStep } from '@/shared/lib/peer-review/types';

/**
 * 4 步进度条:
 *
 *   ○ ─── ○ ─── ● ─── ○
 *   已完成   已完成   当前   未到
 *
 * ⚠️ 本文件头原先照抄 .pen `yf01S` 的规格(bg #E5E5E5 / #FFF5F5 / 1.5px #CC2222 /
 *    标签 10px #888888)。**.pen 口径已于 2026-07 作废**(真源换成 Figma,见 globals.css 头),
 *    那几个 hex 全是退休色 —— 不要再照它改。现行规格:
 *
 *   - 圆点尺寸:28×28(size-7)· 胶囊
 *   - 已完成:bg-surface-2(#E8E5DC)+ ✓ text-faint,无描边
 *     (旧 #E5E5E5 是体系外冷灰;surface-2 与它相对亮度实测同为 0.783,只是随全站从冷灰转暖米)
 *   - 当前:bg-danger-soft + border-brand-red + text-brand-red
 *   - 未到:bg-surface-card + border-border + text-faint
 *   - 标签:text-12(旧稿 10px 不在 Figma 六档内),当前 font-medium/brand-red,其余 text-faint
 *   - 连接线:h-[1.5px] bg-border,两段同色
 *
 *   描边/连接线的 1.5px 属 Figma 描边集合 {1, 1.5}(§4.5 图标描边 #1F1F23 / 1.5px),
 *   Tailwind 无 1.5px 边框档(border 只有 0/1/2/4/8),故保留 arbitrary value。
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
                  'flex size-7 items-center justify-center rounded-pill border-[1.5px] text-12 font-medium transition',
                  done && 'border-transparent bg-surface-2 text-faint',
                  active && 'border-brand-red bg-danger-soft text-brand-red',
                  !done && !active && 'border-border bg-surface-card text-faint'
                )}
              >
                {done ? <Check className="size-3" /> : s.id}
              </span>
              <span
                className={cn(
                  'text-12 whitespace-nowrap',
                  active ? 'font-medium text-brand-red' : 'text-faint'
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
