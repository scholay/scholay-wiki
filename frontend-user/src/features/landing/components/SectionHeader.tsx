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
          'text-12 font-medium uppercase',
          dark ? 'text-faint' : 'text-muted-foreground'
        )}
      >
        {eyebrow}
      </span>
      <h2
        className={cn(
          'font-display italic font-medium leading-display-tight',
          // landing 展示级标题:随视口连续缩放,token 的离散档表达不了 clamp → 保留 arbitrary。
          // 取值区间落在展示档(display-36/56)两侧,不属于正文六档阶梯。
          'text-[clamp(32px,4vw,48px)]',
          dark ? 'text-on-dark' : 'text-foreground'
        )}
      >
        {title}
      </h2>
      {sub && (
        <p
          className={cn(
            'text-16 leading-paragraph max-w-[720px]',
            dark ? 'text-faint' : 'text-subtle'
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
