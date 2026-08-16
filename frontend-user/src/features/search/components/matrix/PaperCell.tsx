import { memo, type ButtonHTMLAttributes } from 'react';
import { GripVertical, MessageSquare, X } from 'lucide-react';
import { TruncatedText } from '@/shared/components/TruncatedText';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { Checkbox } from '@/shared/ui/checkbox';
import { PaperPdfChip } from '@/shared/components/PaperPdfChip';
import {
  useOpenPaperDetail,
  useOpenPdfChat,
} from '@/shared/hooks/useOpenInSearchPanel';
import { usePaperReadablePdf } from '@/shared/hooks/usePaperReadablePdf';
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
  /** 点卡片选中(标题仍打开详情) */
  onSelect?: (paperId: string) => void;
  /** 侧栏窄列布局 */
  compact?: boolean;
  /** PDF Chat / 文献图谱下显示勾选 */
  showCheckbox?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** @deprecated PDF / Chat 已常驻右侧，保留以免旧调用方报错 */
  showPdfStatus?: boolean;
  /** 矩阵分析下,勾选框同一位置显示拖拽手柄 */
  showDragHandle?: boolean;
  dragHandleListeners?: ButtonHTMLAttributes<HTMLButtonElement>;
  dragHandleAttributes?: ButtonHTMLAttributes<HTMLButtonElement>;
}

function PaperCellImpl({
  paper,
  isFavorited,
  onRemove,
  isWorkspaceSelected,
  onSelect,
  compact,
  showCheckbox,
  checked,
  onCheckedChange,
  showDragHandle,
  dragHandleListeners,
  dragHandleAttributes,
}: Props) {
  const openPaperDetail = useOpenPaperDetail();
  const openPdfChat = useOpenPdfChat();
  const { libRow, hasPdf } = usePaperReadablePdf(paper);
  const isDetailSelected = useSearchRightPanelStore((s) =>
    s.isActivePaper(paper.paperId),
  );
  const isLit = !!isWorkspaceSelected;
  // hover-only 状态:移除 / "未收藏时的收藏按钮" 都用这个 class
  // 已收藏的 BookmarkCheck 是状态标识,需要常驻显示,不应用 hover gate
  const hoverActionClass =
    'opacity-0 group-hover/row:opacity-100 transition-opacity';

  return (
    <div
      onClick={onSelect ? () => onSelect(paper.paperId) : undefined}
      className={cn(
        'relative flex min-w-0 items-start overflow-hidden border-l-[3px] transition-colors',
        compact ? 'gap-2 px-3 py-2.5' : 'gap-2.5 px-3 py-3.5',
        onSelect && 'cursor-pointer',
        isLit
          ? 'border-l-brand-red bg-brand-red/5'
          : 'border-l-transparent',
      )}
    >
      {showCheckbox ? (
        <Checkbox
          checked={!!checked}
          onCheckedChange={(next) => {
            if (next === 'indeterminate') return;
            onCheckedChange?.(next);
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={checked ? '取消选择这篇文献' : '选择这篇文献'}
          title={checked ? '取消选择这篇文献' : '选择这篇文献'}
          className="mt-1 shrink-0"
        />
      ) : showDragHandle ? (
        <button
          type="button"
          {...dragHandleAttributes}
          {...dragHandleListeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="拖动调整文献顺序"
          title="按住拖动以重新排序"
          className="mt-1 inline-flex size-4 shrink-0 cursor-grab touch-none items-center justify-center text-faint hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" strokeWidth={2} />
        </button>
      ) : null}

      <div
        className={cn(
          'relative flex min-w-0 flex-1 flex-col',
          compact ? 'gap-1' : 'gap-2',
        )}
      >
      {/* 操作区 —— 容器常驻,**每个按钮独立决定 hover 可见性** */}
      <div className="absolute right-0 top-0 flex items-center gap-0.5">
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
            isDetailSelected || isLit
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

      <div className="mt-0.5 flex w-20 shrink-0 flex-col gap-1">
        <PaperPdfChip paper={paper} libRow={libRow} layout="rail" />
        <button
          type="button"
          disabled={!hasPdf}
          title={
            hasPdf ? '用这篇 PDF 开始对话' : '没有可用 PDF，无法开始对话'
          }
          onClick={(e) => {
            e.stopPropagation();
            if (!hasPdf) return;
            openPdfChat({ paperId: paper.paperId });
          }}
          className={cn(
            'inline-flex h-7 w-full items-center justify-center gap-1 rounded-8 border px-1.5 text-12 font-medium transition-colors',
            hasPdf
              ? 'border-border bg-background text-foreground hover:bg-surface-1'
              : 'cursor-not-allowed border-border bg-surface-1 text-faint',
          )}
        >
          <MessageSquare className="size-3.5 shrink-0" strokeWidth={2} />
          Chat
        </button>
      </div>
    </div>
  );
}

export const PaperCell = memo(PaperCellImpl);
