import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import {
  useDeleteUserDimension,
  useResetDimension,
  type DimensionSettingItem,
} from '../../api/analysis';

/**
 * 删除维度的二次确认 dialog —— .pen `yKH6P`。
 *   - 系统维度走 RESET(删除 user override,回到系统默认)
 *   - 用户自定义维度走 DELETE(真正移除)
 *
 * 文案根据 isSystem 分支区分,避免用户误删。
 */
interface Props {
  target: DimensionSettingItem | null;
  onClose: () => void;
}

export function DeleteConfirmDialog({ target, onClose }: Props) {
  const reset = useResetDimension();
  const remove = useDeleteUserDimension();
  const busy = reset.isPending || remove.isPending;

  if (!target) return null;
  const isReset = target.isSystem;

  const confirm = () => {
    const onSuccess = () => {
      toast.success(isReset ? '已重置为系统默认' : '已删除');
      onClose();
    };
    const onError = (err: unknown) =>
      toast.error((err as Error).message || '操作失败');

    if (isReset) {
      reset.mutate(target.dimensionKey, { onSuccess, onError });
    } else {
      remove.mutate(target.id, { onSuccess, onError });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-[360px] w-[360px]">
        <header className="flex items-center gap-2 h-13 px-5 pr-12 border-b border-border-soft">
          <AlertTriangle className="size-4 text-brand-red shrink-0" />
          <DialogTitle className="text-sm font-bold text-foreground">
            {isReset
              ? `重置维度「${target.name}」?`
              : `确认删除维度「${target.name}」?`}
          </DialogTitle>
        </header>
        <div className="px-5 py-4 text-xs text-subtle leading-relaxed">
          {isReset
            ? '将清除你对该维度的自定义(名字 / 提示词 / 是否隐藏),回到系统默认值。已生成的分析结果不会丢失。'
            : '将永久删除该自定义维度。已生成的相关分析结果会保留,但矩阵不再展示该列。'}
        </div>
        <footer className="flex items-center justify-end gap-2 h-13 px-5 border-t border-border-soft">
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-3 rounded-sm border border-border text-xs text-subtle hover:bg-surface-1"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="inline-flex items-center gap-1 h-7 px-3 rounded-sm bg-brand-red text-white text-xs font-bold hover:bg-brand-red/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-3 animate-spin" />}
            {isReset ? '确认重置' : '确认删除'}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
