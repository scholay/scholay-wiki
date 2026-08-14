import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * 期刊封面图占位 —— 上游不提供真实封面图,按设计稿用一组深色调实底块,
 * 顶部大字显示期刊名首字母(NP / Cell / IEEE 等),底部小字显示完整名。
 * .pen 期刊搜索结果页 / 详情页都用这个 cover 视觉。
 *
 * 取色:按 journal.id 哈希到分类色板 `--cat-1..8`,稳定 (同 id 永远同色)。
 * 色值真源是 globals.css §七,本文件只持有类名 —— 旧的 8 色硬编码 PALETTE 已删除
 * (那一版 8 个里 6 个是蓝/青调,与四色系统冲突且互相分不开)。哈希算法未变,
 * 仍是 `id % 8`,只换了色值来源。
 *
 * 前景对比度(实测 WCAG,底色即 --cat-N):
 *   text-on-brand #FFFFFF  → cat-1 14.56 / cat-2 11.87 / cat-3 13.57 / cat-4 9.48 /
 *                            cat-5 8.17 / cat-6 5.97 / cat-7 16.43 / cat-8 11.62,全部 ≥ AA。
 *   底部全名行原本是 text-on-brand/70,在最浅的 cat-6 上只有 3.84:1(不达标)→ 提到 /85,
 *   最差档 cat-6 4.83:1 过 AA。
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

function pickTone(id: number): string {
  if (!id || id < 0) return COVER_TONES[0];
  return COVER_TONES[id % COVER_TONES.length];
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
    const tone = pickTone(id);
    const abbrev = pickAbbrev(name);

    if (size === 'tile') {
      return (
        <div
          ref={ref}
          className={cn(
            'shrink-0 rounded-8 overflow-hidden flex items-center justify-center w-16 h-16 text-on-brand',
            tone,
            className
          )}
          title={name}
        >
          <span className="font-medium leading-none text-20">
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
      size === 'lg' ? 'text-28' : size === 'sm' ? 'text-20' : 'text-24';

    return (
      <div
        ref={ref}
        className={cn(
          'shrink-0 rounded-8 overflow-hidden flex flex-col justify-between p-3 text-on-brand',
          dims,
          tone,
          className
        )}
      >
        <span
          className={cn(
            'font-medium leading-none',
            abbrevSize
          )}
        >
          {abbrev}
        </span>
        <span
          className="text-12 text-on-brand/85 line-clamp-3"
          title={name}
        >
          {name}
        </span>
      </div>
    );
  }
);
JournalCover.displayName = 'JournalCover';
