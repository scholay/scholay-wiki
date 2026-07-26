import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Scholay 多色品牌 Logo —— 对照 .pen `ItHvU` 设计:
 *   S (red) · ch (green) · o (amber) · l (black) · a (red) · y (green)
 *   Playfair Display 700,字母 bottom-aligned。
 *
 * 用途:首页 hero(xl)/ 登录弹窗(md)/ TopNav(sm)。
 * 颜色全部走 brand-* token,主题切换自动适配。
 */
type Size = 'sm' | 'md' | 'lg' | 'xl';

/** .pen `ItHvU` 设计稿 hero logo 是 56px,Tailwind 默认无此档位(48 与 60 之间),保留 arbitrary value */
const SIZE_MAP: Record<Size, string> = {
  sm: 'text-20',
  md: 'text-28',
  lg: 'text-display-56',
  xl:'text-[56px] leading-none',
};

const LETTERS: { ch: string; color: string }[] = [
  { ch: 'S', color: 'text-brand-red' },
  { ch: 'c', color: 'text-brand-green' },
  { ch: 'h', color: 'text-brand-green' },
  { ch: 'o', color: 'text-brand-amber' },
  { ch: 'l', color: 'text-foreground' },
  { ch: 'a', color: 'text-brand-red' },
  { ch: 'y', color: 'text-brand-green' },
];

interface BrandLogoProps {
  size?: Size;
  className?: string;
}

export const BrandLogo = forwardRef<HTMLSpanElement, BrandLogoProps>(
  ({ size = 'md', className }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-end font-display font-bold tracking-brand select-none',
          SIZE_MAP[size],
          className
        )}
        aria-label="Scholay"
      >
        {LETTERS.map(({ ch, color }, i) => (
          <span key={i} className={color}>
            {ch}
          </span>
        ))}
      </span>
    );
  }
);
BrandLogo.displayName = 'BrandLogo';
