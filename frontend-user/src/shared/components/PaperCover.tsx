import { cn } from '@/shared/lib/utils';

/**
 * 稿件 / 论文封面占位 —— 竖版纸页:顶栏色条 + 首字 + 正文行纹。
 * 取色按 title 哈希到 --cat-1..8,同题永远同色。
 */
const COVER_TONES = [
  'bg-cat-1',
  'bg-cat-2',
  'bg-cat-3',
  'bg-cat-4',
  'bg-cat-5',
  'bg-cat-6',
  'bg-cat-7',
  'bg-cat-8',
] as const;

function pickTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COVER_TONES[Math.abs(h) % COVER_TONES.length];
}

interface PaperCoverProps {
  title: string;
  size?: 'sm' | 'tile';
  className?: string;
}

export function PaperCover({ title, size = 'sm', className }: PaperCoverProps) {
  const tone = pickTone(title);
  const initial = title.trim().charAt(0) || '稿';
  const dims = size === 'tile' ? 'h-16 w-16' : 'h-28 w-20';

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col overflow-hidden rounded-8 border border-border bg-surface-card',
        dims,
        className,
      )}
      title={title}
    >
      <div className={cn('h-1.5 shrink-0', tone)} />
      <div className="flex min-h-0 flex-1 flex-col justify-between p-1.5">
        <span className="font-serif text-16 font-bold leading-none text-foreground">
          {initial}
        </span>
        <div className="space-y-1">
          <span className="block h-0.5 w-full rounded-pill bg-foreground/15" />
          <span className="block h-0.5 w-4/5 rounded-pill bg-foreground/12" />
          <span className="block h-0.5 w-2/3 rounded-pill bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}
