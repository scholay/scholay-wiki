import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';
import { ScholayMark } from './brand/ScholayMark';
import { ScholayWordmark } from './brand/ScholayWordmark';

/**
 * Scholay 品牌 Logo —— 左标志 + 右文字标的横向组合。
 *
 * 真源: Figma `JIv8fxQthMS37JLGHNOEbB`
 *   标志图形 node `1:220`(六芒星犀牛头) · 文字标 node `1:256`(全大写 SCHOLAY)
 * 两者都是从设计稿直接导出的 SVG,不是用字体排的 —— 见各自组件的注释。
 *
 * 用途:首页 hero(xl)/ 登录弹窗(md)/ TopNav·页脚·后台(sm)/ 移动端(lg)。
 */
type Size = 'sm' | 'md' | 'lg' | 'xl';

/** 只要标志 / 只要文字 / 完整锁定组合 */
type Variant = 'full' | 'mark' | 'wordmark';

/**
 * 尺寸以【文字标高度】为基准(它就是大写字母的字身高)。
 * 标志取 1.35 倍 —— 标志是近正方形(253×264),与一行大写字母等高会显得小,
 * 略高于字身是常规锁定组合的做法。
 */
const SIZE: Record<Size, { wordmark: number; mark: number; gap: number }> = {
  sm: { wordmark: 17, mark: 23, gap: 8 },
  md: { wordmark: 23, mark: 31, gap: 10 },
  lg: { wordmark: 30, mark: 40, gap: 12 },
  xl: { wordmark: 42, mark: 56, gap: 16 },
};

/** SVG 原始宽高比 —— 用来由高度算宽度,避免布局抖动 */
const RATIO = { wordmark: 222 / 34, mark: 253 / 264 };

interface BrandLogoProps {
  size?: Size;
  variant?: Variant;
  className?: string;
  /** 覆写文字标高度(px)。少数场景需要与相邻元素精确对齐时用,优先级高于 size */
  height?: number;
}

export const BrandLogo = forwardRef<HTMLSpanElement, BrandLogoProps>(
  ({ size = 'md', variant = 'full', className, height }, ref) => {
    const s = SIZE[size];
    const wmH = height ?? s.wordmark;
    // 覆写高度时按同比例缩放标志与间距,保持锁定组合的比例关系
    const scale = wmH / s.wordmark;
    const markH = s.mark * scale;
    const gap = s.gap * scale;

    return (
      <span
        ref={ref}
        className={cn('inline-flex items-center select-none', className)}
        style={variant === 'full' ? { gap: `${gap}px` } : undefined}
        role="img"
        aria-label="Scholay"
      >
        {variant !== 'wordmark' && (
          <ScholayMark
            aria-hidden
            style={{ height: markH, width: markH * RATIO.mark }}
            className="shrink-0"
          />
        )}
        {variant !== 'mark' && (
          <ScholayWordmark
            aria-hidden
            style={{ height: wmH, width: wmH * RATIO.wordmark }}
            className="shrink-0"
          />
        )}
      </span>
    );
  }
);
BrandLogo.displayName = 'BrandLogo';
