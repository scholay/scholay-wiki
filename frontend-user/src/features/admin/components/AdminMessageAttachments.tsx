import { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { ReferenceChipList } from '@/shared/components/chat';
import { AttachmentLightbox } from '@/shared/components/chat/AttachmentLightbox';
import { http } from '@/shared/lib/http';
import type { Turn, TurnAttachment } from '@/shared/types/chat';
import type { AdminPreviewFile } from './AdminFilePreviewDialog';

export function AdminMessageAttachments({
  turn,
  sessionId,
  onPreview,
}: {
  turn: Turn;
  sessionId?: string;
  onPreview?: (file: AdminPreviewFile) => void;
}) {
  const hasReferences = !!turn.userReferences?.length;
  const hasAttachments = !!turn.userAttachments?.length;
  if (!hasReferences && !hasAttachments) return null;

  return (
    <div className="flex max-w-full flex-col items-end gap-1.5">
      {hasReferences && (
        <ReferenceChipList references={turn.userReferences!} align="end" />
      )}
      {hasAttachments && (
        <AdminAttachmentChips
          attachments={turn.userAttachments!}
          sessionId={sessionId}
          onPreview={onPreview}
        />
      )}
    </div>
  );
}

/**
 * 同用户端 AttachmentChipList 的 64×64 图片缩略图/文件 chip 视觉。
 * 历史图片必须先经带管理员 Authorization 的 http 取成 blob URL，
 * 不能把受保护的 API URL 直接丢给 <img>。
 */
export function AdminAttachmentChips({
  attachments,
  sessionId,
  onPreview,
}: {
  attachments: TurnAttachment[];
  sessionId?: string;
  onPreview?: (file: AdminPreviewFile) => void;
}) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  );
  return (
    <>
      <div className="flex max-w-full flex-wrap justify-end gap-1.5">
        {attachments.map((attachment, index) => (
          <AdminAttachmentChip
            key={`${attachment.path || attachment.name}-${index}`}
            attachment={attachment}
            sessionId={sessionId}
            onPreview={onPreview}
            onInlinePreview={(src, alt) => setLightbox({ src, alt })}
          />
        ))}
      </div>
      <AttachmentLightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}

function AdminAttachmentChip({
  attachment,
  sessionId,
  onPreview,
  onInlinePreview,
}: {
  attachment: TurnAttachment;
  sessionId?: string;
  onPreview?: (file: AdminPreviewFile) => void;
  onInlinePreview: (src: string, alt: string) => void;
}) {
  const fileSrc =
    sessionId && attachment.path
      ? `/admin/agent-sessions/${sessionId}/file?path=${encodeURIComponent(attachment.path)}`
      : null;
  const thumbnail = useAdminImageThumbnail(
    attachment.type === 'image' ? fileSrc : null,
    attachment.previewUrl,
  );

  if (attachment.type === 'image' && thumbnail) {
    return (
      <button
        type="button"
        title={`${attachment.name} · 点击放大`}
        onClick={() => {
          if (fileSrc && onPreview) {
            onPreview({
              src: fileSrc,
              mime: attachment.mimeType ?? '',
              filename: attachment.name,
            });
          } else {
            onInlinePreview(thumbnail, attachment.name);
          }
        }}
        className="size-16 shrink-0 overflow-hidden rounded-8 border border-border-strong transition-opacity hover:opacity-90"
      >
        <img
          src={thumbnail}
          alt={attachment.name}
          loading="lazy"
          width={64}
          height={64}
          className="size-16 object-cover"
        />
      </button>
    );
  }

  const canOpen = !!fileSrc && !!onPreview;
  const content = (
    <>
      {attachment.type === 'image' ? (
        <ImageIcon className="size-3 shrink-0" strokeWidth={2.2} />
      ) : (
        <FileText className="size-3 shrink-0" strokeWidth={2.2} />
      )}
      <span className="min-w-0 truncate">{attachment.name}</span>
    </>
  );

  if (canOpen) {
    return (
      <button
        type="button"
        title={`${attachment.name} · 点击预览`}
        onClick={() =>
          onPreview({
            src: fileSrc,
            mime: attachment.mimeType ?? '',
            filename: attachment.name,
          })
        }
        className="inline-flex max-w-[200px] items-center gap-1 rounded-4 bg-foreground/85 px-2 py-0.5 text-12 text-on-dark/90 transition-colors hover:bg-foreground"
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className="inline-flex max-w-[200px] items-center gap-1 rounded-4 bg-foreground/85 px-2 py-0.5 text-12 text-on-dark/90"
      title={attachment.name}
    >
      {content}
    </span>
  );
}

function useAdminImageThumbnail(
  src: string | null,
  inline?: string,
): string | undefined {
  const [objectUrl, setObjectUrl] = useState<string>();
  useEffect(() => {
    if (!src || inline) {
      setObjectUrl(undefined);
      return;
    }
    let active = true;
    let created: string | undefined;
    void http
      .get(src, { responseType: 'blob' })
      .then((response) => {
        if (!active) return;
        const blob = response.data as Blob;
        if (!blob.type.startsWith('image/')) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        // 缩略图是增强层；失败时保留可点击的文件 chip，不把整轮判为加载失败。
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [inline, src]);
  return inline || objectUrl;
}
