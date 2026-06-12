import { useNavigate } from 'react-router-dom';
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
import { useFavoriteBurst } from '@/stores/favorite-burst.store';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import type { Paper, UpstreamSource, UserLibraryPaper } from '@/shared/api/types';

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
   * 控制错误 / 取消收藏 toast,并影响收藏成功反馈的通道(默认 true):
   *   - true  : 有可见 FavoriteBurst sink → "+1" 动画;无 sink → 带「完善信息」
   *             深链 action 的成功 toast(跳 /library?manage=… 打开管理弹窗)
   *   - false : 嵌入场景(矩阵单元格 / 弹窗内)——沿用 burst store 原行为
   *             (有 sink 飞 "+1",无 sink 普通 toast 兜底),且错误不弹 toast
   */
  showToast?: boolean;
  /**
   * 收藏成功后完全静默(不 burst 也不 toast,仍回调 onSuccess)。
   * 调用方自己有成功反馈时用(如 OnlineSearchTab 自己 toast),避免
   * burst-store 无 sink 时的兜底 toast 造成双 toast。默认 false,
   * 不影响其他调用方;优先级高于 showToast 的成功反馈通道。
   */
  silentSuccess?: boolean;
  /**
   * 收藏成功回调,带后端创建的文献集行。
   * 取消收藏成功不触发(行已删除,无值可传)。
   */
  onSuccess?: (row: UserLibraryPaper) => void;
  /** 取消收藏成功后回调(父级本地"已收藏"状态需要回退时用) */
  onUnfavorited?: () => void;
  onError?: (err: Error) => void;
  /** 额外的容器 className,通常只用来加 hover-show 控制 */
  className?: string;
  /**
   * 仅 chip 变体:把按钮放进一个 `@container` 元素后,容器宽 < 260px 时
   * 自动隐藏文字、塌成纯图标方块(响应式降级,避免文案在窄卡片里换行)。
   * 不传 = 行为完全不变。默认 false。
   */
  collapseLabel?: boolean;
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
  silentSuccess = false,
  onSuccess,
  onUnfavorited,
  onError,
  className,
  collapseLabel = false,
}: FavoritePaperButtonProps) {
  const favMut = useFavoritePaper();
  const unfavMut = useUnfavoritePaper();
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
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
    // silentSuccess —— 跳过 useFavoritePaper 默认的 pushBurst,成功反馈由
    // 下面 onSuccess 单通道统筹(避免 burst + toast 双重反馈)。
    favMut.mutate(
      { paper, folderId, silentSuccess: true },
      {
        onSuccess: (row) => {
          if (silentSuccess) {
            // 调用方自带成功反馈(单通道)→ 既不 burst 也不 toast
            onSuccess?.(row);
            return;
          }
          const burst = useFavoriteBurst.getState();
          if (showToast === false || burst.sinkCount > 0) {
            // 嵌入场景照旧走 burst store(行为与改造前一致);
            // 有可见 sink 时飞 "+1" 动画(sidebar 文献集段就是管理入口)
            burst.pushBurst();
          } else {
            // 无 sink 的独立场景(详情页 / 移动端 feed)→ 成功 toast 带
            // 「完善信息」深链,LibraryPage 解析 ?manage= 后打开管理弹窗
            toast.success('已加入文献集', {
              action: {
                label: '完善信息',
                onClick: () =>
                  navigate(
                    `/library?manage=${row.source}:${encodeURIComponent(row.source_paper_id)}`
                  ),
              },
            });
          }
          onSuccess?.(row);
        },
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
            onUnfavorited?.();
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
          'inline-flex items-center justify-center rounded-sm border shrink-0 whitespace-nowrap transition-colors',
          CHIP_CLS[size],
          // 窄容器塌成 24×24 纯图标(仅当父级开启 collapseLabel + 处于 @container 内)
          collapseLabel && '@max-[260px]:w-6 @max-[260px]:px-0 @max-[260px]:gap-0',
          isFavorited
            ? 'border-brand-red/30 bg-danger-soft text-brand-red font-semibold hover:bg-brand-red/15'
            : 'border-border text-subtle hover:bg-surface-1 hover:text-foreground',
          isPending && 'opacity-60 cursor-wait',
          className
        )}
      >
        <Icon className={cn(iconCls, 'shrink-0')} strokeWidth={2.2} />
        <span className={cn(collapseLabel && '@max-[260px]:hidden')}>
          {isFavorited ? '已收藏' : '收藏'}
        </span>
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
