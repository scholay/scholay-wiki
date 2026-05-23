import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import {
  useFavoritePaper,
  useUnfavoritePaper,
} from '@/shared/api/user-library-mutations';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import type { Paper, UpstreamSource } from '@/shared/api/types';

/**
 * 收藏按钮 —— 全局唯一实现,跨搜索 / 矩阵 / Quick Add / 详情页等所有场景。
 *
 * 状态机:
 *   - idle      : 空心 Bookmark + 默认色 + "收藏" 文案(chip / link 变体)
 *   - pending   : Loader2 旋转 + 禁用
 *   - favorited : 实心 BookmarkCheck + brand-red + "已收藏" 文案,**可点 → 弹 Popover 二次确认 → 取消收藏**
 *
 * 变体:
 *   - chip : 描边胶囊,icon+text 组合(列表行 / 卡操作行)
 *   - icon : 纯方块图标,无文字(矩阵单元格 / 弹窗紧凑行)
 *   - link : 无边框,icon+text 同色,hover brand-red(详情页 ActionRow,与其它链接式操作并列)
 *
 * 尺寸:
 *   - sm : h-5 icon-12px / h-6 chip-text-2xs(矩阵 / 列表行)
 *   - md : h-7 icon-14px / h-6 chip-text-xs(默认,卡 / 弹窗主操作)
 *   - lg : h-8 icon-16px / h-8 chip-text-sm(详情页 actionRow)
 *
 * 颜色规则:
 *   - 收藏标识色统一 brand-red(与文献集 sidebar / favorite-burst 动画呼应)
 */

export type FavoriteButtonVariant = 'chip' | 'icon' | 'link';
export type FavoriteButtonSize = 'sm' | 'md' | 'lg';

export interface FavoritePaperButtonProps {
  paper: Paper;
  /** 已收藏(父级一般用 useFavoriteCheck 拿到 Set,再判一下传过来) */
  isFavorited: boolean;
  /** 收藏到指定文件夹;不传 → 默认文件夹 */
  folderId?: number | null;
  variant?: FavoriteButtonVariant;
  size?: FavoriteButtonSize;
  /**
   * **仅控制错误 toast** —— 成功反馈由 useFavoriteBurst 全局统筹(可见 sidebar
   * → "+1" 动画,无可见 sink → toast),与本组件无关。默认 true。
   */
  showToast?: boolean;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
  /** 额外的容器 className,通常只用来加 hover-show 控制 */
  className?: string;
}

const ICON_SIZE: Record<FavoriteButtonSize, string> = {
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-4',
};

// chip 变体的尺寸表
const CHIP_CLS: Record<FavoriteButtonSize, string> = {
  sm: 'h-6 px-2 text-2xs gap-1',
  md: 'h-6 px-2.5 text-xs gap-1',
  lg: 'h-8 px-3 text-sm gap-1.5',
};

// icon 变体的方块尺寸表
const ICON_BTN_CLS: Record<FavoriteButtonSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
  lg: 'h-8 w-8',
};

