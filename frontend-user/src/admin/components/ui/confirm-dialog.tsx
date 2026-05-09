import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';

/**
 * ConfirmDialog — 危险操作二次确认
 *
 * 设计:
 *   - destructive (默认 false): 确认按钮变红色,文案"删除"
 *   - 加载中禁用 + 文案变化
 *   - ESC / 遮罩点击 自动关闭(沿用 Radix Dialog 默认)
 *
 * 用法:
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="确认删除?"
 *     description="此操作不可撤销。"
 *     destructive
 *     loading={mutation.isPending}
 *     onConfirm={() => mutation.mutate(...)}
 *   />
 */

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText = '取消',
  destructive = false,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const finalConfirmText =
    confirmText || (destructive ? '确认删除' : '确认');
  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelText}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? '处理中…' : finalConfirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
