import { useEffect, useState, type ClipboardEvent, type HTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Composer } from '@/shared/components/chat';
import { SmartSearchToggle } from '@/shared/components/SmartSearchToggle';
import type { SearchMode } from '../../search-mode';

/**
 * 智能搜索输入框 —— 与首页 SearchAutocomplete smart 态同壳(h-12 + 内嵌开关)。
 * hero / 底栏共用;附件 chips 有则叠在单行栏上方。
 */

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
  /** @deprecated 搜索器已统一单行壳,保留以免旧调用报错。 */
  prominent?: boolean;
  /** 挂载时自动聚焦 —— 空态 hero 需要,底部栏不需要(避免抢焦/滚动跳)。 */
  autoFocus?: boolean;
  /** 会话模型选择器插槽(P2 模型目录化,页面组装 shared ModelSelector 注入)。 */
  modelSlot?: ReactNode;
  // ── 附件/引用装配插槽(2026-07 输入框统一;页面组装 shared 件注入,本组件不感知业务)──
  /** 「+」号菜单(输入框右侧,发送键左侧)。 */
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
  /** 传给 Composer 容器的额外 class。 */
  className?: string;
  /** 内嵌智能搜索开关;与首页 SearchAutocomplete 一致。 */
  mode?: SearchMode;
  onModeChange?: (mode: SearchMode) => void;
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
  autoFocus = false,
  modelSlot,
  plusSlot,
  topExtras,
  canSendEmpty = false,
  onPaste,
  containerProps,
  overlay,
  className,
  mode,
  onModeChange,
}: SmartComposerProps) {
  const rotating = !!rotatingPlaceholders && rotatingPlaceholders.length > 0;

  return (
    <Composer
      compact
      value={value}
      onChange={onChange}
      onSend={() => onSubmit()}
      placeholder={rotating ? '' : placeholder}
      placeholderOverlay={
        rotating ? <RotatingPlaceholder items={rotatingPlaceholders!} /> : undefined
      }
      sendReady={ready && !busy}
      canSendEmpty={canSendEmpty}
      busy={busy}
      stopping={stopping}
      onStop={onStop}
      requireAuth={loggedOut}
      onRequireAuth={onSubmit}
      autoFocus={autoFocus}
      onPaste={onPaste}
      containerProps={containerProps}
      overlay={overlay}
      topSlot={topExtras}
      leftActions={
        mode != null && onModeChange ? (
          <SmartSearchToggle
            checked={mode === 'smart'}
            onCheckedChange={(on) => onModeChange(on ? 'smart' : 'classic')}
          />
        ) : null
      }
      inputTrailing={plusSlot}
      rightActions={modelSlot}
      className={className}
    />
  );
}

/** 输入框内轮播提示 —— 与首页 compact 占位垂直居中对齐。 */
function RotatingPlaceholder({ items }: { items: string[] }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 3200);
    return () => clearInterval(t);
  }, [reduce, items.length]);
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden text-base leading-normal text-faint">
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
