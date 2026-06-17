import { useEffect, useState } from 'react';
import { ArrowUp, Loader2, LogIn, RotateCcw, Square } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import type { SmartSearchContextSnapshot } from '../../api/smart-search';

/**
 * 智能搜索统一对话框 —— 起始态 hero(居中)与对话中底部栏**共用同一个组件**,
 * 保证两处样式完全一致(圆角对话框 / 柔和聚焦 / 发送键),只是放置位置不同:
 *   - hero(prominent):居中、更高(rows=2)、自动聚焦、placeholder 轮播示例提问
 *   - 底部栏:紧凑(rows=1),带「重置 / 用量水位 / 停止」控件
 *
 * 聚焦态用柔和的浅描边 + 极淡外圈(不再是刺眼的纯黑边框)。
 */

/** hero(空态)与对话中底部栏共用的 layoutId —— 发送首条消息后 framer-motion 据此把对话框
 *  从居中平滑地滑动/停靠到底部(见 SmartSearchHero / SmartSearchPanel,二者同 layoutId)。 */
export const COMPOSER_LAYOUT_ID = 'smart-search-composer';

/** 对话框「居中 → 底部」停靠动画的过渡;reduced-motion 下直接瞬切(去掉位移,避免前庭不适)。 */
export const composerDockTransition = (reduce: boolean | null) =>
  reduce ? { duration: 0 } : ({ type: 'spring', bounce: 0.18, duration: 0.55 } as const);

export interface SmartComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** 静态 placeholder(提供 rotatingPlaceholders 时忽略)。 */
  placeholder?: string;
  /** 输入框内轮播的示例提问(空输入时淡入淡出循环);提供则覆盖 placeholder。 */
  rotatingPlaceholders?: string[];
  /** 未登录:发送键变登录键,提交触发登录而非真正发送。 */
  loggedOut?: boolean;
  /** WS 就绪(未就绪禁用发送);loggedOut 时忽略。 */
  ready?: boolean;
  /** 生成中 → 发送键变停止键。 */
  busy?: boolean;
  onStop?: () => void;
  stopping?: boolean;
  /** 上下文水位 chip(底部栏用)。 */
  contextSnapshot?: SmartSearchContextSnapshot;
  /** 重置按钮(底部栏用);不传则不渲染。 */
  onResetClick?: () => void;
  resetDisabled?: boolean;
  resetPending?: boolean;
  /** hero 起始态尺寸:更大(rows=3)。底部栏也传它以复用同一套「空态」尺寸,保证两处完全一致。 */
  prominent?: boolean;
  /** 挂载时自动聚焦 —— 与 prominent 解耦:空态 hero 需要,底部栏不需要(避免抢焦/滚动跳)。 */
  autoFocus?: boolean;
}

export function SmartComposer({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  rotatingPlaceholders,
  loggedOut = false,
  ready = true,
  busy = false,
  onStop,
  stopping = false,
  contextSnapshot,
  onResetClick,
  resetDisabled = false,
  resetPending = false,
  prominent = false,
  autoFocus = false,
}: SmartComposerProps) {
  const canSend = loggedOut || (!!value.trim() && ready && !busy);
  const rotating = !!rotatingPlaceholders && rotatingPlaceholders.length > 0;
  const showRotating = rotating && value.length === 0;

  const submit = () => {
    if (loggedOut) {
      onSubmit();
      return;
    }
    if (value.trim() && ready && !busy) onSubmit();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // CJK 输入法组字中的回车是「选词」,不能当发送;Shift+Enter 换行。
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  // 上下文水位 chip:<50% 灰 / 50-80% amber / >80% red。
  const hasUsage = !!contextSnapshot && contextSnapshot.maxTokens > 0;
  const percentage = contextSnapshot?.percentage ?? 0;
  const usageChipClass =
    percentage >= 80
      ? 'bg-brand-red/10 text-brand-red'
      : percentage >= 50
        ? 'bg-warning-soft text-brand-amber'
        : 'bg-surface-1 text-muted-foreground';

  return (
    <div
      className={cn(
        'flex items-end gap-2 rounded-2xl border border-border-strong bg-background px-2.5 py-2 shadow-sm transition',
        'focus-within:border-foreground/25 focus-within:ring-4 focus-within:ring-foreground/5'
      )}
    >
      <div className="relative min-w-0 flex-1">
        {showRotating && <RotatingPlaceholder items={rotatingPlaceholders!} />}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={rotating ? '' : placeholder}
          aria-label={loggedOut ? '智能搜索输入(登录后可用)' : '智能搜索输入'}
          // prominent = 空态 hero 尺寸(rows=3);底部栏现在也复用它,保证两处尺寸一致。
          rows={prominent ? 3 : 1}
          autoFocus={autoFocus}
          className="block max-h-44 w-full resize-none bg-transparent px-2 py-1.5 text-base leading-relaxed text-foreground outline-none placeholder:text-faint"
        />
      </div>

      {hasUsage && (
        <span
          className={cn(
            // 行是 items-end(让 textarea 向上长、按钮贴底);chip 只有 h-5 而按钮是 size-8,
            // 底对齐会让 chip 中心比按钮低 (32-20)/2=6px → 用 mb-1.5 抬起,使三者垂直居中对齐。
            'mb-1.5 inline-flex h-5 shrink-0 items-center rounded-pill px-1.5 text-2xs font-medium',
            usageChipClass
          )}
          title={`${contextSnapshot!.totalTokens.toLocaleString()} / ${contextSnapshot!.maxTokens.toLocaleString()} tokens · ${contextSnapshot!.model || ''}`}
        >
          {percentage}%
        </span>
      )}

      {onResetClick && (
        <button
          type="button"
          onClick={onResetClick}
          disabled={resetDisabled}
          aria-label="重置当前会话"
          title={resetDisabled ? '当前不可重置' : '重置当前会话, 开始新的对话'}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {resetPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="size-3.5" strokeWidth={2} />
          )}
        </button>
      )}

      {/* 发送 / 停止 / 登录 */}
      {busy && !loggedOut ? (
        <button
          type="button"
          onClick={onStop}
          disabled={stopping}
          aria-label={stopping ? '正在停止' : '停止生成'}
          title={stopping ? '正在停止…' : '停止当前回答'}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-background transition-colors',
            stopping ? 'cursor-wait bg-foreground/60' : 'bg-foreground hover:bg-foreground/85'
          )}
        >
          {stopping ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Square className="size-3 fill-current" strokeWidth={0} aria-hidden="true" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label={loggedOut ? '登录后开始' : '发送'}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-background transition-colors',
            canSend
              ? 'bg-brand-red hover:bg-brand-red/90'
              : 'cursor-not-allowed bg-surface-2 text-faint'
          )}
        >
          {loggedOut ? (
            <LogIn className="size-4" strokeWidth={2.2} />
          ) : (
            <ArrowUp className="size-4" strokeWidth={2.5} />
          )}
        </button>
      )}
    </div>
  );
}

/** 输入框内轮播提示 —— 空输入时在 placeholder 位置淡入淡出循环示例提问。 */
function RotatingPlaceholder({ items }: { items: string[] }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 3200);
    return () => clearInterval(t);
  }, [reduce, items.length]);
  return (
    <div className="pointer-events-none absolute left-2 right-2 top-1.5 overflow-hidden text-base leading-relaxed text-faint">
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="truncate"
        >
          {items[i]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
