import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * 牛犀犀 / 智能助手品牌图标 —— lucide 规格手绘 (24×24 / stroke / round)。
 * Lucide 无犀牛图标；仓库里只有精灵帧 PNG，无现成 SVG。
 * 属品牌符号例外（见 CLAUDE.md「自定 SVG 仅限品牌 logo」）。
 *
 * 构成：侧脸轮廓 + 耳 + 角 + 眼 + 嘴角。
 */
export const RhinoBrandIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      className,
      size = 24,
      strokeWidth = 2,
      color = 'currentColor',
      absoluteStrokeWidth,
      ...rest
    },
    ref,
  ) => {
    const sw =
      absoluteStrokeWidth && typeof strokeWidth === 'number' && typeof size === 'number'
        ? (Number(strokeWidth) * 24) / Number(size)
        : strokeWidth;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={cn('inline-block shrink-0', className)}
        {...rest}
      >
        {/* 耳 */}
        <path d="M8.5 8.2c-.2-1.6.6-3 2-3.4" />
        {/* 头 + 吻部轮廓 */}
        <path d="M7.2 11.2c0-2.4 1.8-4.6 4.4-5.1 1.8-.3 3.6.3 4.8 1.6l3.2 3.4c.7.8.6 2.1-.2 2.8l-1.4 1.2c-1.2 1-2.8 1.4-4.4 1.1l-3.2-.7c-1.8-.4-3.2-2-3.2-3.8Z" />
        {/* 角 */}
        <path d="M17.2 9.4 20.2 5.8" />
        {/* 眼 */}
        <circle cx="13.2" cy="10.6" r="0.7" fill="currentColor" stroke="none" />
        {/* 嘴线 */}
        <path d="M15.6 13.2h2.2" />
      </svg>
    );
  },
);
RhinoBrandIcon.displayName = 'RhinoBrandIcon';
