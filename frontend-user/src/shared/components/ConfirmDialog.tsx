import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';

/**
 * 全局通用确认 dialog —— 替换 `window.confirm()`,Promise 风格命令式调用。
 *
 * 三个模式:
 *   - 普通:Cancel 默认 focus
 *   - danger:confirm 按钮变红 + 头部 ⚠ 警告图标
 *   - typeToConfirm:必须打字才能 confirm(用于不可逆操作 / 大批量删除等)
 *
 * 用法(在任何组件 / hook / event handler 里):
 *   const confirm = useConfirm();
 *   if (await confirm({ title: '确定删除这 5 篇论文?', danger: true })) {
 *     await mutate();
 *   }
 *
 * 全局只挂一个 <ConfirmDialogRoot />(已在 app/providers.tsx 挂载),
 * 所有 useConfirm() 调用走同一个 zustand store。
 */

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 红色 confirm 按钮 + 警告图标 */
  danger?: boolean;
  /** 必须打字确认的字符串(如 "DELETE")。不可逆操作专用 */
  typeToConfirm?: string;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  danger,
  typeToConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      requestAnimationFrame(() => cancelRef.current?.focus());
    }
  }, [open]);

  const matches = !typeToConfirm || typed === typeToConfirm;

  const handleConfirm = async () => {
    if (!matches || pending) return;
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {danger && <AlertTriangle className="size-5 text-brand-red" />}
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {typeToConfirm && (
          <div className="space-y-1.5">
            <Label
              htmlFor="confirm-input"
              className="text-xs text-muted-foreground"
            >
              输入{' '}
              <code className="px-1 py-0.5 bg-surface-1 rounded-4 text-foreground font-mono">
                {typeToConfirm}
              </code>{' '}
              确认
            </Label>
            <Input
              id="confirm-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches) handleConfirm();
              }}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            disabled={!matches || pending}
            onClick={handleConfirm}
            className={cn(danger && 'font-bold')}
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 命令式 API —— useConfirm() Promise hook + 全局 Root
// ============================================================================

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
  show: (options: ConfirmOptions) => Promise<boolean>;
  setOpen: (open: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { title: '' },
  resolve: null,
  show: (options) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, options, resolve });
    }),
  setOpen: (open) => {
    if (!open) {
      const r = get().resolve;
      if (r) r(false);
      set({ open: false, resolve: null });
    } else {
      set({ open });
    }
  },
}));

/** 命令式 API —— 返回 confirm 函数 */
export function useConfirm() {
  return useConfirmStore((s) => s.show);
}

/**
 * 全局确认 dialog 渲染器 —— **app/providers.tsx 挂一次**,所有 useConfirm 调用复用。
 * 全应用任何位置都可 `await confirm(...)`。
 */
export function ConfirmDialogRoot() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const setOpen = useConfirmStore((s) => s.setOpen);
  const resolve = useConfirmStore((s) => s.resolve);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      onConfirm={() => {
        if (resolve) resolve(true);
        useConfirmStore.setState({ open: false, resolve: null });
      }}
      {...options}
    />
  );
}
