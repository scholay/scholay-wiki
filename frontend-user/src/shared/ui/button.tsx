import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * 圆角策略 —— Figma §4.1 的四个按钮变体(Primary/Secondary/Disabled/Tertiary)
 * 全部是胶囊(120×42,r40 在 42 高上即胶囊)。但【只有实心与描边变体胶囊化】:
 *   · ghost / link 本来就没有可见形状,胶囊化只会让 hover 底色看着怪
 *   · size="icon" 是正方形,胶囊化会变成【正圆】—— 与头像撞形,
 *     用户分不清「这是头像还是按钮」。故 icon 强制回控件档 rounded-8。
 * 用 compoundVariants 表达这个按变体/尺寸的分流规则。
 *
 * ⚠️ 本改动影响全部 <Button> 调用点(约 306 处),是刻意单独成批的,
 *    便于单独视觉回归与单独回滚。
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-12 font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'rounded-pill bg-foreground text-on-brand hover:bg-foreground/90 active:bg-foreground/85',
        primary:
          'rounded-pill bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85',
        destructive:
          'rounded-pill bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Figma §4.1 Tertiary: 透明底 + 深色 1px 描边 —— 用控件族的 border token
        outline:
          'rounded-pill border border-border-control-emphasis bg-surface-card text-foreground hover:bg-surface-2',
        secondary:
          'rounded-pill bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'rounded-8 hover:bg-surface-2 text-foreground',
        link: 'rounded-8 text-foreground underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-12',
        default: 'h-8 px-3',
        lg: 'h-10 px-4 text-12',
        icon: 'h-8 w-8',
      },
    },
    compoundVariants: [
      // 正方形图标按钮不胶囊化 —— 否则成正圆,与头像撞形
      { size: 'icon', className: 'rounded-8' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
