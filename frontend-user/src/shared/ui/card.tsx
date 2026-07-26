import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * Card —— 卡片容器原子。
 *
 * 存在理由: 改造前全站有 508 处手拼「rounded-* + border-* + bg-*」的卡片,
 * 每处的圆角/描边/内边距/底色都各拍一套,是「资产不统一」最大的单一来源。
 *
 * 规格来自 Figma §4.4 Default Card:
 *   容器 border-radius 16 · bg #FFFFFF · padding 16 · gap 8
 * 外层展示区(坐在米白页面底上的大区块)用 `variant="section"`。
 *
 * ⚠️ 圆角用新标度 rounded-16。把手拼卡片迁到 <Card> 的同时,
 *    该站点的圆角也就完成了 B5 迁移(旧手拼多为 rounded-sm/md = 4/6px)。
 */
const cardVariants = cva('', {
  variants: {
    variant: {
      /** 标准卡片 —— 纯白底 + 弱描边,坐在米白页面上 */
      default: 'rounded-16 border border-border bg-surface-card',
      /** 区块 —— 米白底,用于页面级分区(Figma 展示区形态) */
      section: 'rounded-16 bg-background',
      /** 无描边 —— 靠底色差分层(Figma 卡片规格本身没有描边) */
      plain: 'rounded-16 bg-surface-card',
      /** 弱卡片 —— 工具栏/次要信息块 */
      subtle: 'rounded-12 border border-border-hairline bg-surface-1',
      /** 幽灵 —— 只有圆角与内边距,底色描边都交给调用方 */
      ghost: 'rounded-16',
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
    interactive: {
      true: 'text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      false: '',
    },
  },
  defaultVariants: { variant: 'default', padding: 'md', interactive: false },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** 渲染成什么元素 —— 可点击卡片传 'button',列表项传 'li',语义分区传 'section' */
  as?: 'div' | 'section' | 'article' | 'li' | 'button';
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, interactive, as = 'div', ...props }, ref) => {
    const Comp = as as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(cardVariants({ variant, padding, interactive }), className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    // Figma §4.4 卡片主文 500 / 14px
    <h3 ref={ref} className={cn('text-md font-medium text-foreground', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    // Figma §4.4 卡片次文 400 / 12px
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-2', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
};
