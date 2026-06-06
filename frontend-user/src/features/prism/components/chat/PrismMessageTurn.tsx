import { memo, useState } from 'react';
import { AlertCircle, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import {
  AssistantBubble,
  ChatStyles,
  StreamingIndicator,
  ThinkingFold,
  ToolCallBlock,
  UserBubble,
} from '@/shared/components/chat';
import { hasVisibleAssistantContent, isLastBlockStreamingText, type Turn } from '@/shared/types/chat';
import { cn } from '@/shared/lib/utils';

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
      <UserBubble text={turn.userText} />

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
    </article>
  );
});

/**
 * 「处理过程」可收起容器:流式中默认展开(让用户实时看到工具步骤),完成后默认收起成一行标题。
 * 用户可点标题手动 override 展开/收起。
 */
function ProcessFold({
  streaming,
  toolSteps,
  children,
}: {
  streaming: boolean;
  toolSteps: number;
  children: React.ReactNode;
}) {
  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const expanded = override ?? streaming;
  return (
    <div className="rounded-lg border border-border-soft bg-surface-1/60">
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {streaming ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-brand-green" />
        ) : (
          <Sparkles className="size-3 shrink-0 text-brand-green" />
        )}
        <span className="font-medium">处理过程{toolSteps > 0 ? ` · ${toolSteps} 步` : ''}</span>
        <ChevronRight
          className={cn('ml-auto size-3 shrink-0 transition-transform', expanded && 'rotate-90')}
        />
      </button>
      {expanded && <div className="flex flex-col gap-2 px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}
