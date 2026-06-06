import { replayHistoryAsTurns } from '@/shared/lib/agent-history';
import {
  ChatStyles,
  UserBubble,
  AssistantBubble,
  ThinkingFold,
  ToolCallBlock,
} from '@/shared/components/chat';
import type { Turn } from '@/shared/types/chat';
import type { TranscriptEntry } from '../api/session-monitor';

/**
 * 管理端只读 transcript 渲染 —— 复用与用户端**同一套** shared 折叠(replayHistoryAsTurns)+
 * chat 渲染原子(UserBubble/AssistantBubble/ThinkingFold/ToolCallBlock),保证「和用户看到的一模一样」。
 * 只读:不带 streaming 光标 / 不带交互。
 */
function TranscriptTurn({ turn }: { turn: Turn }) {
  return (
    <article className="space-y-2">
      {turn.userText && <UserBubble text={turn.userText} />}
      {turn.thinkingText && <ThinkingFold text={turn.thinkingText} isActive={false} />}
      {turn.blocks.map((b) =>
        b.kind === 'text' ? (
          <AssistantBubble key={b.id} text={b.text} />
        ) : (
          <ToolCallBlock key={b.id} tool={b} />
        ),
      )}
    </article>
  );
}

export function AdminTranscriptView({ messages }: { messages: TranscriptEntry[] }) {
  const turns = replayHistoryAsTurns(messages);
  if (turns.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-faint">
        无会话内容(用户尚未对话,或会话已被清理)
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <ChatStyles />
      {turns.map((t) => (
        <TranscriptTurn key={t.id} turn={t} />
      ))}
    </div>
  );
}
