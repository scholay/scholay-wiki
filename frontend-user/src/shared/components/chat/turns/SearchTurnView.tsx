import { memo, type ReactNode } from 'react';
import { classifyMinicodToolResult } from '@/shared/lib/minicod-results';
import { MINICOD_TOOL_PREFIX } from '@/shared/lib/minicod-papers';
import {
  hasVisibleAssistantContent,
  isLastBlockStreamingText,
  type ToolBlock,
  type Turn,
} from '@/shared/types/chat';
import { AssistantBubble } from '../Bubbles';
import { ChatStyles } from '../styles';
import { MinicodAuthorCards } from '../MinicodAuthorCards';
import { MinicodJournalCards } from '../MinicodJournalCards';
import { MinicodSnippetCards } from '../MinicodSnippetCards';
import {
  ToolHeaderExtras,
  extractToolQuery,
  extractToolSourceBrand,
} from '../MinicodToolMeta';
import { PaperListReadonly } from '../PaperListReadonly';
import { PausedNotice } from '../PausedNotice';
import { StreamingIndicator } from '../StreamingIndicator';
import { ThinkingFold } from '../ThinkingFold';
import { ToolCallBlock } from '../ToolCallBlock';
import { TurnErrorNotice } from '../TurnErrorNotice';

export interface SearchTurnViewProps {
  turn: Turn;
  /** 默认用无写操作的论文卡；用户端注入可暂存/收藏的卡。 */
  renderPaperResult?: (block: ToolBlock, turn: Turn) => ReactNode;
  /** blocked 业务操作由包装层注入，只读端不传操作卡。 */
  blockedContent?: ReactNode;
}

/** smart-search assistant 侧的唯一展示实现；UserBubble 仍由会话容器组合。 */
export const SearchTurnView = memo(function SearchTurnView({
  turn,
  renderPaperResult,
  blockedContent,
}: SearchTurnViewProps) {
  const visible = hasVisibleAssistantContent(turn);
  const isThinkingActive =
    !turn.complete && turn.placeholder?.state === 'thinking';
  const isStreamingText = isLastBlockStreamingText(turn);
  const showTrailingIndicator =
    !turn.complete && !turn.errorMessage && visible && !isStreamingText;

  if (turn.blocked) return <>{blockedContent ?? null}</>;

  if (!turn.complete && !turn.errorMessage && !visible) {
    return (
      <div className="space-y-2 min-w-0">
        <ChatStyles />
        {turn.thinkingText && (
          <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
        )}
        <StreamingIndicator turn={turn} />
      </div>
    );
  }

  return (
    <div className="space-y-2.5 min-w-0">
      <ChatStyles />
      {turn.thinkingText && (
        <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
      )}

      {turn.blocks.map((block, idx) => {
        if (block.kind === 'text') {
          if (!block.text) return null;
          const streaming =
            !turn.complete &&
            idx === turn.blocks.length - 1 &&
            turn.placeholder?.state === 'streaming';
          return (
            <AssistantBubble
              key={block.id}
              text={block.text}
              streaming={streaming}
            />
          );
        }

        // 交互问题只由 composer 上方的 QuestionPrompt 承接，历史回放也不展开 JSON。
        if (block.toolName === 'AskUserQuestion') return null;

        const query = extractToolQuery(block.input);
        const sourceBrand = extractToolSourceBrand(block.input);
        if (block.toolName.startsWith(MINICOD_TOOL_PREFIX)) {
          const kind =
            block.result !== undefined
              ? classifyMinicodToolResult(block.result, block.toolName)
              : 'unknown';
          return (
            <div key={block.id} className="space-y-2 min-w-0">
              <ToolCallBlock
                tool={block}
                expandable={kind === 'unknown'}
                renderHeaderExtras={() => (
                  <ToolHeaderExtras brand={sourceBrand} query={query} />
                )}
              />
              {kind === 'papers' &&
                (renderPaperResult ? (
                  renderPaperResult(block, turn)
                ) : (
                  <PaperListReadonly content={block.result} variant="search" />
                ))}
              {kind === 'journals' && (
                <MinicodJournalCards content={block.result} />
              )}
              {kind === 'authors' && (
                <MinicodAuthorCards content={block.result} />
              )}
              {kind === 'snippets' && (
                <MinicodSnippetCards content={block.result} />
              )}
            </div>
          );
        }

        return (
          <ToolCallBlock
            key={block.id}
            tool={block}
            renderHeaderExtras={() => (
              <ToolHeaderExtras brand={sourceBrand} query={query} />
            )}
          />
        );
      })}

      {showTrailingIndicator && <StreamingIndicator turn={turn} />}
      {turn.errorMessage && (
        <TurnErrorNotice message={turn.errorMessage} code={turn.errorCode} />
      )}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </div>
  );
});
