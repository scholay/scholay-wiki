import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { AdminFileViewer } from './AdminFileViewer';

export interface AdminPreviewFile {
  /** 相对 API 路径(经带鉴权的 http 取 blob),如 /admin/agent-sessions/xxx/file?path=... */
  src: string;
  mime: string;
  filename: string;
}

/**
 * 文件预览弹窗 —— 会话监控 / 审稿监控共用。嵌套在各自的详情/记录弹窗之上(Radix 支持叠层)。
 * 常驻挂载 + 内容用 `{file && ...}` 守卫(不在 open 时卸载,遵守项目 Radix 铁律)。
 */
export function AdminFilePreviewDialog({
  file,
  onClose,
}: {
  file: AdminPreviewFile | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8 text-sm">{file?.filename || '文件预览'}</DialogTitle>
        </DialogHeader>
        {file && <AdminFileViewer src={file.src} mime={file.mime} filename={file.filename} />}
      </DialogContent>
    </Dialog>
  );
}
