import { AlertCircle, FileText, Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { ComposerAttachmentItem } from '@/shared/hooks/useComposerAttachments';

/**
 * ComposerAttachmentRow —— 输入框 topSlot 的「待发送附件」chips 行(三 agent feature 共用)。
 * P3 打磨:per-chip 状态机(业界 GPT/Claude 形态)——
 *   - 选中即出缩略图/文件卡,上传中盖半透明 spinner;
 *   - 失败:红边 + 错误提示 + 重试/移除两个动作(不再只有 toast 一闪而过);
 *   - 图片(已完成)点击放大(onEnlarge → AttachmentLightbox);
 *   - 右上角常驻移除 X(移动端没 hover,不用 group-hover)。
 */
export function ComposerAttachmentRow({
  items,
  onRemove,
  onRetry,
  onEnlarge,
}: {
  items: ComposerAttachmentItem[];
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  /** 图片缩略图点击放大(src=previewUrl)。 */
  onEnlarge?: (src: string, alt: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <AttachmentChip
          key={it.id}
          item={it}
          onRemove={() => onRemove(it.id)}
          onRetry={onRetry ? () => onRetry(it.id) : undefined}
          onEnlarge={
            it.kind === 'image' && it.previewUrl && it.status === 'done' && onEnlarge
              ? () => onEnlarge(it.previewUrl!, it.name)
              : undefined
          }
        />
      ))}
    </div>
  );
}

function AttachmentChip({
  item,
  onRemove,
  onRetry,
  onEnlarge,
}: {
  item: ComposerAttachmentItem;
  onRemove: () => void;
  onRetry?: () => void;
  onEnlarge?: () => void;
}) {
  const failed = item.status === 'error';
  const uploading = item.status === 'uploading';

  const removeBtn = (
    <button
      type="button"
      onClick={onRemove}
      title="移除"
      className="absolute -right-1.5 -top-1.5 z-raised inline-flex size-4 items-center justify-center rounded-pill bg-foreground text-background transition-transform hover:scale-110"
    >
      <X className="size-2.5" strokeWidth={2.6} />
    </button>
  );

  // 上传中 / 失败的覆盖层(缩略图与文件卡共用)。
  const stateOverlay = uploading ? (
    <span className="absolute inset-0 z-raised flex items-center justify-center rounded-8 bg-surface-card/60">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </span>
  ) : failed && onRetry ? (
    <span className="absolute inset-0 z-raised flex items-center justify-center gap-1 rounded-8 bg-surface-card/75">
      <button
        type="button"
        onClick={onRetry}
        title={item.error || '上传失败,点击重试'}
        className="inline-flex h-6 items-center gap-1 rounded-4 bg-foreground px-2 text-12 text-background hover:opacity-90"
      >
        <RotateCcw className="size-3" />
        重试
      </button>
    </span>
  ) : null;

  if (item.kind === 'image' && item.previewUrl) {
    return (
      <div className="relative size-14 shrink-0">
        {removeBtn}
        {stateOverlay}
        <button
          type="button"
          onClick={onEnlarge}
          disabled={!onEnlarge}
          title={failed ? item.error || '上传失败' : '点击放大'}
          className={cn(
            'size-14 overflow-hidden rounded-8 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            failed ? 'border-brand-red' : 'border-border',
          )}
        >
          <img src={item.previewUrl} alt={item.name} className="size-14 object-cover" />
        </button>
      </div>
    );
  }

  // 文件卡片
  return (
    <div
      className={cn(
        'relative flex h-14 w-48 shrink-0 items-center gap-2 rounded-8 border bg-surface-1 px-2.5',
        failed ? 'border-brand-red' : 'border-border',
      )}
      title={failed ? item.error || '上传失败' : undefined}
    >
      {removeBtn}
      {stateOverlay}
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-4',
          failed ? 'bg-danger-soft' : 'bg-danger-soft',
        )}
      >
        {failed ? (
          <AlertCircle className="size-4 text-brand-red" />
        ) : (
          <FileText className="size-4 text-brand-red" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-12 font-medium text-foreground" title={item.name}>
          {item.name}
        </span>
        <span className={cn('truncate text-12', failed ? 'text-brand-red' : 'text-faint')}>
          {failed ? item.error || '上传失败' : `${fileExt(item.name)} · ${formatSize(item.size)}`}
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
