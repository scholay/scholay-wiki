import type { ComponentType, ReactNode } from 'react';
import { RhinoBrandIcon } from '@/shared/components/RhinoBrandIcon';
import { cn } from '@/shared/lib/utils';

function HeadingIconSlot({
  compact,
  mark,
  Icon,
  iconClassName,
}: {
  compact: boolean;
  mark: boolean;
  Icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
}) {
  const box = compact ? 'size-8' : 'size-10';

  if (mark) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center overflow-visible',
          box,
        )}
      >
        <RhinoBrandIcon aria-hidden className="size-full" />
      </span>
    );
  }

  if (Icon) {
    return (
      <Icon
        className={cn(
          'shrink-0 text-foreground',
          iconClassName ?? (compact ? 'size-7' : 'size-10'),
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      data-icon-placeholder
      className={cn(
        'inline-flex shrink-0 rounded-8 border border-dashed border-border',
        box,
      )}
    />
  );
}

/**
 * Feature first-screen heading. Logo is never a nest —
 * site nests live on the homepage card or the bottom-right corner.
 * Wordmark is not used here; each feature supplies an icon (or a placeholder).
 */
export function FeatureBrandHeading({
  title,
  icon: Icon,
  iconClassName,
  as: Tag = 'h2',
  size = 'default',
  mark = false,
  trailing,
  className,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  /** Overrides the default icon box (size-10 / size-7). */
  iconClassName?: string;
  as?: 'h1' | 'h2';
  /** card = hub 入口预览,缩小 logo 与标题。 */
  size?: 'default' | 'card';
  /** Square horn mark to the left of the title. */
  mark?: boolean;
  /** After the title text (e.g. a help affordance). */
  trailing?: ReactNode;
  className?: string;
}) {
  const compact = size === 'card';

  return (
    <Tag
      className={cn(
        'm-0 flex items-center justify-center gap-2.5 overflow-visible',
        className,
      )}
    >
      <span className="flex items-center gap-2.5">
        <HeadingIconSlot
          compact={compact}
          mark={mark}
          Icon={Icon}
          iconClassName={iconClassName}
        />
        <span
          className={cn(
            'font-serif font-bold tracking-tight text-foreground',
            compact ? 'text-20' : 'text-32',
          )}
        >
          {title}
        </span>
        {trailing}
      </span>
    </Tag>
  );
}
