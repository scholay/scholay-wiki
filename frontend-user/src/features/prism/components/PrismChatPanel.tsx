import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowUp, Square, Sparkles, Check, FileText, RotateCcw, Quote, X, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import type { usePrismChat } from '../hooks/usePrismChat';

function fmtDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Prism agent-native 对话面板(用户 WS):干净的消息轮次 + 「已处理 Xs」+ 改动卡片(应用/丢弃门)。
 * 发送由父层 onSend 处理(flush 正文 + chat.send 铺源+WS 发指令);应用/丢弃走 chat.apply/reject。
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

  const hasThread = chat.messages.length > 0;

  const onThreadScroll = () => {
    const el = threadRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  useEffect(() => {
    if (atBottomRef.current) threadEnd.current?.scrollIntoView({ behavior: chat.streaming ? 'auto' : 'smooth' });
  }, [chat.messages, chat.streaming]);

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

  return (
    <div className="flex flex-col border-t border-border bg-background">
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
          <WifiOff className="size-3" /> 连接断开,刷新页面重试
        </div>
      ) : null}

      {(hasThread || chat.streaming) && (
        <div ref={threadRef} onScroll={onThreadScroll} className="max-h-[44vh] overflow-y-auto px-3.5 py-3">
          {chat.messages.map((m, idx) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="mb-4 flex justify-end">
                  <div className="max-w-[86%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2 text-xs leading-relaxed text-foreground">
                    {m.text}
                  </div>
                </div>
              );
            }
            const isLive = chat.streaming && idx === chat.messages.length - 1;
            return (
              <div key={m.id} className="mb-5 space-y-2">
                {m.durationMs != null ? (
                  <div className="flex items-center gap-1.5 text-2xs text-faint">
                    <Sparkles className="size-3 text-brand-green" /> 已处理 {fmtDuration(m.durationMs)}
                  </div>
                ) : isLive ? (
                  <div className="flex items-center gap-1.5 text-2xs text-faint">
                    <Loader2 className="size-3 animate-spin" /> {m.statuses[m.statuses.length - 1] || '正在生成…'}
                  </div>
                ) : null}

                {m.text && <p className="whitespace-pre-wrap text-xs leading-relaxed text-subtle">{m.text}</p>}

                {m.error && <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-brand-red">{m.error}</p>}

                {m.changeset && m.changeset.state !== 'streaming' && (
                  <ChangesetCard cs={m.changeset} onApply={chat.apply} onReject={chat.reject} />
                )}
              </div>
            );
          })}
          <div ref={threadEnd} />
        </div>
      )}

      <div className="p-3">
        <div
          className={cn(
            'rounded-xl border border-border-button bg-background px-3 py-2 transition-shadow',
            'focus-within:border-border-strong focus-within:ring-2 focus-within:ring-ring/25',
            blocked && 'opacity-60',
          )}
        >
          {quote && (
            <div className="mb-2 flex items-start gap-1.5 rounded-md border-l-2 border-brand-green bg-surface-1 px-2 py-1.5">
              <Quote className="mt-0.5 size-3 shrink-0 text-brand-green" />
              <span className="line-clamp-2 flex-1 whitespace-pre-wrap text-2xs leading-snug text-subtle">{quote}</span>
              <button type="button" onClick={onClearQuote} title="移除引用" className="shrink-0 text-faint transition-colors hover:text-foreground">
                <X className="size-3" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button type="button" onClick={chat.newChat} title="新对话" className="mb-0.5 shrink-0 text-faint transition-colors hover:text-foreground">
              <RotateCcw className="size-4" />
            </button>
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
              className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent text-base leading-relaxed text-foreground placeholder:text-faint focus:outline-none disabled:cursor-not-allowed"
            />
            {chat.streaming ? (
              <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={chat.stop} title="停止">
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button size="icon" className="size-8 shrink-0" onClick={send} disabled={!instruction.trim() || blocked || !wsReady} title="发送">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
          {wsReady && !chat.displacedReason && (
            <div className="mt-1 flex items-center gap-1 px-1 text-2xs text-faint">
              <Wifi className="size-2.5 text-brand-green" /> 已连接
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STATE_LABEL: Record<string, string> = { applied: '已应用', discarded: '已丢弃', historical: '历史' };

function ChangesetCard({
  cs,
  onApply,
  onReject,
}: {
  cs: { applied: number; state: 'streaming' | 'awaiting_apply' | 'applied' | 'discarded' | 'historical' };
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
            <Button size="sm" variant="ghost" className="h-7 px-2 text-faint hover:text-brand-red" onClick={onReject}>
              丢弃
            </Button>
            <Button size="sm" className="h-7 px-2.5" onClick={onApply}>
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
      {awaiting && <div className="border-t border-border-soft px-3 py-1.5 text-2xs text-faint">在上方编辑器审阅 diff,确认后「应用」固化,或「丢弃」还原。</div>}
    </div>
  );
}
