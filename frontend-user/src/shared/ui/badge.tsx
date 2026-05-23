import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * 徽章 — 对齐 .pen 中常见的状态标签:
 *   Prism 角标 #F0E8D8 / 编译中 #D4A017 / 选中态 #F5F5F5 +左边线 #111
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill border border-transparent px-2 h-[18px] text-2xs font-medium transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-surface-2 text-foreground',
        outline: 'bg-background text-foreground border-border',
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
