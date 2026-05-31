import { AlertCircle } from 'lucide-react';
import {
  AssistantBubble,
  AttachmentChipList,
  ChatStyles,
  PausedNotice,
  StreamingIndicator,
  ThinkingFold,
  ToolCallBlock,
  UserBubble,
} from '@/shared/components/chat';
import {
  hasVisibleAssistantContent,
  isLastBlockStreamingText,
  type Turn,
} from '@/shared/types/chat';

/**
 * 智能助手 (claw) 单轮对话渲染.
 *
 * 跟 smart-search 共享同一套 shared/components/chat 原子, 视觉契约一致:
 *   - <UserBubble> 右对齐深底气泡 (上方挂可选附件 chip)
 *   - <ThinkingFold> 三态折叠面板 (流式展开+滚动跟随; 完成后预览收起)
 *   - <AssistantBubble> 白底 markdown 气泡 (含绿色 ol 序号 chip)
 *   - <ToolCallBlock> 通用工具调用块, 默认 JSON 折叠展示 input/result
 *   - <StreamingIndicator> 末尾占位胶囊, "正在检索学者/正在执行命令…"
 *
 * 跟 smart-search 唯一的差异是:
 *   1. claw 支持 userAttachments → 通过 <AttachmentChipList> 挂在用户气泡上方
 *   2. claw 不做 minicod 论文工具特化 (ToolCallBlock 默认 JSON 展开就够用)
 */
export function MessageTurn({ turn }: { turn: Turn }) {
  const visible = hasVisibleAssistantContent(turn);
  const isThinkingActive =
    !turn.complete && turn.placeholder?.state === 'thinking';
  const isStreamingText = isLastBlockStreamingText(turn);
  const showTrailingIndicator =
    !turn.complete && !turn.errorMessage && visible && !isStreamingText;

  return (
    <article className="flex flex-col gap-2.5 min-w-0">
      <ChatStyles />
      <UserBubble
        text={turn.userText}
        attachments={
          turn.userAttachments && turn.userAttachments.length > 0 ? (
            <AttachmentChipList attachments={turn.userAttachments} />
          ) : undefined
        }
      />

      {turn.thinkingText && (
        <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
      )}

      {!turn.complete && !turn.errorMessage && !visible && (
        <StreamingIndicator turn={turn} />
      )}

      {visible && (
        <>
          {turn.blocks.map((b, idx) => {
            if (b.kind === 'text') {
              if (!b.text) return null;
              const isLastTextStreaming =
                !turn.complete &&
                idx === turn.blocks.length - 1 &&
                turn.placeholder?.state === 'streaming';
              return (
                <AssistantBubble
                  key={b.id}
                  text={b.text}
                  streaming={isLastTextStreaming}
                />
              );
            }
            return <ToolCallBlock key={b.id} tool={b} />;
          })}
          {showTrailingIndicator && <StreamingIndicator turn={turn} />}
        </>
      )}

      {turn.errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-brand-red/30 bg-danger-soft px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-red">回答失败</p>
            <p className="text-xs text-muted-foreground break-words">
              {turn.errorMessage}
            </p>
          </div>
        </div>
      )}

      {/* 整轮被用户暂停 —— 末尾收尾标识 (实时 + 重入回放都走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </article>
  );
}
