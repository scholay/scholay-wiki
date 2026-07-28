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
 * 圆角通过 className 传入 (默认 rounded-8, 对齐被包裹的表单字段), 蒙层用 rounded-[inherit] 对齐。
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
      <div ref={ref} className={cn('relative rounded-8', className)}>
        {children}
        {active && (
          // rounded-[inherit]:蒙层必须跟随调用方传入的圆角(可能是 8/12/16 任意档),
          // 是 CSS 关键字而非设计值,token 层无法表达,保留 arbitrary。
          // backdrop-blur-2 = --blur-2(2px)。内建最小档 blur-xs(4px)会把表单彻底糊掉,
          // 而这里的设计意图正是「内容仍隐约可见」,故走项目自己的 2px 档。
          <div className="absolute inset-0 z-raised flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-surface-card/70 backdrop-blur-2">
            {/* [animation-delay:*] 是三点跳动的相位错开,属动画参数而非设计 token,保留 arbitrary */}
            <div className="flex gap-1.5">
              <span className="size-2 animate-bounce rounded-pill bg-brand-green [animation-delay:-0.3s] motion-reduce:animate-none" />
              <span className="size-2 animate-bounce rounded-pill bg-brand-green [animation-delay:-0.15s] motion-reduce:animate-none" />
              <span className="size-2 animate-bounce rounded-pill bg-brand-green motion-reduce:animate-none" />
            </div>
            {/* 主文案 text-14(它是标题层,不是控件);副文案 text-12 次文层
                (与 CardDescription 同层,Figma §4.4 次文 12px),同字号会让两行糊成一块。 */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-14 font-medium text-foreground">{label}</span>
              <span className="text-12 text-muted-foreground">Analyzing your request…</span>
            </div>
          </div>
        )}
      </div>
    );
  },
);
AIOverlay.displayName = 'AIOverlay';
