import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { useFileVersions, useRestoreVersion } from '../api/prism';

const authorLabel: Record<string, string> = { user: '手动', agent: 'AI', accepted: 'AI · 已采纳' };

/** 文件版本历史 —— 列出历史版本,可一键恢复(恢复=把旧版本设为新 current,保留全链)。 */
export function PrismVersionsDialog({
  projectId,
  fileId,
  fileName,
  open,
  onOpenChange,
  onRestored,
}: {
  projectId: number;
  fileId: number | null;
  fileName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRestored: () => void;
}) {
  const versions = useFileVersions(projectId, fileId ?? undefined, open);
  const restore = useRestoreVersion(projectId);

  const onRestore = async (versionId: number) => {
    if (!fileId) return;
    try {
      await restore.mutateAsync({ fileId, versionId });
      toast.success('已恢复该版本');
      onRestored();
      onOpenChange(false);
    } catch {
      toast.error('恢复失败,请稍后重试');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissable>
        <DialogHeader>
          <DialogTitle>版本历史 · {fileName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto">
          {versions.isLoading ? (
            <div className="py-6 text-center"><Loader2 className="inline size-5 animate-spin text-faint" /></div>
          ) : !versions.data?.length ? (
            <p className="py-6 text-center text-12 text-faint">暂无版本</p>
          ) : (
            versions.data.map((v) => (
              <div key={v.id} className="flex items-center justify-between border-b border-border-soft py-2">
                <div className="flex items-center gap-2 text-12">
                  <span className="font-medium text-foreground">v{v.version_no}</span>
                  <span className="text-faint">{authorLabel[v.author] || v.author} · {v.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  {v.status === 'current' && <Badge variant="outline" className="border-brand-green text-brand-green">当前</Badge>}
                </div>
                {v.status !== 'current' && (
                  <Button size="sm" variant="outline" onClick={() => onRestore(v.id)} disabled={restore.isPending}>
                    恢复此版本
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
