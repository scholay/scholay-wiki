/**
 * DangerConfirmDialog — 高危操作的强确认对话框
 *
 * 比 ConfirmDialog 更"重"的操作场景:
 *   - 清空全部日志
 *   - 删除核心配置(Prompt 模板 / 第三方账号)
 *   - 不可逆且影响范围广的操作
 *
 * 设计:
 *   - 必须输入指定字符串(默认 "DELETE")才能点击确认按钮 → 防误点
 *   - 红色顶栏 + AlertTriangle 图标突出"危险"语义
 *   - 描述里强调"此操作不可撤销"
 *   - 加载中禁用关闭(避免点了"确认"又关掉,后端却已执行)
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

interface DangerConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  /** 描述/警告内容(可包含影响范围、不可撤销提示) */
  description: React.ReactNode;
  /** 用户必须输入的确认词,默认 "DELETE" — 大小写敏感 */
  confirmWord?: string;
  /** 显示给用户看的提示词(没指定就用 confirmWord) */
  confirmWordLabel?: string;
  /** 确认按钮文案,默认"我已了解,确认执行" */
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm: () => void;
}

export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord = 'DELETE',
  confirmWordLabel,
  confirmText = '我已了解,确认执行',
  cancelText = '取消',
  loading = false,
  onConfirm,
}: DangerConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const label = confirmWordLabel || confirmWord;

  // 关闭时清空输入
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const matched = typed === confirmWord;

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-destructive">{title}</DialogTitle>
          <DialogDescription className="text-center">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-sm">
            请输入 <code className="rounded bg-muted px-1.5 py-0.5 font-bold text-destructive">{label}</code> 以确认
          </Label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={label}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelText}
          </Button>
          <Button
            variant="destructive"
            disabled={!matched || loading}
            onClick={onConfirm}
          >
            {loading ? '执行中…' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
