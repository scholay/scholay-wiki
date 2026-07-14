import { memo } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  AssistantBubble,
  AttachmentChipList,
  ChatStyles,
  PausedNotice,
  ProcessFold,
  ReferenceChipList,
  StreamingIndicator,
  ThinkingFold,
  ToolCallBlock,
  UserBubble,
} from '@/shared/components/chat';
import { hasVisibleAssistantContent, isLastBlockStreamingText, type Turn } from '@/shared/types/chat';

/**
 * Prism 单轮对话渲染 —— 与 claw/smart-search 共用 shared/components/chat 原子,视觉一致。
 * 差异:把「处理过程」(thinking + 工具调用 + 中间叙述)包进一个可收起的折叠;
 *   - 流式中:展开,实时看 agent 在读文件/编辑/思考;
 *   - 完成后:自动收起成「处理过程 · N 步」一行,最终总结(末尾文本块)常驻在外。
 */
export const PrismMessageTurn = memo(function PrismMessageTurn({ turn }: { turn: Turn }) {
  const visible = hasVisibleAssistantContent(turn);
  const blocks = turn.blocks;
  const last = blocks[blocks.length - 1];
  // 完成后,末尾文本块 = 最终总结,拎到折叠外常驻;其余进「处理过程」。流式中全在折叠内实时滚。
  const finalText = turn.complete && last && last.kind === 'text' && last.text ? last : null;
  const processBlocks = finalText ? blocks.slice(0, -1) : blocks;
  const toolSteps = processBlocks.filter((b) => b.kind === 'tool').length;
  const hasProcess = !!turn.thinkingText || processBlocks.length > 0;
  const isThinkingActive = !turn.complete && turn.placeholder?.state === 'thinking';

  return (
    <article className="flex flex-col gap-2 min-w-0">
      <ChatStyles />
      <UserBubble
        text={turn.userText}
        attachments={
          (turn.userAttachments && turn.userAttachments.length > 0) ||
          (turn.userReferences && turn.userReferences.length > 0) ? (
            <>
              {turn.userAttachments && turn.userAttachments.length > 0 && (
                <AttachmentChipList attachments={turn.userAttachments} />
              )}
              {turn.userReferences && turn.userReferences.length > 0 && (
                <ReferenceChipList references={turn.userReferences} />
              )}
            </>
          ) : undefined
        }
      />

      {!turn.complete && !turn.errorMessage && !visible && <StreamingIndicator turn={turn} />}

      {hasProcess && (
        <ProcessFold streaming={!turn.complete} toolSteps={toolSteps}>
          {turn.thinkingText && <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />}
          {processBlocks.map((b, idx) => {
            if (b.kind === 'text') {
              if (!b.text) return null;
              const streamingText =
                !turn.complete &&
                idx === processBlocks.length - 1 &&
                turn.placeholder?.state === 'streaming';
              return <AssistantBubble key={b.id} text={b.text} streaming={streamingText} />;
            }
            return <ToolCallBlock key={b.id} tool={b} />;
          })}
          {!turn.complete && !turn.errorMessage && visible && !isLastBlockStreamingText(turn) && (
            <StreamingIndicator turn={turn} />
          )}
        </ProcessFold>
      )}

      {finalText && <AssistantBubble text={finalText.text} />}

      {turn.errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-brand-red/30 bg-danger-soft px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" />
          <p className="flex-1 min-w-0 text-xs text-brand-red break-words">{turn.errorMessage}</p>
        </div>
      )}

      {/* 整轮被用户暂停 —— 末尾收尾标识(与 claw / smart-search 同款,历史回放也走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </article>
  );
});

// ProcessFold(「处理过程」折叠容器)已提升到 @/shared/components/chat —— admin 会话监控
// 渲染 prism transcript 复用同一份,保证「管理端看到的 = 用户看到的」。
