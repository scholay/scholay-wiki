import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * 「Scholay」品牌名 —— 全应用唯一渲染组件,所有"内文 / toast / 卡片标题 / 法律段"
 * 出现 Scholay 字样都走这里,保证字体 / 字重 / 颜色一致。
 *
 * 不接管 H1 / Logo 等"标题角色"的 Scholay 字样(那些位置有自己更强的视觉表达);
 * 也不接管 <title> meta(那是 SEO,不是 UI 文字)。
 *
 * 三个 tone:
 *   - `default` —— 与父级文字色一致 + font-display + font-semibold,既不抢戏也
 *     比周围字稍重一点,提醒读者这是品牌名而非普通词
 *   - `strong` —— text-foreground + font-bold,用在引文 / 强调段落
 *   - `subtle` —— inherit color + font-display + font-medium,用在 footer /
 *     版权这种克制场景
 */
export type BrandNameTone = 'default' | 'strong' | 'subtle';

interface BrandNameProps {
  tone?: BrandNameTone;
  className?: string;
}

const TONE_CLS: Record<BrandNameTone, string> = {
  default: 'font-display font-semibold',
  strong: 'font-display font-bold text-foreground',
  subtle: 'font-display font-medium',
};

export const BrandName = forwardRef<HTMLSpanElement, BrandNameProps>(
  ({ tone = 'default', className }, ref) => {
    return (
      <span
        ref={ref}
        className={cn('inline-block tracking-brand', TONE_CLS[tone], className)}
      >
        Scholay
      </span>
    );
  }
);
BrandName.displayName = 'BrandName';
