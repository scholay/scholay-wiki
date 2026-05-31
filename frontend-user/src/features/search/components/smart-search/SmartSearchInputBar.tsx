import { useCallback } from 'react';
import { ArrowUp, Loader2, RotateCcw, Square } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { SmartSearchContextSnapshot } from '../../api/smart-search';

interface SmartSearchInputBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** WS 是否就绪。未就绪 = send 禁用 */
  ready: boolean;
  /** 当前是否在等待 assistant 回复(用于禁用,避免插队) */
  busy: boolean;
  /** 中断当前回答 —— 仅 busy=true 且非 stopping 中时可点击。
      panel 实际把 {type:'stop_generation'} 通过 WS 推给 agent, agent 走
      SDK interrupt → 3s 超时则强杀 subprocess, 最终 emit message_complete
      让 fold 把 turn 标记为 complete。 */
  onStop: () => void;
  /** 已发起 stop 请求但 agent 尚未 emit terminal 事件 (busy 仍 true) →
      按钮转 spinner+disabled, 避免重复 stop。 */
  stopping: boolean;
  /** 当前会话的上下文水位 (来自 /smart-search/session/context, 实时随轮回结束刷新) */
  contextSnapshot?: SmartSearchContextSnapshot;
  /** 重置按钮点击 → 打开二次确认 dialog (dialog 由 panel 持有) */
  onResetClick: () => void;
  /** 重置按钮是否禁用 (会话未就绪 / 正在重置 / 正在回答中) */
  resetDisabled: boolean;
  /** reset mutation 进行中 → 给按钮一个 spinner */
  resetPending: boolean;
}

export function SmartSearchInputBar({
  value,
  onChange,
  onSubmit,
  ready,
  busy,
  onStop,
  stopping,
  contextSnapshot,
  onResetClick,
  resetDisabled,
  resetPending,
}: SmartSearchInputBarProps) {
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!value.trim() || !ready || busy) return;
      onSubmit();
    },
    [value, ready, busy, onSubmit]
  );

  const sendDisabled = !value.trim() || !ready || busy;

  // 上下文水位 chip:
  //   <50%  灰; 50-80% amber; >80% red — 与原 PanelHeader 同语义,搬过来不变。
  // hasUsage 判 maxTokens > 0, 新会话 totalTokens=0 也展示一下 (鼓励用户感知额度)。
  const hasUsage = !!contextSnapshot && contextSnapshot.maxTokens > 0;
  const percentage = contextSnapshot?.percentage ?? 0;
  const usageChipClass =
    percentage >= 80
      ? 'bg-brand-red/10 text-brand-red'
      : percentage >= 50
        ? 'bg-warning-soft text-brand-amber'
        : 'bg-surface-1 text-muted-foreground';

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-3 bg-background border-t border-border shrink-0"
    >
      <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-surface-2 border border-border-strong focus-within:border-foreground transition-colors">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="继续与智能搜索对话…"
          className="flex-1 h-full bg-transparent text-base outline-none placeholder:text-faint"
        />

        {/* 上下文水位 chip —— 与 send 按钮在同一行右侧, 实时反映 token 用量。
            旧设计放在顶部 PanelHeader, 但 panel 顶栏已经移除, 这里是它的新家。 */}
        {hasUsage && (
          <span
            className={`inline-flex shrink-0 items-center h-5 px-1.5 rounded-pill text-[10px] font-medium ${usageChipClass}`}
            title={`${contextSnapshot.totalTokens.toLocaleString()} / ${contextSnapshot.maxTokens.toLocaleString()} tokens · ${contextSnapshot.model || ''}`}
          >
            {percentage}%
          </span>
        )}

        {/* 重置按钮 —— icon-only 节省横向空间, hover title 给完整说明。
            破坏性操作走 panel 持有的二次确认 dialog, 这里只触发 open。 */}
        <button
          type="button"
          onClick={onResetClick}
          disabled={resetDisabled}
          aria-label="重置当前会话"
          title={resetDisabled ? '当前不可重置' : '重置当前会话, 开始新的对话'}
          className="inline-flex shrink-0 size-7 items-center justify-center rounded-md text-subtle hover:bg-surface-1 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {resetPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="size-3.5" strokeWidth={2} />
          )}
        </button>

        {/* 发送 / 停止 切换 ——
            busy=false: 黑色 send 按钮 (ArrowUp), type=submit 走 onSubmit
            busy=true: 深灰 stop 按钮 (实心方块), type=button 走 onStop
            stopping=true: stop 按钮转 spinner+disabled, 防重复点
            注意 type=button 必要 —— 留在 type=submit 会触发 form onSubmit,
            而 onSubmit 里又判 busy 直接 return 把停止动作吞掉。 */}
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            aria-label={stopping ? '正在停止' : '停止生成'}
            title={stopping ? '正在停止…' : '停止当前回答'}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md text-background transition-colors',
              stopping
                ? 'bg-foreground/60 cursor-wait'
                : 'bg-foreground hover:bg-foreground/85'
            )}
          >
            {stopping ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Square
                className="size-3 fill-current"
                strokeWidth={0}
                aria-hidden="true"
              />
            )}
          </button>
        ) : (
          <button
            type="submit"
            disabled={sendDisabled}
            aria-label="发送"
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md text-background transition-colors',
              sendDisabled
                ? 'bg-surface-1 text-faint cursor-not-allowed'
                : 'bg-brand-red hover:bg-brand-red/90'
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </form>
  );
}
