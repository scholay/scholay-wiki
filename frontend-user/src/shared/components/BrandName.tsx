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
 *   - `default` —— 与父级文字色一致 + font-brand + font-medium,既不抢戏也
 *     比周围字稍重一点,提醒读者这是品牌名而非普通词
 *   - `strong` —— text-foreground + font-bold,用在引文 / 强调段落
 *   - `subtle` —— inherit color + font-brand + font-normal,用在 footer /
 *     版权这种克制场景
 *
 * 📌 已知代价(2026-08-11 全站改系统字体后): --font-brand 实际命中的
 * Didot(mac)/ Georgia(win)都只有 400/700 两个字面,无 500 ——
 * CSS 对 500 的匹配是降到 400(不合成),所以 default 与 subtle 在没装
 * Playfair Display 的机器上渲染相同,三档实际塌成两档(strong 的 700 仍真)。
 * 这是 webfont 时代 2026-07-27 用可变字体修过的问题在系统字体约束下的
 * 部分回归,属「零下载」决策的固有代价;不要试图用 600 触发合成来「修」——
 * 假粗体在高对比 Didone 上的损伤比档位塌缩更难看。三档语义保留,
 * 待未来若恢复品牌 webfont 可原样生效。
 */
export type BrandNameTone = 'default' | 'strong' | 'subtle';

interface BrandNameProps {
  tone?: BrandNameTone;
  className?: string;
}

const TONE_CLS: Record<BrandNameTone, string> = {
  default: 'font-brand font-medium',
  strong: 'font-brand font-bold text-foreground',
  subtle: 'font-brand font-normal',
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
