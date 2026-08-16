import type { ComponentType } from 'react';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { BrandMarkNest } from '@/shared/components/BrandMarkNest';
import { cn } from '@/shared/lib/utils';

/**
 * Feature first-screen heading. Default: hex + wordmark, and the hex is 牛犀犀's
 * nest. Pass `mark={false}` to keep the Scholay wordmark without the hex / nest
 * (literature search, journals, datasets, news, library).
 * Compact hub cards stay as a static lockup (too small, many on one page).
 */
export function FeatureBrandHeading({
  title,
  icon: Icon,
  iconClassName,
  as: Tag = 'h2',
  size = 'default',
  mark = true,
  className,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  /** Overrides the default icon box (size-10 / size-7). */
  iconClassName?: string;
  as?: 'h1' | 'h2';
  /** card = hub 入口预览,缩小 logo 与标题。 */
  size?: 'default' | 'card';
  /** Hex lockup / nest. Off = wordmark only, no nest. */
  mark?: boolean;
  className?: string;
}) {
  const compact = size === 'card';
  const logoSize = compact ? 'md' : 'xl';
  const nest = mark && !compact;

  return (
    <Tag
      className={cn(
        'm-0 flex items-center justify-center gap-2.5 overflow-visible',
        className,
      )}
    >
      {nest ? (
        <BrandMarkNest playOnceKey={`scholay.nest:${title}`} size={logoSize} />
      ) : (
        <BrandLogo
          size={logoSize}
          variant={mark ? 'full' : 'wordmark'}
        />
      )}
      <span className="flex items-center gap-2.5">
        {Icon ? (
          <Icon
            className={cn(
              'shrink-0 text-foreground',
              iconClassName ?? (compact ? 'size-7' : 'size-10'),
            )}
          />
        ) : null}
        <span
          className={cn(
            'font-serif font-bold tracking-tight text-foreground',
            compact ? 'text-20' : 'text-32',
          )}
        >
          {title}
        </span>
      </span>
    </Tag>
  );
}
