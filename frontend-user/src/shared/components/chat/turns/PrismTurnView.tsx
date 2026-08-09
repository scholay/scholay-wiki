import { memo, type ReactNode } from 'react';
import { Wrench } from 'lucide-react';
import { isCompileCheckText } from '@/shared/lib/prism-compile-check';
import { stripContainerPaths } from '@/shared/lib/strip-container-paths';
import {
  hasVisibleAssistantContent,
  isLastBlockStreamingText,
  type Turn,
  type TurnAttachment,
} from '@/shared/types/chat';
import { AttachmentChipList } from '../AttachmentChipList';
import { AssistantBubble, UserBubble } from '../Bubbles';
import { ChatStyles } from '../styles';
import { PausedNotice } from '../PausedNotice';
import { ProcessFold } from '../ProcessFold';
import { ReferenceChipList } from '../ReferenceChipList';
import { StreamingIndicator } from '../StreamingIndicator';
import { ThinkingFold } from '../ThinkingFold';
import { ToolCallBlock } from '../ToolCallBlock';
import { TurnErrorNotice } from '../TurnErrorNotice';

export interface PrismTurnViewProps {
  turn: Turn;
  /** 附件展示 slot；管理端可换成经安全端点打开的只读 chip。 */
  renderAttachments?: (attachments: TurnAttachment[], turn: Turn) => ReactNode;
  /** blocked 业务操作由包装层注入，core 不读 quota store。 */
  blockedContent?: ReactNode;
}

/** Prism 单轮的唯一展示实现。 */
export const PrismTurnView = memo(function PrismTurnView({
  turn,
  renderAttachments,
  blockedContent,
}: PrismTurnViewProps) {
  const visible = hasVisibleAssistantContent(turn);
  const blocks = turn.blocks;
  const last = blocks[blocks.length - 1];
  const answer =
    turn.complete && last && last.kind === 'text' && last.text ? last : null;
  const processBlocks = (answer ? blocks.slice(0, -1) : blocks).filter(
    (block) => !(block.kind === 'tool' && block.toolName === 'AskUserQuestion'),
  );
  const toolSteps = processBlocks.filter(
    (block) => block.kind === 'tool',
  ).length;
  const hasProcessBlocks = processBlocks.some(
    (block) => block.kind === 'tool' || (block.kind === 'text' && !!block.text),
  );
  const isThinkingActive =
    !turn.complete && turn.placeholder?.state === 'thinking';
  const isCompileCheck = isCompileCheckText(turn.userText);

  const attachments =
    (turn.userAttachments && turn.userAttachments.length > 0) ||
    (turn.userReferences && turn.userReferences.length > 0) ? (
      <>
        {turn.userAttachments &&
          turn.userAttachments.length > 0 &&
          (renderAttachments ? (
            renderAttachments(turn.userAttachments, turn)
          ) : (
            <AttachmentChipList attachments={turn.userAttachments} />
          ))}
        {turn.userReferences && turn.userReferences.length > 0 && (
          <ReferenceChipList references={turn.userReferences} />
        )}
      </>
    ) : undefined;

  return (
    <article className="flex flex-col gap-2 min-w-0">
      <ChatStyles />
      {isCompileCheck ? (
        <div className="flex items-center gap-1.5 self-start rounded-pill border border-border bg-surface-1 px-2.5 py-1 text-12 text-muted-foreground">
          <Wrench className="size-3 shrink-0" /> 系统 · 自动编译检查
        </div>
      ) : (
        <UserBubble text={turn.userText} attachments={attachments} />
      )}

      {turn.thinkingText && (
        <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
      )}

      {!turn.complete && !turn.errorMessage && !turn.blocked && !visible && (
        <StreamingIndicator turn={turn} />
      )}

      {hasProcessBlocks && (
        <ProcessFold streaming={!turn.complete} toolSteps={toolSteps}>
          {processBlocks.map((block, idx) => {
            if (block.kind === 'text') {
              if (!block.text) return null;
              const streaming =
                !turn.complete &&
                idx === processBlocks.length - 1 &&
                turn.placeholder?.state === 'streaming';
              return (
                <AssistantBubble
                  key={block.id}
                  variant="plain"
                  text={stripContainerPaths(block.text)}
                  streaming={streaming}
                />
              );
            }
            return <ToolCallBlock key={block.id} tool={block} />;
          })}
          {!turn.complete &&
            !turn.errorMessage &&
            !answer &&
            visible &&
            !isLastBlockStreamingText(turn) && (
              <StreamingIndicator turn={turn} />
            )}
        </ProcessFold>
      )}

      {answer && (
        <AssistantBubble
          variant="plain"
          text={stripContainerPaths(answer.text)}
        />
      )}
      {turn.errorMessage && (
        <TurnErrorNotice message={turn.errorMessage} code={turn.errorCode} />
      )}
      {turn.blocked && blockedContent}
      {turn.complete && turn.paused && !turn.errorMessage && !turn.blocked && (
        <PausedNotice />
      )}
    </article>
  );
});
