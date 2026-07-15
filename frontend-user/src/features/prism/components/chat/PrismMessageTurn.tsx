import { memo } from 'react';
import {
  AssistantBubble,
  AttachmentChipList,
  ChatStyles,
  PausedNotice,
  ProcessFold,
  ReferenceChipList,
  StreamingIndicator,
  TurnErrorNotice,
  ThinkingFold,
  ToolCallBlock,
  UserBubble,
} from '@/shared/components/chat';
import { stripContainerPaths } from '@/shared/lib/strip-container-paths';
import { hasVisibleAssistantContent, isLastBlockStreamingText, type Turn } from '@/shared/types/chat';

/**
 * Prism 单轮对话渲染 —— 与 claw/smart-search 共用 shared/components/chat 原子,视觉对齐 claw 现代风:
 *   - ThinkingFold 提到**顶层**(不再嵌进 ProcessFold 形成双层折叠);
 *   - 正文用 `variant="plain"`(无白卡框·全宽 markdown),与 claw 一致;
 *   - 「处理过程」折叠收 thinking 之外的**工具调用 + 中间叙述**(写作轮工具多,折叠保持整洁);
 *     流式期折叠**展开**,用户实时看到 agent 读文件/编辑/写正文;完成后折叠收起、最终答案 plain 常驻。
 *   - 出口清洗 stripContainerPaths 兜住偶发泄漏的容器内部路径/文件名。
 *
 * 注:末尾文本块只在 **turn.complete** 时才拎到折叠外(complete-gated)—— 若流式期就按「当前末尾是文本」
 * 拎出,写作轮「叙述→工具→叙述→工具」里每段中间叙述都会先在折叠外闪现、下一个工具到达又跳回折叠内,
 * 造成高频重排抖动(P0 对抗审查 finding #1)。故只在完成时一次性外提,流式期一律留在展开的折叠内实时可见。
 */
export const PrismMessageTurn = memo(function PrismMessageTurn({ turn }: { turn: Turn }) {
  const visible = hasVisibleAssistantContent(turn);
  const blocks = turn.blocks;
  const last = blocks[blocks.length - 1];
  // 末尾文本块 = 最终答案/总结,**仅完成后**拎到折叠外(complete-gated,避免流式中途重排抖动)。
  const answer = turn.complete && last && last.kind === 'text' && last.text ? last : null;
  const processBlocks = answer ? blocks.slice(0, -1) : blocks;
  const toolSteps = processBlocks.filter((b) => b.kind === 'tool').length;
  const hasProcessBlocks = processBlocks.some(
    (b) => b.kind === 'tool' || (b.kind === 'text' && !!b.text),
  );
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

      {/* thinking 提到顶层(对齐 claw),不再嵌进 ProcessFold */}
      {turn.thinkingText && <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />}

      {!turn.complete && !turn.errorMessage && !visible && <StreamingIndicator turn={turn} />}

      {/* 处理过程(工具 + 中间叙述)折叠 —— 不含最终答案 */}
      {hasProcessBlocks && (
        <ProcessFold streaming={!turn.complete} toolSteps={toolSteps}>
          {processBlocks.map((b, idx) => {
            if (b.kind === 'text') {
              if (!b.text) return null;
              const streamingText =
                !turn.complete &&
                idx === processBlocks.length - 1 &&
                turn.placeholder?.state === 'streaming';
              return (
                <AssistantBubble
                  key={b.id}
                  variant="plain"
                  text={stripContainerPaths(b.text)}
                  streaming={streamingText}
                />
              );
            }
            return <ToolCallBlock key={b.id} tool={b} />;
          })}
          {/* 还在工具阶段(答案未开始)→ 折叠内尾部指示 */}
          {!turn.complete && !turn.errorMessage && !answer && visible && !isLastBlockStreamingText(turn) && (
            <StreamingIndicator turn={turn} />
          )}
        </ProcessFold>
      )}

      {/* 最终答案/总结:完成后折叠外常驻主角,plain 全宽(流式期它在上面展开的处理过程折叠里实时可见)。 */}
      {answer && <AssistantBubble variant="plain" text={stripContainerPaths(answer.text)} />}

      {turn.errorMessage && <TurnErrorNotice message={turn.errorMessage} />}

      {/* 整轮被用户暂停 —— 末尾收尾标识(与 claw / smart-search 同款,历史回放也走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </article>
  );
});

// 注:admin 会话监控有一份**独立复制**的 prism 镜像(AdminTranscriptView 的 PrismTurn),复用同一个
// ProcessFold 容器,但那是另一份实现。本次(P0)只改了用户端的 plain 变体 / thinking 提顶 / 出口清洗,
// 镜像的这几处样式尚未同步(该文件当前另有未提交改动,不便一并动)→「管理端 = 用户端」是待补齐的目标,
// 不是当前保证。切片逻辑(complete-gated answer)两侧已一致;后续同步镜像样式时以本文件为准。
