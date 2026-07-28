import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * 徽章 —— 状态标签(Prism 角标 / 编译中 / 选中态 等)。
 * 颜色一律走语义 token(prism-badge-* / warning-soft / brand-*),
 * 旧注释里列的 .pen 硬编码色值(#F0E8D8 / #D4A017 / #F5F5F5 / #111)已被 token 收口,
 * 真源改为 Figma(docs/figma-design-spec-2026-07.md)。
 *
 * 字号 KEEP text-12 —— Figma §4.2「Badge / Label」明写 `Google Sans 400 / 12px`。
 * Badge 本就该比正文小一档,与控件基座同为 text-12。
 *
 * h-[18px] 是保留的 arbitrary value:Figma §4.2 给的是 46×23,现行 18px 是项目自有的
 * 紧凑档(全站 badge 多为行内内联,23px 会把表格行/卡片标题行撑高)。
 * token 侧无 18px 档(最近的 h-control-xs = 24),故保留精确像素。
 * 【已知偏离 Figma §4.2 高度】,记在 docs/design-migration-ledger-2026-07.md 待设计师裁决。
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill border border-transparent px-2 h-[18px] text-12 font-medium transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-surface-2 text-foreground',
        outline: 'bg-surface-card text-foreground border-border',
        muted: 'bg-surface-1 text-muted-foreground',
        success: 'bg-brand-green/10 text-brand-green',
        warning: 'bg-warning-soft text-brand-amber',
        destructive: 'bg-destructive/10 text-destructive',
        prism: 'bg-prism-badge-bg text-prism-badge-fg',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
