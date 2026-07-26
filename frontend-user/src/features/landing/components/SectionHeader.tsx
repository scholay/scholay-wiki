import { cn } from '@/shared/lib/utils';

/**
 * Section 顶部统一头部 —— .pen 通用模式:
 *   eyebrow(uppercase + tracking)→ Playfair italic 大标题(40~48px)→ 描述
 *
 * 居中或左对齐由 align 控制。
 */
export function SectionHeader({
  eyebrow,
  title,
  sub,
  align = 'center',
  dark = false,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  align?: 'center' | 'left';
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center max-w-[820px] mx-auto' : 'items-start'
      )}
    >
      <span
        className={cn(
          'text-2xs font-semibold uppercase',
          dark ? 'text-faint' : 'text-muted-foreground'
        )}
      >
        {eyebrow}
      </span>
      <h2
        className={cn(
          'font-display italic font-medium leading-display-tight',
          'text-[clamp(32px,4vw,48px)]',
          dark ? 'text-background' : 'text-foreground'
        )}
      >
        {title}
      </h2>
      {sub && (
        <p
          className={cn(
            'text-lg leading-paragraph max-w-[720px]',
            dark ? 'text-faint' : 'text-subtle'
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
