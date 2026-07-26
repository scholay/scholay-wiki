import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * AIOverlay — AI 解析等待态:给被包裹的表单盖一层半透明蒙层 + 居中 loading 文案。
 *
 * 取代早先的"霓虹流光描边" (.ai-glow) —— 那种闪烁干扰阅读, 改成安静的蒙层式 loading:
 * 表单内容仍隐约可见 (bg-background/70 + 轻微 backdrop-blur), 中间三点跳动 + 主文案。
 *
 * 用法不变: <AIOverlay active={computing}><form .../></AIOverlay>
 *   active=true 时盖蒙层并拦截交互 (蒙层在最上层吃掉点击); false 时就是个透传容器。
 * 圆角通过 className 传入 (默认 rounded-md), 蒙层用 rounded-[inherit] 对齐。
 */
export interface AIOverlayProps {
  active?: boolean;
  className?: string;
  /** 中文主文案, 默认 "AI 正在解析中" */
  label?: string;
  children: ReactNode;
}

export const AIOverlay = forwardRef<HTMLDivElement, AIOverlayProps>(
  ({ active, className, label = 'AI 正在解析中', children }, ref) => {
    return (
      <div ref={ref} className={cn('relative rounded-md', className)}>
        {children}
        {active && (
          <div className="absolute inset-0 z-raised flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-background/70 backdrop-blur-[2px]">
            <div className="flex gap-1.5">
              <span className="size-2 animate-bounce rounded-pill bg-brand-green [animation-delay:-0.3s] motion-reduce:animate-none" />
              <span className="size-2 animate-bounce rounded-pill bg-brand-green [animation-delay:-0.15s] motion-reduce:animate-none" />
              <span className="size-2 animate-bounce rounded-pill bg-brand-green motion-reduce:animate-none" />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-base font-bold text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">Analyzing your request…</span>
            </div>
          </div>
        )}
      </div>
    );
  },
);
AIOverlay.displayName = 'AIOverlay';
