import { forwardRef } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import {
  useTranslatePaper,
  type TranslatePaperResult,
} from '@/shared/api/translate';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';

/**
 * AI 翻译按钮 —— 全局唯一实现,跨搜索卡 / 文献集行 / 详情页 复用。
 *
 * 状态机(由父级状态驱动):
 *   - 无 cache 且 idle      : "AI 翻译" + 默认色
 *   - 无 cache 且 pending   : "翻译中…" + Loader2
 *   - 有 cache 且 showing=原文 : "AI 翻译"(点击切到中文)
 *   - 有 cache 且 showing=中文 : "原文"(点击切回英文)
 *
 * 父级保管 zh cache + showingTranslated:
 *   - 第一次点击 → 触发 mutation → onTranslated(result) → 父级 setZh(result) 同时 setShowingTranslated(true)
 *   - 后续点击 → onToggle() → 父级 setShowingTranslated(v => !v)
 *
 * 与 FavoritePaperButton 同款变体 / 尺寸 / 视觉,确保按钮组看起来是一家人。
 *
 * 变体:chip / icon / link(详情页 ActionRow 无边框文字链接式)
 */

export type TranslateButtonVariant = 'chip' | 'icon' | 'link';
export type TranslateButtonSize = 'sm' | 'md' | 'lg';

export interface TranslatePaperButtonProps {
  title?: string;
  abstract?: string;
  /** 父级是否已经有中文缓存(决定点击行为是 toggle 还是 mutation) */
  hasCache: boolean;
  /** 当前是否在显示中文 */
  showingTranslated: boolean;
  /** 第一次翻译成功后回调,父级 setZh(result) + setShowingTranslated(true) */
  onTranslated: (result: TranslatePaperResult) => void;
  /** 已有 cache 时点击的回调,父级 setShowingTranslated(v => !v) */
  onToggle: () => void;
  variant?: TranslateButtonVariant;
  size?: TranslateButtonSize;
  showToast?: boolean;
  onError?: (err: Error) => void;
  className?: string;
  /**
   * 仅 chip 变体:把按钮放进一个 `@container` 元素后,容器宽 < 260px 时
   * 自动隐藏文字、塌成纯图标方块(与 FavoritePaperButton 同款响应式降级)。
   * 不传 = 行为完全不变。默认 false。
   */
  collapseLabel?: boolean;
}

const ICON_SIZE: Record<TranslateButtonSize, string> = {
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-4',
};

const CHIP_CLS: Record<TranslateButtonSize, string> = {
  sm: 'h-6 px-2 text-2xs gap-1',
  md: 'h-6 px-2.5 text-xs gap-1',
  lg: 'h-8 px-3 text-sm gap-1.5',
};

const ICON_BTN_CLS: Record<TranslateButtonSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
  lg: 'h-8 w-8',
};

export const TranslatePaperButton = forwardRef<HTMLButtonElement, TranslatePaperButtonProps>(
  (
    {
      title,
      abstract,
      hasCache,
      showingTranslated,
      onTranslated,
      onToggle,
      variant = 'chip',
      size = 'md',
      showToast = true,
      onError,
      className,
      collapseLabel = false,
    },
    ref
  ) => {
    const mut = useTranslatePaper();
    const isPending = mut.isPending;
    const token = useAuthStore((s) => s.token);

    const handleClick = () => {
      if (isPending) return;
      if (hasCache) {
        onToggle();
        return;
      }
      // 翻译已改强制登录 (后端 /translate/paper/stream 现走 UserAuthMiddleware):
      // 未登录直接引导登录, 不发请求避免吃 401。已有 cache 的 toggle 不受影响 (上面已 return)。
      if (!token) {
        useAuthDialog.getState().openDialog('login');
        toast.info('登录后即可使用 AI 翻译');
        return;
      }
      mut.mutate(
        { title, abstract },
        {
          onSuccess: (r) => onTranslated(r),
          onError: (err: unknown) => {
            const e = err instanceof Error ? err : new Error('翻译失败');
            if (showToast) toast.error(e.message);
            onError?.(e);
          },
        }
      );
    };

    // 文案:pending > 已显示译文 > 默认
    const label = isPending ? '翻译中…' : showingTranslated ? '原文' : 'AI 翻译';
    const Icon = isPending ? Loader2 : Languages;
    const iconCls = cn(ICON_SIZE[size], isPending && 'animate-spin');

    const title_ = isPending
      ? '正在翻译…'
      : showingTranslated
        ? '切回原文'
        : 'AI 翻译标题与摘要';
    const ariaLabel = showingTranslated ? '切回原文' : 'AI 翻译';

    if (variant === 'icon') {
      return (
        <button
          ref={ref}
          type="button"
          onClick={handleClick}
          disabled={isPending}
          aria-pressed={showingTranslated}
          aria-label={ariaLabel}
          title={title_}
          className={cn(
            'inline-flex items-center justify-center rounded-8 shrink-0 transition-colors',
            ICON_BTN_CLS[size],
            showingTranslated
              ? 'bg-surface-2 text-foreground'
              : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
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
          ref={ref}
          type="button"
          onClick={handleClick}
          disabled={isPending}
          aria-pressed={showingTranslated}
          title={title_}
          className={cn(
            'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
            'text-foreground hover:text-brand-red',
            isPending && 'opacity-70 cursor-not-allowed',
            className
          )}
        >
          <Icon
            className={cn('size-3.5', isPending && 'animate-spin')}
            strokeWidth={2}
          />
          {label}
        </button>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={showingTranslated}
        title={title_}
        className={cn(
          'inline-flex items-center justify-center rounded-8 border shrink-0 whitespace-nowrap transition-colors',
          CHIP_CLS[size],
          // 窄容器塌成 24×24 纯图标(仅当父级开启 collapseLabel + 处于 @container 内)
          collapseLabel && '@max-[260px]:w-6 @max-[260px]:px-0 @max-[260px]:gap-0',
          showingTranslated
            ? 'border-foreground/40 bg-surface-1 text-foreground font-semibold'
            : 'border-border text-subtle hover:bg-surface-1 hover:text-foreground',
          isPending && 'opacity-60 cursor-wait',
          className
        )}
      >
        <Icon className={cn(iconCls, 'shrink-0')} strokeWidth={2.2} />
        <span className={cn(collapseLabel && '@max-[260px]:hidden')}>{label}</span>
      </button>
    );
  }
);
TranslatePaperButton.displayName = 'TranslatePaperButton';
