import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui';
import { useApiToast } from '@/shared/hooks';
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
  const apiToast = useApiToast();
  const busy = reset.isPending || remove.isPending;

  // 绝不在 open 时 `return null`(会卸载 open 的 Dialog → body pointer-events 锁泄漏、全站点击
  // 失灵,见 BodyPointerLockGuard)。open 由 target 驱动,内容用 {target && ...} 守卫,Radix 正常收尾。
  const isReset = !!target?.isSystem;

  const confirm = () => {
    if (!target) return;
    const onSuccess = () => {
      toast.success(isReset ? '已重置为系统默认' : '已删除');
      onClose();
    };
    const onError = (err: unknown) => apiToast.show(err, '操作失败');

    if (isReset) {
      reset.mutate(target.dimensionKey, { onSuccess, onError });
    } else {
      remove.mutate(target.id, { onSuccess, onError });
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      {target && (
      <DialogContent className="p-0 gap-0 max-w-[360px] w-[360px]">
        <header className="flex items-center gap-2 h-13 px-5 pr-12 border-b border-border-soft">
          <AlertTriangle className="size-4 text-brand-red shrink-0" />
          <DialogTitle className="text-14 font-medium text-foreground">
            {isReset
              ? `重置维度「${target.name}」?`
              : `确认删除维度「${target.name}」?`}
          </DialogTitle>
        </header>
        <div className="px-5 py-4 text-12 text-subtle leading-paragraph">
          {isReset
            ? '将清除你对该维度的自定义(名字 / 提示词 / 是否隐藏),回到系统默认值。已生成的分析结果不会丢失。'
            : '将永久删除该自定义维度。已生成的相关分析结果会保留,但矩阵不再展示该列。'}
        </div>
        <footer className="flex items-center justify-end gap-2 h-13 px-5 border-t border-border-soft">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={confirm}
            disabled={busy}
            className="gap-1 [&_svg]:size-3"
          >
            {busy && <Loader2 className="animate-spin" />}
            {isReset ? '确认重置' : '确认删除'}
          </Button>
        </footer>
      </DialogContent>
      )}
    </Dialog>
  );
}
