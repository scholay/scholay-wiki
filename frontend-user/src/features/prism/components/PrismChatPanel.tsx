import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowUp, Square, Check, FileText, RotateCcw, Quote, X, WifiOff } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { ContextMeter } from '@/shared/components/chat';
import type { usePrismChat, PrismChangeset } from '../hooks/usePrismChat';
import { PrismMessageTurn } from './chat/PrismMessageTurn';

/**
 * Prism agent-native 对话面板(用户 WS):与 claw/smart-search 共用 shared/components/chat 渲染
 * (实时工具/思考/prose,「处理过程」可收起)+ 改动卡片(应用/丢弃门)+ claw 风格输入框。
 */
export function PrismChatPanel({
  chat,
  fileId,
  quote,
  onClearQuote,
  onSend,
}: {
  chat: ReturnType<typeof usePrismChat>;
  fileId: number | null;
  quote?: string;
  onClearQuote?: () => void;
  onSend: (instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const threadEnd = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);

  const hasThread = chat.turns.length > 0;

  const onThreadScroll = () => {
    const el = threadRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  useEffect(() => {
    if (atBottomRef.current) threadEnd.current?.scrollIntoView({ behavior: chat.streaming ? 'auto' : 'smooth' });
  }, [chat.turns, chat.streaming]);

  useEffect(() => {
    if (quote) inputRef.current?.focus();
  }, [quote]);

  // 不能发的情形:无文件 / 流式中 / 有待应用改动(先决定 应用/丢弃)/ WS 未连上。
  const blocked = !fileId || chat.streaming || chat.awaitingApply;
  const wsReady = chat.wsState === 'open';

  const send = () => {
    const ins = instruction.trim();
    if (!ins || blocked || !wsReady) return;
    setInstruction('');
    onSend(ins);
  };

  const placeholder = !fileId
    ? '先选一个文件'
    : chat.awaitingApply
    ? '先在上方审阅并 应用 / 丢弃 当前改动'
    : !wsReady
    ? '连接中…'
    : quote
    ? '对引用的内容做点什么…'
    : '让 AI 续写、改写、润色…(Enter 发送)';

  const showThread = hasThread || chat.streaming || chat.changeset;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* WS 状态条:重连/断开/被接管 */}
      {chat.displacedReason ? (
        <div className="flex items-center justify-between gap-2 bg-warning-soft px-3.5 py-1.5 text-2xs text-prism-badge-fg">
          <span className="flex items-center gap-1.5"><WifiOff className="size-3" /> {chat.displacedReason}</span>
          <button type="button" onClick={chat.takeOver} className="font-bold underline">切回这里</button>
        </div>
      ) : chat.wsState === 'reconnecting' || chat.wsState === 'connecting' ? (
        <div className="flex items-center gap-1.5 bg-surface-1 px-3.5 py-1 text-2xs text-faint">
          <Loader2 className="size-3 animate-spin" /> 连接中…
        </div>
      ) : chat.wsState === 'error' ? (
        <div className="flex items-center gap-1.5 bg-danger-soft px-3.5 py-1 text-2xs text-brand-red">
          <WifiOff className="size-3" /> 连接断开,正在重试…
        </div>
      ) : null}

      {showThread ? (
        <div ref={threadRef} onScroll={onThreadScroll} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3.5 py-3">
          {/* 超长会话:进来只拉最近 N 轮,有更早历史时给「加载更早」(避开在途/待应用轮以免覆盖) */}
          {chat.hasMoreHistory && !chat.streaming && !chat.awaitingApply && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={chat.loadEarlier}
                disabled={chat.loadingEarlier}
                className="rounded-pill border border-border-button px-3 py-1 text-2xs text-muted-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                {chat.loadingEarlier ? '加载中…' : '加载更早'}
              </button>
            </div>
          )}
          {chat.turns.map((t) => (
            <PrismMessageTurn key={t.id} turn={t} />
          ))}
          {chat.changeset && (
            <ChangesetCard cs={chat.changeset} onApply={chat.apply} onReject={chat.reject} />
          )}
          <div ref={threadEnd} />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* 输入框 —— 与智能助手(claw)同款视觉:rounded-lg / border-strong / 右下发送停止按钮 */}
      <div className="shrink-0 p-3">
        <div
          className={cn(
            'flex flex-col gap-2 rounded-lg border border-border-strong bg-background p-2.5 shadow-sm transition-colors',
            'focus-within:border-foreground',
            blocked && 'opacity-60',
          )}
        >
          {quote && (
            <div className="flex items-start gap-1.5 rounded-md border-l-2 border-brand-green bg-surface-1 px-2 py-1.5">
              <Quote className="mt-0.5 size-3 shrink-0 text-brand-green" />
              <span className="line-clamp-2 flex-1 whitespace-pre-wrap text-2xs leading-snug text-subtle">{quote}</span>
              <button type="button" onClick={onClearQuote} title="移除引用" className="shrink-0 text-faint transition-colors hover:text-foreground">
                <X className="size-3" />
              </button>
            </div>
          )}

          <textarea
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            rows={2}
            disabled={blocked}
            className="max-h-[180px] min-h-[44px] w-full resize-none border-0 bg-transparent px-1 py-1 text-base leading-relaxed text-foreground placeholder:text-faint focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />

          {/* 底部工具栏:新对话(左) + 占位 + 发送/停止(右) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={chat.newChat}
              title="新对话"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            {chat.context && chat.context.totalTokens > 0 && (
              <ContextMeter
                totalTokens={chat.context.totalTokens}
                maxTokens={chat.context.maxTokens}
                percentage={chat.context.percentage}
                model={chat.context.model}
                className="ml-1"
              />
            )}
            <span className="flex-1" />
            {chat.streaming ? (
              <button
                type="button"
                onClick={chat.stop}
                title="停止当前回答"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background transition-colors hover:bg-foreground/85"
              >
                <Square className="h-3 w-3 fill-current" strokeWidth={0} />
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={!instruction.trim() || blocked || !wsReady}
                title="发送 (Enter)"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:bg-surface-2 disabled:text-faint"
              >
                {blocked && wsReady && chat.streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const STATE_LABEL: Record<PrismChangeset['state'], string> = {
  awaiting_apply: '待应用',
  applied: '已应用',
  discarded: '已丢弃',
};

function ChangesetCard({
  cs,
  onApply,
  onReject,
}: {
  cs: PrismChangeset;
  onApply: () => void;
  onReject: () => void;
}) {
  const awaiting = cs.state === 'awaiting_apply';
  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <FileText className="size-4 shrink-0 text-brand-green" />
        <div className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">
          AI 改动
          <span className="ml-1.5 font-normal text-faint">{cs.applied} 个文件</span>
        </div>
        {awaiting ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" data-testid="prism-reject" className="h-7 px-2 text-faint hover:text-brand-red" onClick={onReject}>
              丢弃
            </Button>
            <Button size="sm" data-testid="prism-apply" className="h-7 px-2.5" onClick={onApply}>
              <Check className="size-3.5" /> 应用
            </Button>
          </div>
        ) : (
          <span
            className={cn(
              'shrink-0 rounded-pill px-2 py-0.5 text-2xs',
              cs.state === 'applied' ? 'bg-brand-green/10 text-brand-green' : 'text-faint',
            )}
          >
            {STATE_LABEL[cs.state]}
          </span>
        )}
      </div>
      {awaiting && (
        <div className="border-t border-border-soft px-3 py-1.5 text-2xs text-faint">
          在上方编辑器审阅 diff,确认后「应用」固化,或「丢弃」还原。
        </div>
      )}
    </div>
  );
}
