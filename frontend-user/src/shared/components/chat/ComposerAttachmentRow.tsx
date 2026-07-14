import { FileText, Loader2, X } from 'lucide-react';
import type { AttachmentDTO } from '@/shared/types/chat';

/**
 * ComposerAttachmentRow —— 输入框 topSlot 的「待发送附件」chips 行(三 agent feature 共用)。
 * 2026-07 输入框统一:从 claw ChatComposer 抽出。业界形态(GPT/Claude):
 *   - 图片:56×56 缩略图,点击放大(onEnlarge → 调用方开 AttachmentLightbox)
 *   - 文件:横向卡片 = 类型图标块 + 文件名 + 副信息(扩展名 · 大小)
 *   - 右上角常驻移除 X(不依赖 hover 才出现 —— 移动端没 hover)
 *   - 上传中:尾部虚线 pending 卡
 */
export function ComposerAttachmentRow({
  attachments,
  uploading,
  onRemove,
  onEnlarge,
}: {
  attachments: AttachmentDTO[];
  uploading?: boolean;
  onRemove: (index: number) => void;
  /** 图片缩略图点击放大(src=previewUrl)。 */
  onEnlarge?: (src: string, alt: string) => void;
}) {
  if (attachments.length === 0 && !uploading) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a, i) => (
        <AttachmentPreview
          key={`${a.path}-${i}`}
          attachment={a}
          onRemove={() => onRemove(i)}
          onEnlarge={
            a.type === 'image' && a.previewUrl && onEnlarge
              ? () => onEnlarge(a.previewUrl!, a.name)
              : undefined
          }
        />
      ))}
      {uploading && (
        <div className="inline-flex h-14 items-center gap-1.5 rounded-md border border-dashed border-border bg-surface-1 px-3 text-xs text-faint">
          <Loader2 className="h-3 w-3 animate-spin" />
          上传中…
        </div>
      )}
    </div>
  );
}

function AttachmentPreview({
  attachment,
  onRemove,
  onEnlarge,
}: {
  attachment: AttachmentDTO;
  onRemove: () => void;
  /** 图片缩略图点击放大(仅图片附件传);文件卡片不传。 */
  onEnlarge?: () => void;
}) {
  const removeBtn = (
    <button
      type="button"
      onClick={onRemove}
      title="移除"
      className="absolute -right-1.5 -top-1.5 z-10 inline-flex size-4 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-110"
    >
      <X className="size-2.5" strokeWidth={2.6} />
    </button>
  );

  if (attachment.type === 'image' && attachment.previewUrl) {
    return (
      <div className="relative size-14 shrink-0">
        {removeBtn}
        <button
          type="button"
          onClick={onEnlarge}
          title="点击放大"
          className="size-14 overflow-hidden rounded-md border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <img src={attachment.previewUrl} alt={attachment.name} className="size-14 object-cover" />
        </button>
      </div>
    );
  }

  // 文件卡片
  return (
    <div className="relative flex h-14 w-48 shrink-0 items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5">
      {removeBtn}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-danger-soft">
        <FileText className="size-4 text-brand-red" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium text-foreground" title={attachment.name}>
          {attachment.name}
        </span>
        <span className="truncate text-2xs text-faint">
          {fileExt(attachment.name)} · {formatSize(attachment.size)}
        </span>
      </span>
    </div>
  );
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toUpperCase() : '文件';
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}
