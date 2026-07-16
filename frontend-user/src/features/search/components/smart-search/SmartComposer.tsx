import { useEffect, useState, type ClipboardEvent, type HTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Composer } from '@/shared/components/chat';
import type { SmartSearchContextSnapshot } from '../../api/smart-search';

/**
 * 智能搜索输入框 —— 三 agent 统一 Composer(shared/components/chat)的智能搜索包装:
 * 保留本 feature 特有件:hero↔底部栏停靠动画的 layoutId 导出、轮播示例提问。
 * 起始态 hero(prominent,rows=3 自动聚焦)与对话中底部栏共用同一组件,两处样式天然一致。
 * (多会话改造后,「重置会话」已由顶部「新对话」按钮取代,本组件不再有 reset 入口。)
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
  /** hero 起始态尺寸:更大(rows=3)。 */
  prominent?: boolean;
  /** 挂载时自动聚焦 —— 空态 hero 需要,底部栏不需要(避免抢焦/滚动跳)。 */
  autoFocus?: boolean;
  /** 会话模型选择器插槽(P2 模型目录化,页面组装 shared ModelSelector 注入)。 */
  modelSlot?: ReactNode;
  // ── 附件/引用装配插槽(2026-07 输入框统一;页面组装 shared 件注入,本组件不感知业务)──
  /** 「+」号菜单(leftActions 最左,Cursor/GPT 同位)。 */
  plusSlot?: ReactNode;
  /** chips 区(附件预览行 + 引用文献行),渲染在 textarea 上方。 */
  topExtras?: ReactNode;
  /** 有附件/引用时允许空文本发送。 */
  canSendEmpty?: boolean;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  /** 拖拽事件挂容器(dragenter/over/leave/drop)。 */
  containerProps?: HTMLAttributes<HTMLDivElement>;
  /** 拖拽蒙层等覆盖层。 */
  overlay?: ReactNode;
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
  prominent = false,
  autoFocus = false,
  modelSlot,
  plusSlot,
  topExtras,
  canSendEmpty = false,
  onPaste,
  containerProps,
  overlay,
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
      canSendEmpty={canSendEmpty}
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
      onPaste={onPaste}
      containerProps={containerProps}
      overlay={overlay}
      topSlot={topExtras}
      leftActions={plusSlot}
      rightActions={modelSlot}
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
