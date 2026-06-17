import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, m, useDragControls } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { SHEET_SPRING } from '@/shared/lib/motion';
import { haptic } from '@/shared/lib/haptics';

/**
 * 移动端底部弹窗 —— Radix Dialog(焦点陷阱 / Esc / 滚动锁 / 无障碍)+ framer-motion 拖拽下滑关闭。
 *
 * 关键做法:
 *   - Radix `forceMount` + 外层 AnimatePresence → 动画完全交给 framer(进退场弹簧 + 拖拽),
 *     Radix 只管可达性与门户;退场动画结束后才卸载。
 *   - 仅「抓手」发起拖拽(useDragControls + dragListener=false)→ 内容区照常滚动。
 *   - 用 m.*,必须在 LazyMotion 子树内(移动壳 MobileShell 已提供);PC 端请勿直接用。
 *
 * a11y:本组件渲染 sr-only 的 DialogTitle(title 必填);调用方内部不要再放 DialogTitle。
 */
export function MobileBottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
  /** 叠在其它底部弹窗之上时置 true(更高 z-index,如登录弹窗叠在分享弹窗上) */
  elevated = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  const dragControls = useDragControls();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <m.div
                className={cn(
                  'fixed inset-0 bg-foreground/40',
                  elevated ? 'z-[80]' : 'z-[70]'
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              asChild
              forceMount
              aria-describedby={undefined}
            >
              <m.div
                className={cn(
                  'fixed inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl bg-background shadow-2xl',
                  elevated ? 'z-[81]' : 'z-[71]',
                  className
                )}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={SHEET_SPRING}
                drag="y"
                dragListener={false}
                dragControls={dragControls}
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0, bottom: 0.3 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 120 || info.velocity.y > 700) {
                    haptic();
                    onOpenChange(false);
                  }
                }}
              >
                <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                {/* 抓手:仅此处发起拖拽(dragListener=false),内容区照常滚动 */}
                <div
                  onPointerDown={(e) => dragControls.start(e)}
                  className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
                >
                  <div className="h-1 w-9 rounded-full bg-border-strong" />
                </div>
                {children}
              </m.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
