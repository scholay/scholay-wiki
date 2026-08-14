// 「我的附件」弹窗(挂在 providers,全站唯一一份)。
//
// 🔴 它存在的理由是**让一句话变成一个动作**。
// 后端的 per-user 附件额度(2GB)撞上之后,旧的提示是「空间已满,请删除不再需要的文件」——
// 而全站没有任何删除入口:「新开一个对话」只解会话 cwd 的 1GB 帽,对 per-user 帽毫无作用,
// 用户是账号级永久卡死的。指引一件用户做不到的事,比不给指引更糟(本仓库已犯过两次)。
//
// 两条打开路径,都真的存在:
//   ① 被动 —— http 拦截器拿到 7010 → openAttachmentManager({quotaExceeded:true});
//   ② 主动 —— 输入框「+」→「我的附件」(ComposerPlusMenu)。
// 第二条是必需的:cwd 满的那条文案也写着「或在『我的附件』里删掉不用的文件」,
// 没有主动入口那句话同样是空话。
import { useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  useDeleteAgentAttachment,
  useMyAttachments,
  type AttachmentGroup,
} from '@/shared/api/agent-attach';
import type { AttachmentManagerDetail } from '@/shared/lib/attachment-events';

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function AttachmentManagerDialog({
  open,
  detail,
  onOpenChange,
}: {
  open: boolean;
  detail: AttachmentManagerDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  // enabled=open:不打开就不打这个接口(它对匿名访客也没有意义)。
  const { data, isLoading, isError } = useMyAttachments(open);
  const del = useDeleteAgentAttachment();

  const used = data?.usedBytes ?? 0;
  const limit = data?.limitBytes ?? 0;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const removeGroup = async (g: AttachmentGroup) => {
    setPending(g.uuids[0] ?? null);
    try {
      // 一项可能对应多个 uuid(同一份字节被重复上传过)。**必须全删**,
      // 否则用户看着「已删除」而占用纹丝不动 —— 额度是按内容算的,少删一个就还占着。
      for (const uuid of g.uuids) {
        await del.mutateAsync({ uuid, scope: 'permanent' });
      }
      toast.success(`已删除「${g.name}」,腾出 ${formatSize(g.size)}`);
    } catch (err) {
      toast.error((err as Error).message || '删除失败,请稍后重试');
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 宽度用 Dialog 默认档(max-w-lg);列表区高度限死在视口内并自滚,
          附件多的用户不至于把弹窗顶出屏幕(dvh 而非 vh:iOS 地址栏会盖住底部)。 */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>我的附件</DialogTitle>
          <DialogDescription>
            {detail.quotaExceeded
              ? detail.message || '附件存储空间已满,删掉不再需要的文件后即可继续上传。'
              : '这里是你在各个对话里上传过的文件。删除会同时清掉对话里的副本,历史消息中的该附件将无法再打开。'}
          </DialogDescription>
        </DialogHeader>

        {/* 占用条:让「删了多少、还差多少」是可见的,否则用户只能盲删。 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-12">
            <span className="text-subtle">
              已用 {formatSize(used)} / {formatSize(limit)}
            </span>
            <span className={percent >= 90 ? 'text-brand-red' : 'text-faint'}>{percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-2">
            <div
              className={percent >= 90 ? 'h-2 rounded-pill bg-brand-red' : 'h-2 rounded-pill bg-brand-green'}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="max-h-[46dvh] overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-12 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在读取…
            </div>
          )}
          {isError && (
            <p className="py-8 text-center text-12 text-brand-red">附件列表读取失败,请稍后重试</p>
          )}
          {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
            <p className="py-8 text-center text-12 text-muted-foreground">你还没有上传过附件</p>
          )}
          <ul className="flex flex-col">
            {data?.items.map((g) => (
              <li
                key={g.uuids[0]}
                className="flex items-center gap-2 border-b border-border-hairline py-2 last:border-b-0"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-4 bg-surface-1">
                  {g.type === 'image' ? (
                    <ImageIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <FileText className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-12 text-foreground" title={g.name}>
                    {g.name}
                  </span>
                  <span className="text-12 text-faint">
                    {formatSize(g.size)}
                    {g.sessions > 1 && ` · 被 ${g.sessions} 个对话引用`}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => void removeGroup(g)}
                  title="永久删除"
                >
                  {pending === g.uuids[0] ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 text-brand-red" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
