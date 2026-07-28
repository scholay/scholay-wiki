import { forwardRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type PdfChatButtonSize = 'sm' | 'md';

export interface PdfChatPaperButtonProps {
  onClick: () => void;
  /** 右栏 PDF Chat 功能 tab 是否激活 */
  active?: boolean;
  size?: PdfChatButtonSize;
  collapseLabel?: boolean;
  className?: string;
  disabled?: boolean;
}

const ICON_SIZE: Record<PdfChatButtonSize, string> = {
  sm: 'size-3',
  md: 'size-3.5',
};

const CHIP_CLS: Record<PdfChatButtonSize, string> = {
  sm: 'h-6 px-2 text-2xs gap-1',
  md: 'h-6 px-2.5 text-xs gap-1',
};

/** 论文卡操作行 —— 打开右栏 PDF Chat 功能 tab */
export const PdfChatPaperButton = forwardRef<
  HTMLButtonElement,
  PdfChatPaperButtonProps
>(
  (
    {
      onClick,
      active = false,
      size = 'md',
      collapseLabel = false,
      className,
      disabled = false,
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        title="在右栏打开 PDF Chat"
        className={cn(
          'inline-flex items-center justify-center rounded-sm border shrink-0 whitespace-nowrap font-semibold transition-colors',
          CHIP_CLS[size],
          collapseLabel && '@max-[260px]:w-6 @max-[260px]:px-0 @max-[260px]:gap-0',
          active
            ? 'border-brand-red/30 bg-brand-red/10 text-brand-red hover:bg-brand-red/15'
            : 'border-border text-subtle hover:bg-surface-1 hover:text-foreground',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <MessageSquare className={cn(ICON_SIZE[size], 'shrink-0')} strokeWidth={2.2} />
        <span className={cn(collapseLabel && '@max-[260px]:hidden')}>PDF Chat</span>
      </button>
    );
  },
);

PdfChatPaperButton.displayName = 'PdfChatPaperButton';
