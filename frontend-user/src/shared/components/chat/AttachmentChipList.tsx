import { useState } from'react';
import { FileText, Image as ImageIcon } from'lucide-react';
import type { TurnAttachment } from'@/shared/types/chat';
import { AttachmentLightbox } from'./AttachmentLightbox';

/**
 * 用户气泡上方的附件列表 (claw 用; smart-search 目前没有上传场景).
 *
 * 设计:
 * - 图片且有 previewUrl → 渲染 64×64 缩略图, 点击放大 (lightbox)
 * - 其余 (文件 / 没有预览源的历史图片) → icon + 原文件名 chip
 * - 文件名 truncate 防止超长名字撑爆气泡
 *
 * 用法 (在 UserBubble 的 attachments slot):
 * <UserBubble
 * text={turn.userText}
 * attachments={
 * turn.userAttachments && <AttachmentChipList attachments={turn.userAttachments} />
 * }
 * />
 */
export interface AttachmentChipListProps {
  attachments: TurnAttachment[];
}

export function AttachmentChipList({ attachments }: AttachmentChipListProps) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  if (attachments.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap justify-end gap-1.5 max-w-full">
        {attachments.map((a, i) =>
          a.type ==='image'&& a.previewUrl ? (
            <button
              key={i}
              type="button" onClick={() => setLightbox({ src: a.previewUrl!, alt: a.name })}
              title={`${a.name} · 点击放大`}
              className="size-16 shrink-0 overflow-hidden rounded-8 border border-border-strong transition-opacity hover:opacity-90">
              <img src={a.previewUrl} alt={a.name} loading="lazy" width={64} height={64} className="size-16 object-cover"/>
            </button>
          ) : (
            <span
              key={i}
              className="inline-flex items-center gap-1 max-w-[200px] rounded-4 bg-foreground/85 text-on-dark/90 px-2 py-0.5 text-12" title={a.size ? `${a.name} · ${formatSize(a.size)}` : a.name}
            >
              {a.type ==='image' ? (
                <ImageIcon className="size-3 shrink-0" strokeWidth={2.2} />
              ) : (
                <FileText className="size-3 shrink-0" strokeWidth={2.2} />
              )}
              <span className="truncate min-w-0">{a.name}</span>
            </span>
          ),
        )}
      </div>
      <AttachmentLightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return`${bytes} B`;
  if (bytes < 1024 * 1024) return`${(bytes / 1024).toFixed(1)} KB`;
  return`${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
