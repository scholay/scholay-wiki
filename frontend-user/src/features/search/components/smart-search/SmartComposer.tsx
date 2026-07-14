import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Composer } from '@/shared/components/chat';
import type { SmartSearchContextSnapshot } from '../../api/smart-search';

/**
 * 智能搜索输入框 —— 三 agent 统一 Composer(shared/components/chat)的智能搜索包装:
 * 保留本 feature 特有件:hero↔底部栏停靠动画的 layoutId 导出、轮播示例提问、重置会话按钮(左)。
 * 起始态 hero(prominent,rows=3 自动聚焦)与对话中底部栏共用同一组件,两处样式天然一致。
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
  /** hero 起始态尺寸:更大(rows=3)。 */
  prominent?: boolean;
  /** 挂载时自动聚焦 —— 空态 hero 需要,底部栏不需要(避免抢焦/滚动跳)。 */
  autoFocus?: boolean;
  /** 会话模型选择器插槽(P2 模型目录化,页面组装 shared ModelSelector 注入)。 */
  modelSlot?: ReactNode;
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
  modelSlot,
}: SmartComposerProps) {
  const rotating = !!rotatingPlaceholders && rotatingPlaceholders.length > 0;
  const hasUsage = !!contextSnapshot && contextSnapshot.maxTokens > 0;

  return (
    <Composer
      value={value}
      onChange={onChange}
      onSend={() => onSubmit()}
      placeholder={rotating ? '' : placeholder}
      placeholderOverlay={rotating ? <RotatingPlaceholder items={rotatingPlaceholders!} /> : undefined}
      sendReady={ready && !busy}
      busy={busy}
      stopping={stopping}
      onStop={onStop}
      requireAuth={loggedOut}
      onRequireAuth={onSubmit}
      context={
        hasUsage
          ? {
              totalTokens: contextSnapshot!.totalTokens,
              maxTokens: contextSnapshot!.maxTokens,
              percentage: contextSnapshot!.percentage,
              model: contextSnapshot!.model ?? '',
            }
          : null
      }
      minRows={prominent ? 3 : 1}
      autoFocus={autoFocus}
      leftActions={
        onResetClick || modelSlot ? (
          <>
            {modelSlot}
            {onResetClick && (
              <button
                type="button"
                onClick={onResetClick}
                disabled={resetDisabled}
                aria-label="重置当前会话"
                title={resetDisabled ? '当前不可重置' : '重置当前会话, 开始新的对话'}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {resetPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" strokeWidth={2} />}
              </button>
            )}
          </>
        ) : undefined
      }
    />
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
    <div className="pointer-events-none absolute left-1 right-1 top-1 overflow-hidden text-base leading-relaxed text-faint">
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
