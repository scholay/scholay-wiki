import type { ReactNode } from 'react';
import type { TurnAttachment, TurnReference } from '@/shared/types/chat';
import { AttachmentChipList } from './AttachmentChipList';
import { ReferenceChipList } from './ReferenceChipList';

export interface SearchUserBubbleProps {
  text: string;
  attachments?: TurnAttachment[];
  references?: TurnReference[];
  /** 管理端可注入带 Authorization 的只读附件预览，不改气泡几何。 */
  renderAttachments?: (attachments: TurnAttachment[]) => ReactNode;
}

/** 智能搜索用户半轮的唯一视图；用户端与管理端共用。 */
export function SearchUserBubble({
  text,
  attachments,
  references,
  renderAttachments,
}: SearchUserBubbleProps) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {attachments &&
        attachments.length > 0 &&
        (renderAttachments ? (
          renderAttachments(attachments)
        ) : (
          <AttachmentChipList attachments={attachments} />
        ))}
      {references && references.length > 0 && (
        <ReferenceChipList references={references} />
      )}
      {text && (
        <div className="inline-flex max-w-[80%] items-center rounded-12 bg-foreground px-3.5 py-2.5 text-12 leading-paragraph text-on-dark">
          {text}
        </div>
      )}
    </div>
  );
}
