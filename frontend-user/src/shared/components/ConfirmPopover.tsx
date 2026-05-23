import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

/**
 * 锚定式二次确认 —— 替代全屏 ConfirmDialog 在「轻量、就地、不打断」的场景:
 *   - 取消收藏(按钮就在那,问完就走)
 *   - 「跳离当前页」类的导航确认(链接旁边小气泡)
 *
 * 不替代 ConfirmDialog —— 危险/不可逆操作(批量删除、删账户等)仍走全屏对话框,
 * 那种场景需要焦点完全聚焦 + typeToConfirm 等高摩擦。
 *
 * 用法:
 *   <ConfirmPopover
 *     title="确定取消收藏?"
 *     confirmText="取消收藏"
 *     onConfirm={async () => await unfavorite.mutateAsync(...)}
 *   >
 *     <button>已收藏</button>
 *   </ConfirmPopover>
 *
 * children 必须是单个可被 asChild 转发 ref 的元素(button / a)。
 */

export interface ConfirmPopoverProps {
  children: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** confirm 按钮变红 */
  danger?: boolean;
  /** 弹出方向 —— 默认 top */
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** 受控开关(可选)—— 不传则内部自管 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * confirm 按下时调用。可以是 sync 或 async:
   *   - 同步 → 直接关闭
   *   - 异步 → 期间禁用按钮 + spinner,resolve 后关闭
   */
  onConfirm: () => void | Promise<void>;
  /** 取消时回调(可选,通常不用) */
  onCancel?: () => void;
  /** popover 容器额外 className(调宽度 / 间距) */
  className?: string;
  /**
   * children 作为定位锚点(PopoverAnchor)而非点击触发器(PopoverTrigger)。
   * 适合"外部拦截 click → 受控打开"场景(如 LeaveToLibraryLink 拦截 Link 跳转再弹)。
   * 默认 false —— children 是触发器,点击自动打开。
   */
  asAnchor?: boolean;
}

export function ConfirmPopover({
  children,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  danger,
  side = 'top',
  align = 'center',
  open: openProp,
  onOpenChange,
  onConfirm,
  onCancel,
  className,
  asAnchor = false,
}: ConfirmPopoverProps) {
  const [openState, setOpenState] = useState(false);
  const [pending, setPending] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;
  const setOpen = (o: boolean) => {
    if (pending) return; // mutate 中禁止关闭,避免 race
    if (!isControlled) setOpenState(o);
    onOpenChange?.(o);
    if (!o) onCancel?.();
  };

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
      if (!isControlled) setOpenState(false);
      onOpenChange?.(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {asAnchor ? (
        <PopoverAnchor asChild>{children}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      )}
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn('w-[240px] p-3', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description && (
          <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {description}
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="size-3 animate-spin" />}
            {confirmText}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
