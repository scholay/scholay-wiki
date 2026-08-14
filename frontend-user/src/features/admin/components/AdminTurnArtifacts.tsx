import { Download, Eye, FileText, FolderArchive, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import type { AdminSessionArtifact } from '../api/session-monitor';
import { formatBytes } from '../lib/format';
import type { AdminPreviewFile } from './AdminFilePreviewDialog';
import { downloadAdminFile } from './AdminFileViewer';

/**
 * 用户端「生成的文件」卡片的管理端只读 adapter。外观与用户端一致，
 * 但预览/下载必须经带管理员 Authorization 的 HTTP 请求，不复用用户端 URL。
 */
export function AdminTurnArtifacts({
  artifacts,
  onPreview,
}: {
  artifacts?: AdminSessionArtifact[];
  onPreview?: (file: AdminPreviewFile) => void;
}) {
  if (!artifacts?.length) return null;

  return (
    <div className="rounded-16 border border-brand-green/30 bg-brand-green/5 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 px-0.5 text-12 font-medium text-brand-green">
        <Sparkles className="size-3.5" />
        生成的文件
      </div>
      <div className="flex flex-col gap-1.5">
        {artifacts.map((artifact) => {
          const src = artifact.url;
          const isDirectory = artifact.kind === 'dir';
          const canDownload =
            !isDirectory || (artifact.id > 0 && artifact.storageAvailable);
          const downloadName =
            isDirectory && !artifact.name.toLowerCase().endsWith('.zip')
              ? `${artifact.name}.zip`
              : artifact.name;
          const primary = artifact.title || artifact.name;
          const secondary =
            artifact.description ||
            (isDirectory
              ? '会话工作区目录'
              : [artifact.mime || '文件', formatBytes(artifact.size)].join(
                  ' · ',
                ));
          return (
            <div
              key={artifact.path}
              className="flex items-center gap-2.5 rounded-12 border border-border bg-surface-card px-3 py-2 transition-colors hover:border-brand-green/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-8 bg-brand-green/10">
                {isDirectory ? (
                  <FolderArchive className="size-4 text-brand-green" />
                ) : (
                  <FileText className="size-4 text-brand-green" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-14 font-medium text-foreground"
                  title={primary}
                >
                  {primary}
                  {isDirectory ? '/' : ''}
                </div>
                <div
                  className="truncate text-12 text-muted-foreground"
                  title={secondary}
                >
                  {secondary}
                </div>
              </div>
              {!isDirectory && onPreview && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1"
                  onClick={() =>
                    onPreview({
                      src,
                      mime: artifact.mime,
                      filename: artifact.name,
                    })
                  }
                >
                  <Eye className="size-3.5" />
                  预览
                </Button>
              )}
              {canDownload && (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 shrink-0 gap-1 bg-brand-green text-on-brand hover:bg-brand-green/90"
                  onClick={() =>
                    void downloadAdminFile(src, downloadName).catch(() =>
                      toast.error('文件下载失败'),
                    )
                  }
                >
                  <Download className="size-3.5" />
                  {isDirectory ? '打包下载' : '下载'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
