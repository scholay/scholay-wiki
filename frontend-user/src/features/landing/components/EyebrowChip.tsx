import { cn } from '@/shared/lib/utils';
import type { Eyebrow } from '../data/landings';

/**
 * Hero / Section 头部的小徽章 —— .pen `Eyebrow` `G4FEK1`:
 * 米黄底(prism-badge-bg #F0E8D8)+ 12px 600 字重 + 大字间距。
 *
 * dot 可选(●/✦/✓ 等),颜色 token 化(red/amber/green)。
 */
const DOT_COLOR: Record<NonNullable<Eyebrow['dotColor']>, string> = {
  red: 'text-brand-red',
  amber: 'text-brand-amber',
  green: 'text-brand-green',
};

export function EyebrowChip({
  eyebrow,
  className,
}: {
  eyebrow: Eyebrow;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-prism-badge-bg',
        'text-2xs font-semibold tracking-[0.15em] text-prism-badge-fg uppercase whitespace-nowrap',
        className
      )}
    >
      {eyebrow.dot && (
        <span
          aria-hidden
          className={cn(
            'text-2xs leading-none',
            eyebrow.dotColor ? DOT_COLOR[eyebrow.dotColor] : 'text-foreground'
          )}
        >
          {eyebrow.dot}
        </span>
      )}
      {eyebrow.text}
    </span>
  );
}
