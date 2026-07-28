import * as React from'react';
import * as DialogPrimitive from'@radix-ui/react-dialog';
import { X } from'lucide-react';
import { cn } from'@/shared/lib/utils';

/**
 * ⏱ Motion 说明(与 sheet.tsx 同):本文件的 `duration-200` 是 **Tailwind 默认档**,不是 token。
 * ⚠️ 本段此前写着「`duration-fast` / `duration-base` 编译不出任何 CSS」——**该描述已失效**。
 * globals.css 的 @theme inline 已补上 --transition-duration-{fast,base,slow,deliberate} 别名
 * (Tailwind v4 的 duration 工具类只查 --transition-duration-* 命名空间,此前声明成 --duration-*
 * 差一截前缀才生成不出类),现在这四个具名类**真能编译出 CSS**。
 * 🔴 但【不要】顺手把这里的 `duration-200` 改成 `duration-fast`/`duration-base`:
 * token 四档是 {160, 280, 420, 700}ms,与 Tailwind 默认档 {150, 200, 300, 500} **没有一个相等**,
 * 换过去就是改动画时长 = 视觉变化,必须走产品/设计拍板,不是机械替换。
 * 结论:CSS 侧暂时沿用 Tailwind 默认档;需要走 token 时用 `duration-base` 等具名类(已可用)。
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    // backdrop-blur-2 = --blur-2(2px)。不用内建最小档 blur-xs(4px):那会把背景糊成一片、
    // 失去「弹窗压在页面上」的上下文感。2px 是刻意的极轻虚化,故 token 层单独立了这一档。
    className={cn('fixed inset-0 z-overlay bg-foreground/40 backdrop-blur-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * 是否允许「点击遮罩层 / 按 Esc」关闭弹窗。
   * 默认 false —— 弹窗(尤其是填写中的表单)只能通过右上角的关闭按钮关闭,
   * 避免用户误点外部区域、或(中文输入法下)误按 Esc 收候选框时把整个表单关掉、内容丢失。
   * 仅图片灯箱 / 命令面板这类「点外面关闭本就是预期行为」的场景显式传 dismissable。
   */
  dismissable?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      dismissable = false,
      onInteractOutside,
      onEscapeKeyDown,
      ...props
    },
    ref
  ) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // 限高滚动(max-h-[90dvh] + overflow-y-auto):长表单在窄屏不再溢出到屏幕外无法操作。
        // 关键:不加任何 sm:/宽度/内边距 覆盖 —— 否则会「漏」过下游 p-0 / w-[...] 全屏弹窗的无前缀覆盖,
        // 反而在桌面把它们的自定义留白/宽度改回来。设了自己 overflow/max-h 的弹窗经 tw-merge 各自胜出,不受影响。
        'fixed left-1/2 top-1/2 z-modal grid w-full max-w-lg max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain border border-border bg-surface-card p-6 shadow-overlay duration-200 sm:rounded-16',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className
      )}
      onInteractOutside={(event) => {
        if (!dismissable) event.preventDefault();
        onInteractOutside?.(event);
      }}
      onEscapeKeyDown={(event) => {
        if (!dismissable) event.preventDefault();
        onEscapeKeyDown?.(event);
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-4 opacity-70 transition-opacity hover:opacity-100">
        <X className="h-4 w-4"/>
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-1.5 text-left', className)}
    {...props}
  />
);
DialogHeader.displayName ='DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName ='DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-16 font-medium leading-none',
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    // KEEP text-12 —— 弹窗副标题是标题(text-16)下面的说明文,属次文层,
    // 与 CardDescription(Figma §4.4 卡片次文 12px)同层。Figma 未给弹窗规格。
    className={cn('text-12 text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