export function FavoritePaperButton({
  paper,
  isFavorited,
  folderId,
  variant = 'chip',
  size = 'md',
  showToast = true,
  onSuccess,
  onError,
  className,
}: FavoritePaperButtonProps) {
  const favMut = useFavoritePaper();
  const unfavMut = useUnfavoritePaper();
  const token = useAuthStore((s) => s.token);
  // 仅当本按钮触发的 mutation 才算 pending(多个按钮共用同一个 hook 实例时正确)
  const isFavPending =
    favMut.isPending && favMut.variables?.paper.paperId === paper.paperId;
  const isUnfavPending =
    unfavMut.isPending && unfavMut.variables?.paperId === paper.paperId;
  const isPending = isFavPending || isUnfavPending;

  // 未登录态 → 走收藏意图存储 → 弹登录(已收藏路径下不会触发,因为未登录不会显示已收藏)
  const handleFavorite = () => {
    if (isPending) return;
    if (!token) {
      usePendingAction.getState().set({ type: 'favorite', paper, folderId });
      useAuthDialog.getState().openDialog('login');
      toast.info('登录后自动收藏这篇论文');
      return;
    }
    favMut.mutate(
      { paper, folderId },
      {
        onSuccess: () => onSuccess?.(),
        onError: (err: unknown) => {
          const e = err instanceof Error ? err : new Error('收藏失败');
          if (showToast) toast.error(e.message);
          onError?.(e);
        },
      }
    );
  };

  const handleUnfavorite = async () => {
    if (isPending) return;
    await new Promise<void>((resolve) => {
      unfavMut.mutate(
        {
          source: (paper.source ?? 'stc') as UpstreamSource,
          paperId: paper.paperId,
        },
        {
          onSuccess: () => {
            if (showToast) toast.success('已取消收藏');
            onSuccess?.();
            resolve();
          },
          onError: (err: unknown) => {
            const e = err instanceof Error ? err : new Error('取消收藏失败');
            if (showToast) toast.error(e.message);
            onError?.(e);
            resolve();
          },
        }
      );
    });
  };

  const Icon = isPending ? Loader2 : isFavorited ? BookmarkCheck : Bookmark;
  const iconCls = cn(
    ICON_SIZE[size],
    isPending && 'animate-spin',
    isFavorited && !isPending && 'fill-current'
  );

  const title = isFavorited ? '已收藏 · 点击取消' : '加入我的文献集';
  const ariaLabel = isFavorited ? '已收藏,点击取消' : '加入文献集';

  // ─── 渲染裸 button(idle 时直接挂 onClick;favorited 时由外层 Popover 包裹) ───

  function renderButton(onClick: () => void): React.ReactNode {
    if (variant === 'icon') {
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          aria-pressed={isFavorited}
          aria-label={ariaLabel}
          title={title}
          className={cn(
            'inline-flex items-center justify-center rounded-sm shrink-0 transition-colors',
            ICON_BTN_CLS[size],
            isFavorited
              ? 'text-brand-red hover:bg-danger-soft'
              : 'text-muted-foreground hover:bg-surface-2 hover:text-brand-red',
            isPending && 'opacity-60 cursor-wait',
            className
          )}
        >
          <Icon className={iconCls} strokeWidth={2.25} />
        </button>
      );
    }

    if (variant === 'link') {
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          aria-pressed={isFavorited}
          title={title}
          className={cn(
            'inline-flex items-center gap-1.5 text-sm transition-colors',
            isFavorited
              ? 'text-brand-red font-bold hover:opacity-80'
              : 'text-foreground font-medium hover:text-brand-red',
            isPending && 'opacity-70 cursor-not-allowed',
            className
          )}
        >
          <Icon
            className={cn(
              'size-3.5',
              isFavorited && !isPending && 'fill-current',
              isPending && 'animate-spin'
            )}
            strokeWidth={2}
          />
          {isFavorited ? '已收藏' : '收藏'}
        </button>
      );
    }

    // chip 变体
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-pressed={isFavorited}
        title={title}
        className={cn(
          'inline-flex items-center justify-center rounded-sm border shrink-0 transition-colors',
          CHIP_CLS[size],
          isFavorited
            ? 'border-brand-red/30 bg-danger-soft text-brand-red font-semibold hover:bg-brand-red/15'
            : 'border-border text-subtle hover:bg-surface-1 hover:text-foreground',
          isPending && 'opacity-60 cursor-wait',
          className
        )}
      >
        <Icon className={iconCls} strokeWidth={2.2} />
        {isFavorited ? '已收藏' : '收藏'}
      </button>
    );
  }

  // 已收藏 → 包一层 ConfirmPopover,点击触发气泡确认,确认后取消收藏
  if (isFavorited) {
    return (
      <ConfirmPopover
        title="取消收藏这篇论文?"
        description="可以稍后从搜索/详情页重新收藏。"
        confirmText="取消收藏"
        cancelText="保留"
        danger
        side="top"
        onConfirm={handleUnfavorite}
      >
        {renderButton(() => {})}
      </ConfirmPopover>
    );
  }

  // 未收藏 → 直接挂 onClick
  return <>{renderButton(handleFavorite)}</>;
}
