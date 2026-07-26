import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * 期刊封面图占位 —— 上游不提供真实封面图,按设计稿用一组深色调实底块,
 * 顶部大字显示期刊名首字母(NP / Cell / IEEE 等),底部小字显示完整名。
 * .pen 期刊搜索结果页 / 详情页都用这个 cover 视觉。
 *
 * 取色:按 journal.id 哈希到 8 色深调里,稳定 (同 id 永远同色)。
 */
const PALETTE = [
  '#0A1428',
  '#1B2845',
  '#003366',
  '#5B2C6F',
  '#7A1F1F',
  '#1F3A5F',
  '#2A4D6C',
  '#264653',
] as const;

function pickColor(id: number): string {
  if (!id || id < 0) return PALETTE[0];
  return PALETTE[id % PALETTE.length];
}

/** 从期刊名抽缩写:首词大写 + 第二词大写 + 限制 3 字符,空就取前两个字符 */
function pickAbbrev(name: string): string {
  if (!name) return '?';
  const cleaned = name.replace(/[\(\)\.,]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return cleaned.slice(0, 2).toUpperCase();
  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

interface JournalCoverProps {
  id: number;
  name: string;
  /**
   * 卡片尺寸:'sm' = 详情页 hero,'card' = 搜索结果卡左侧,'lg' = 详情大 cover,
   * 'tile' = 64px 方形纯字标(移动端期刊 feed identity 行,.pen `eBxVg`,无底部全名)
   */
  size?: 'card' | 'sm' | 'lg' | 'tile';
  className?: string;
}

export const JournalCover = forwardRef<HTMLDivElement, JournalCoverProps>(
  ({ id, name, size = 'card', className }, ref) => {
    const color = pickColor(id);
    const abbrev = pickAbbrev(name);

    if (size === 'tile') {
      return (
        <div
          ref={ref}
          className={cn(
            'shrink-0 rounded-md overflow-hidden flex items-center justify-center w-16 h-16 text-white',
            className
          )}
          style={{ backgroundColor: color }}
          title={name}
        >
          <span className="font-bold leading-none text-xl">
            {abbrev}
          </span>
        </div>
      );
    }

    const dims =
      size === 'lg'
        ? 'w-32 h-44'
        : size === 'sm'
          ? 'w-20 h-28'
          : 'w-[120px] h-full';

    const abbrevSize =
      size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-xl' : 'text-2xl';

    return (
      <div
        ref={ref}
        className={cn(
          'shrink-0 rounded-md overflow-hidden flex flex-col justify-between p-3 text-white',
          dims,
          className
        )}
        style={{ backgroundColor: color }}
      >
        <span
          className={cn(
            'font-bold leading-none',
            abbrevSize
          )}
        >
          {abbrev}
        </span>
        <span
          className="text-2xs text-white/70 line-clamp-3"
          title={name}
        >
          {name}
        </span>
      </div>
    );
  }
);
JournalCover.displayName = 'JournalCover';
