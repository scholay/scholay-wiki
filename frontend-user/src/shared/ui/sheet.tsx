import * as React from'react';
import * as DialogPrimitive from'@radix-ui/react-dialog';
import { X } from'lucide-react';
import { cn } from'@/shared/lib/utils';

/**
 * Sheet —— 从屏幕边缘滑入的抽屉(基于 Radix Dialog)。
 * 与居中的 Dialog 区分:Sheet 用于「侧边详情 / 编辑面板」这类不打断主上下文的场景。
 * 默认从右侧滑入;点遮罩 / Esc 可关(只读详情场景默认可关比强制按钮更顺手)。
 *
 * ⏱ Motion 说明:下面的 `duration-300` 是 **Tailwind 默认档**,不是 motion token。
 * ⚠️ 本段此前写着「`duration-base` 这类类名编译不出任何 CSS,改过去等于把过渡时长清零」——
 * **该描述已失效**。globals.css 的 @theme inline 已按当时给出的修法补上
 * --transition-duration-{fast,base,slow,deliberate} 别名(Tailwind v4 的 duration 工具类只查
 * --transition-duration-* 命名空间),现在这四个具名类**真能编译出 CSS**。
 * 🔴 但【不要】顺手把这里的 `duration-300` 改成 `duration-slow`:token 四档
 * {160, 280, 420, 700}ms 与 Tailwind 默认档 {150, 200, 300, 500} **没有一个相等**,
 * 换过去就是改动画时长 = 视觉变化,必须走产品/设计拍板,不是机械替换。
 * 结论:CSS 侧暂时沿用 Tailwind 默认档;需要走 token 时用 `duration-base` 等具名类(已可用)。
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    // backdrop-blur-2 = --blur-2(2px)。不用内建最小档 blur-xs(4px):那会把背景糊成一片;
    // 2px 是刻意的极轻虚化(与 dialog.tsx 遮罩保持一致,同走一个 token)。
    className={cn('fixed inset-0 z-overlay bg-foreground/40 backdrop-blur-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** 滑入方向。默认'right'(侧边详情/编辑);'left'用于聊天助手那种历史抽屉。 */
    side?: 'left'|'right';
  }
>(({ className, children, side ='right', ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn('fixed inset-y-0 z-modal flex h-full w-full max-w-md flex-col gap-4 bg-surface-card shadow-overlay duration-300', 'data-[state=open]:animate-in data-[state=closed]:animate-out',
        side ==='left' ? 'left-0 border-r border-border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left' : 'right-0 border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-4 opacity-70 transition-opacity hover:opacity-100">
        <X className="h-4 w-4"/>
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // pr-10 给右上角绝对定位的关闭按钮留位, 标题/徽章再长也不会压到 X。
  <div className={cn('flex flex-col gap-1.5 border-b border-border-soft px-5 py-4 pr-10 text-left', className)} {...props} />
);
SheetHeader.displayName ='SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2 border-t border-border-soft px-5 py-4', className)} {...props} />
);
SheetFooter.displayName ='SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-16 font-medium leading-none', className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  // KEEP text-12 —— 抽屉副标题与 DialogDescription / CardDescription 同属次文层
  // (Figma §4.4 次文 12px),与 text-16 的标题拉开层级。
  <DialogPrimitive.Description ref={ref} className={cn('text-12 text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
