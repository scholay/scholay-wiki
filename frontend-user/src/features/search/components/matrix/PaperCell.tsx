import { memo } from 'react';
import { X } from 'lucide-react';
import { TruncatedText } from '@/shared/components/TruncatedText';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { cn } from '@/shared/lib/utils';
import type { Paper } from '@/shared/api/types';

/**
 * 工作区表格 sticky-left 第一列内容 —— 论文标题 + 摘要(最多 4 行 + 更多)。
 *
 * row hover 显:
 *   - 收藏 ♡(已收藏显实心 + 红;未收藏空心 + 灰,点击调 onFavorite)
 *   - × 移除(从暂存区移除)
 *
 * 摘要走 TruncatedText(lines=4):内容超出时 "更多" 按钮 row hover 才出,
 * 点击弹 popover 看全文。与论文搜索列表的截断交互完全一致(同组件)。
 *
 * 注:不再提供"在搜索器中折叠"按钮 —— 搜索器列已 auto-collapse 所有已暂存论文,
 * 工作区不需要再触发一次折叠动作。
 */
interface Props {
  paper: Paper;
  /** 已收藏?父级从 useFavoriteCheck 推断 */
  isFavorited: boolean;
  /** 从暂存区移除 */
  onRemove: (paperId: string) => void;
}

function PaperCellImpl({ paper, isFavorited, onRemove }: Props) {
  // hover-only 状态:移除 / "未收藏时的收藏按钮" 都用这个 class
  // 已收藏的 BookmarkCheck 是状态标识,需要常驻显示,不应用 hover gate
  const hoverActionClass =
    'opacity-0 group-hover/row:opacity-100 transition-opacity';

  return (
    <div className="relative flex flex-col gap-2 px-4 py-3.5 border-l-[3px] border-l-transparent group-hover/row:border-l-brand-red transition-colors">
      {/* 操作区 —— 容器常驻,**每个按钮独立决定 hover 可见性** */}
      <div className="absolute right-2 top-2 flex items-center gap-0.5">
        {/* 收藏按钮 —— icon 变体,size=sm 与 matrix 单元格密度一致。
            未收藏时 hover 才显;已收藏 brand-red 常驻作状态标识 */}
        <FavoritePaperButton
          paper={paper}
          isFavorited={isFavorited}
          variant="icon"
          size="sm"
          showToast={false}
          className={cn(!isFavorited && hoverActionClass)}
        />
        <button
          type="button"
          onClick={() => onRemove(paper.paperId)}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            hoverActionClass
          )}
          aria-label="从暂存区移除"
          title="从暂存区移除"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* 标题 15px/700 = .pen `w8tuZ` —— 留 right-padding 给 3 个 hover 按钮(60px) */}
      <h4 className="text-15 font-bold leading-snug text-foreground line-clamp-2 pr-16">
        {paper.title || '无标题'}
      </h4>

      {/* 摘要 —— TruncatedText 探测溢出后弹"更多"按钮(row hover 才显)。
          popoverText 用纯文本版,避免 line-clamp 干扰 popover 内排版 */}
      {paper.abstract ? (
        <TruncatedText
          lines={4}
          moreButtonClassName="opacity-0 group-hover/row:opacity-100 transition-opacity"
          popoverClassName="max-w-md text-xs leading-relaxed"
          className="text-sm text-subtle leading-relaxed"
          popoverText={paper.abstract}
        >
          {paper.abstract}
        </TruncatedText>
      ) : (
        <p className="text-xs text-faint italic">无摘要</p>
      )}
    </div>
  );
}

export const PaperCell = memo(PaperCellImpl);
