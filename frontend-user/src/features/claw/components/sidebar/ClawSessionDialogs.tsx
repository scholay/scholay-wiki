import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  useDeleteClawSession,
  useRenameClawSession,
  type ClawSessionItem,
} from '../../api/session';

/**
 * 会话「重命名 / 删除」确认弹窗 —— 桌面侧边栏(ClawSessionList)与移动端历史抽屉
 * (MobileClawDrawer)共用,避免两处各写一份。逻辑/文案与原 ClawSessionList 内联版一致。
 */

export function ClawRenameDialog({
  target,
  onClose,
}: {
  target: ClawSessionItem | null;
  onClose: () => void;
}) {
  const rename = useRenameClawSession();
  const [title, setTitle] = useState('');

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) {
          setTitle('');
          onClose();
        }
      }}
    >
      {/* key 让 target 变化时 Input 重置 defaultValue */}
      <DialogContent className="max-w-md" key={target?.sessionId}>
        <DialogHeader>
          <DialogTitle>重命名会话</DialogTitle>
          <DialogDescription>标题会同步到 agent 端, 不影响会话内容。</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="claw-rename-title">新标题</Label>
          <Input
            id="claw-rename-title"
            autoFocus
            defaultValue={target?.title ?? ''}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如: 论文方法学讨论"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!title.trim() || rename.isPending}
            onClick={async () => {
              if (!target) return;
              try {
                await rename.mutateAsync({ sessionId: target.sessionId, title: title.trim() });
                toast.success('已重命名');
                onClose();
              } catch (err) {
                toast.error((err as Error).message || '重命名失败');
              }
            }}
          >
            {rename.isPending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClawDeleteDialog({
  target,
  activeSessionId,
  onClose,
  onActiveDeleted,
}: {
  target: ClawSessionItem | null;
  activeSessionId: string | null;
  onClose: () => void;
  /** 删除的是当前活跃会话时回调(父组件切到下一条 / 新对话)。 */
  onActiveDeleted: () => void;
}) {
  const del = useDeleteClawSession();
  const isActive = !!target && target.sessionId === activeSessionId;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>确定删除这个会话?</DialogTitle>
          <DialogDescription>
            会话{' '}
            <span className="font-mono text-foreground">"{target?.title?.trim() || '新会话'}"</span>{' '}
            将被永久删除, 包括 agent 端的全部消息历史。
            {isActive && <strong>这是你当前的会话, 删除后会切到列表中的下一条 (或新建一条)。</strong>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              if (!target) return;
              try {
                await del.mutateAsync(target.sessionId);
                if (isActive) onActiveDeleted();
                toast.success('已删除');
                onClose();
              } catch (err) {
                toast.error((err as Error).message || '删除失败');
              }
            }}
          >
            {del.isPending ? '删除中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
