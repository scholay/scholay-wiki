import { memo } from 'react';
import { X } from 'lucide-react';
import { TruncatedText } from '@/shared/components/TruncatedText';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { useOpenPaperDetail } from '@/shared/hooks/useOpenInSearchPanel';
import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
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
  /** 从暂存区移除;不传则隐藏移除按钮(如文献集文件夹只读视图) */
  onRemove?: (paperId: string) => void;
  /** 工作区当前选中(供 PDF Chat 等预览) */
  isWorkspaceSelected?: boolean;
  /** 侧栏窄列布局 */
  compact?: boolean;
}

function PaperCellImpl({
  paper,
  isFavorited,
  onRemove,
  isWorkspaceSelected,
  compact,
}: Props) {
  const openPaperDetail = useOpenPaperDetail();
  const isDetailSelected = useSearchRightPanelStore((s) =>
    s.isActivePaper(paper.paperId),
  );
  // hover-only 状态:移除 / "未收藏时的收藏按钮" 都用这个 class
  // 已收藏的 BookmarkCheck 是状态标识,需要常驻显示,不应用 hover gate
  const hoverActionClass =
    'opacity-0 group-hover/row:opacity-100 transition-opacity';

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col overflow-hidden border-l-[3px] transition-colors',
        compact ? 'gap-1 px-3 py-2.5' : 'gap-2 px-3 py-3.5',
        isWorkspaceSelected
          ? 'border-l-brand-red bg-brand-red/5'
          : 'border-l-transparent group-hover/row:border-l-brand-red',
      )}
    >
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
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(paper.paperId);
            }}
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              hoverActionClass,
            )}
            aria-label="从暂存区移除"
            title="从暂存区移除"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* 标题 15px/700 = .pen `w8tuZ` —— 留 right-padding 给 3 个 hover 按钮(60px)。
          [overflow-wrap:anywhere]:表格列里必须用 anywhere(不是 break-words)才会缩小 min-content,
          长 token(无空格 DOI/URL)才会在 320 列内换行而非把整列撑宽。 */}
      <h4
        onClick={(e) => {
          e.stopPropagation();
          openPaperDetail(paper);
        }}
          className={cn(
            'line-clamp-2 pr-14 [overflow-wrap:anywhere] cursor-pointer transition-colors',
            compact
              ? 'text-xs font-bold leading-snug'
              : 'text-15 font-bold leading-snug pr-16',
            isDetailSelected || isWorkspaceSelected
              ? 'text-brand-red'
              : 'text-foreground hover:text-brand-red',
          )}
        title="查看参考文献详情"
      >
        {paper.title || '无标题'}
      </h4>

      {/* 摘要 —— TruncatedText 探测溢出后弹"更多"按钮(row hover 才显)。
          popoverText 用纯文本版,避免 line-clamp 干扰 popover 内排版 */}
      {paper.abstract ? (
        <TruncatedText
          lines={compact ? 2 : 4}
          moreButtonClassName="opacity-0 group-hover/row:opacity-100 transition-opacity"
          popoverClassName="max-w-md text-xs leading-relaxed"
          className={cn(
            'text-subtle leading-relaxed [overflow-wrap:anywhere]',
            compact ? 'text-2xs' : 'text-sm',
          )}
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
