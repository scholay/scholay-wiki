import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui/tooltip';
import { SOURCE_META } from '@/shared/lib/source';
import type { UpstreamSource } from '@/shared/api/types';
import { cn } from '@/shared/lib/utils';

/**
 * 论文源标签 —— 全应用统一组件,所有展示论文来源的位置都用这个。
 *
 * 两种形态(由 variant 切换):
 *   - `letter`(默认):仅展示单字母 M / G / D,占位极小,适合密集列表
 *     (首页联想搜索末尾、QuickAdd 在线搜索、tabs 加入按钮的搜索弹窗等)
 *   - `full`:展示 "M — Medicine" 完整形式,仅筛选器源单选用
 *
 * ⚠️ 对外只用别名 Graph/Discovery/Medicine(letter=G/D/M),**绝不**展示上游真名
 * (Semantic Scholar/OpenAlex/PubMed);letter/name 一律取自已回退的 SOURCE_META(审计 [22])。
 *
 * **Tooltip 悬浮**:无论哪种形态,hover 都弹出中文描述
 * (例如 "AI 学术文献发现库")帮用户理解每个源的定位。
 *
 * 不接受任意 source string:必须传 UpstreamSource(stc/olx/pmd),
 * 缺失就什么都不渲染(避免出现"未知源"占位)。
 */
export interface SourceBadgeProps {
  source: UpstreamSource | undefined | null;
  variant?: 'letter' | 'full';
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_CLS: Record<NonNullable<SourceBadgeProps['size']>, string> = {
  sm: 'h-4 px-1 text-2xs',
  md: 'h-5 px-1.5 text-xs',
};

export function SourceBadge({
  source,
  variant = 'letter',
  size = 'sm',
  className,
}: SourceBadgeProps) {
  if (!source) return null;
  const meta = SOURCE_META[source];
  // 防御:source 只应是 stc/olx/pmd(逐篇真实来源),万一传进 'auto'/未知值不崩溃
  if (!meta) return null;

  const display =
    variant === 'full' ? `${meta.letter} — ${meta.name}` : meta.letter;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-4 bg-surface-2 font-bold font-mono text-muted-foreground select-none shrink-0',
            SIZE_CLS[size],
            className
          )}
          aria-label={`${meta.letter} · ${meta.description}`}
        >
          {display}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="text-xs bg-surface-card text-foreground border-border max-w-[220px]"
      >
        <div className="font-semibold">{meta.name}</div>
        <div className="text-muted-foreground mt-0.5">{meta.description}</div>
      </TooltipContent>
    </Tooltip>
  );
}
