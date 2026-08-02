import { memo } from 'react';
import { Wrench } from 'lucide-react';
import {
  AssistantBubble,
  AttachmentChipList,
  BlockedTurnCard,
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
import { useQuotaStore } from '@/stores/quota.store';
import { isCompileCheckText } from '../../lib/compile-check';

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
export const PrismMessageTurn = memo(function PrismMessageTurn({
  turn,
  onResendBlocked,
  onDismissBlocked,
}: {
  turn: Turn;
  /** blocked(命中额度未发送)轮:点「重新发送」。引用稳定不破 memo(PrismChatPanel ref-latest 包装)。 */
  onResendBlocked?: () => void;
  /** blocked 轮:点「忽略」丢弃这条未发送消息。 */
  onDismissBlocked?: () => void;
}) {
  const openReset = useQuotaStore((s) => s.openReset);
  const visible = hasVisibleAssistantContent(turn);
  const blocks = turn.blocks;
  const last = blocks[blocks.length - 1];
  // 末尾文本块 = 最终答案/总结,**仅完成后**拎到折叠外(complete-gated,避免流式中途重排抖动)。
  const answer = turn.complete && last && last.kind === 'text' && last.text ? last : null;
  // 交互提问(AskUserQuestion,方案 B):不在对话流/处理过程里渲染 —— 待作答问题由输入框上方的
  // QuestionPrompt 分步面板承接(PrismChatPanel),历史/已答态由用户答案气泡表达。故从过程块里滤掉。
  const processBlocks = (answer ? blocks.slice(0, -1) : blocks).filter(
    (b) => !(b.kind === 'tool' && b.toolName === 'AskUserQuestion'),
  );
  const toolSteps = processBlocks.filter((b) => b.kind === 'tool').length;
  const hasProcessBlocks = processBlocks.some(
    (b) => b.kind === 'tool' || (b.kind === 'text' && !!b.text),
  );
  const isThinkingActive = !turn.complete && turn.placeholder?.state === 'thinking';

  // 系统自动编译检查轮:用户侧不显示成提问气泡,折成一条低调「系统 · 自动编译检查」小条(诉求:自动修但不显示成提问)。
  const isCompileCheck = isCompileCheckText(turn.userText);

  return (
    <article className="flex flex-col gap-2 min-w-0">
      <ChatStyles />
      {isCompileCheck ? (
        <div className="flex items-center gap-1.5 self-start rounded-pill border border-border bg-surface-1 px-2.5 py-1 text-12 text-muted-foreground">
          <Wrench className="size-3 shrink-0" /> 系统 · 自动编译检查
        </div>
      ) : (
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
      )}

      {/* thinking 提到顶层(对齐 claw),不再嵌进 ProcessFold */}
      {turn.thinkingText && <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />}

      {/* blocked 轮不渲染流式占位(fold 已置 complete=true,这里再显式排除一道,双保险)。 */}
      {!turn.complete && !turn.errorMessage && !turn.blocked && !visible && (
        <StreamingIndicator turn={turn} />
      )}

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

      {turn.errorMessage && <TurnErrorNotice message={turn.errorMessage} code={turn.errorCode} />}

      {/* 命中额度「未发送」轮 —— 保留用户气泡 + 一键重发(无需重打),与 claw 同款 shared 卡片。
          消息已按「项目+对话」持久化(localStorage),跳支付宝充会员整页返回 / 换设备回来都能重发。 */}
      {turn.blocked && (
        <BlockedTurnCard
          onResend={onResendBlocked}
          onOpenReset={openReset}
          onDismiss={onDismissBlocked}
        />
      )}

      {/* 整轮被用户暂停 —— 末尾收尾标识(与 claw / smart-search 同款,历史回放也走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && !turn.blocked && <PausedNotice />}
    </article>
  );
});

// 注:admin 会话监控有一份**独立复制**的 prism 镜像(AdminTranscriptView 的 PrismTurn),复用同一个
// ProcessFold 容器,但那是另一份实现。本次(P0)只改了用户端的 plain 变体 / thinking 提顶 / 出口清洗,
// 镜像的这几处样式尚未同步(该文件当前另有未提交改动,不便一并动)→「管理端 = 用户端」是待补齐的目标,
// 不是当前保证。切片逻辑(complete-gated answer)两侧已一致;后续同步镜像样式时以本文件为准。
