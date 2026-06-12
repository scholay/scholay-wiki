import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * AI Claw 品牌图标(矢量龙虾) —— 替代设计稿里的 🦞 emoji(.pen `e1ek2N`):
 * emoji 渲染随系统字体走,不可控色/不可控粗细;这里按 lucide 规格手绘
 * (24×24 viewBox / stroke 2 / round cap),currentColor 跟随文字色,
 * 与底部导航其他 lucide 图标视觉一致。
 *
 * 构成:两只外展大钳(带钳口开缝) + 分节身体 + 三叉尾扇。
 * 属于品牌符号 —— 项目图标规范的"自定 SVG 仅限品牌 logo"例外项。
 */
export const ClawBrandIcon = forwardRef<SVGSVGElement, { className?: string }>(
  ({ className }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('inline-block shrink-0', className)}
    >
      {/* 左臂 + 钳 */}
      <path d="M10 8C9 5.5 7 4 5 4c-.6 0-1 .4-1 1 0 2 1.5 4 4 4" />
      <path d="M4.6 6.6 6.4 5" />
      {/* 右臂 + 钳 */}
      <path d="M14 8c1-2.5 3-4 5-4 .6 0 1 .4 1 1 0 2-1.5 4-4 4" />
      <path d="m19.4 6.6-1.8-1.6" />
      {/* 身体 + 体节 */}
      <rect x="9.5" y="7.5" width="5" height="8.5" rx="2.5" />
      <path d="M9.5 11h5" />
      <path d="M9.5 13.5h5" />
      {/* 尾扇 */}
      <path d="M12 16v2.5" />
      <path d="m12 18.5-2.2 2" />
      <path d="m12 18.5 2.2 2" />
    </svg>
  )
);
ClawBrandIcon.displayName = 'ClawBrandIcon';
