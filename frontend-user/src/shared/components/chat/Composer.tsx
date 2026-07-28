import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from'react';
import { ArrowUp, Loader2, LogIn, Square } from'lucide-react';
import { cn } from'@/shared/lib/utils';
import { ContextMeter } from'./ContextMeter';

/**
 * 统一对话输入框核心(智能搜索 / 智能助手 / 智能写作三处共用;主流 Claude/GPT 形态)。
 * 只管业务无关的壳:圆角容器 + 柔和聚焦、自增高 textarea、Enter 发送(组字守卫)、
 * 底部工具栏(左插槽 | 水位 | 发送/停止/登录)、顶部 chips 插槽、拖拽蒙层插槽。
 * 附件上传 / 引用文献 / 快捷菜单等业务件由各 feature 包一层经插槽塞入(shared 不感知业务)。
 */

export interface ComposerContextInfo {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  model: string;
}

export interface ComposerHandle {
  /** 把文案填进输入框并聚焦(光标置末尾),不发送 —— 快捷按钮/示例提问用。 */
  prefill: (text: string) => void;
  focus: () => void;
}

export interface ComposerProps {
  /** 受控模式(智能搜索 hero↔底栏切换需父级持文本);不传则内部自管。 */
  value?: string;
  onChange?: (v: string) => void;
  /** 发送(core 已 trim;非受控模式发送后自动清空)。 */
  onSend: (text: string) => void;
  placeholder?: string;
  /** 覆盖在 textarea 上的自定义 placeholder 层(如轮播示例);存在且输入为空时原生 placeholder 置空。 */
  placeholderOverlay?: ReactNode;
  /** 输入框整体禁用(等待回答/连接中)。 */
  disabled?: boolean;
  /** 发送闸(默认 true):false 时发送键置灰但输入框可打字(如 WS 未就绪)。 */
  sendReady?: boolean;
  /** 空文本也允许发送(如已有附件)。 */
  canSendEmpty?: boolean;
  /** 生成中 → 发送键切停止键。 */
  busy?: boolean;
  stopping?: boolean;
  onStop?: () => void;
  /** 未登录:发送键换登录图标,点击走 onRequireAuth 而非 onSend(输入框保持可打字)。 */
  requireAuth?: boolean;
  onRequireAuth?: () => void;
  /** 上下文水位(footer 右侧,紧贴发送键;无数据不显示)。 */
  context?: ComposerContextInfo | null;
  /** 顶部 chips 区(附件预览/引用文献/引用选区)。 */
  topSlot?: ReactNode;
  /** 底部工具栏左侧(上传/引用文献/新对话/能力菜单等 feature 按钮)。「+」号一类留左边。 */
  leftActions?: ReactNode;
  /** 底部工具栏右侧(发送键左邻,右对齐组):模型选择器一类放这里 —— 与主流 AI 对话框一致。 */
  rightActions?: ReactNode;
  /** 拖拽蒙层等覆盖层(绝对定位,feature 自管显隐)。 */
  overlay?: ReactNode;
  /** 容器级事件(拖拽上传的 onDragEnter、onDrop 等)。 */
  containerProps?: HTMLAttributes<HTMLDivElement>;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  /** 空态初始行数(hero=3);内容超出后自动增高到 maxHeightPx。 */
  minRows?: number;
  maxHeightPx?: number;
  autoFocus?: boolean;
  className?: string;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    value,
    onChange,
    onSend,
    placeholder ='',
    placeholderOverlay,
    disabled = false,
    sendReady = true,
    canSendEmpty = false,
    busy = false,
    stopping = false,
    onStop,
    requireAuth = false,
    onRequireAuth,
    context,
    topSlot,
    leftActions,
    rightActions,
    overlay,
    containerProps,
    onPaste,
    minRows = 1,
    maxHeightPx = 160,
    autoFocus = false,
    className,
  },
  ref,
) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState('');
  const text = controlled ? value! : inner;
  const setText = (v: string) => {
    if (!controlled) setInner(v);
    onChange?.(v);
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自增高:单行起、随内容到上限。先归零再按 scrollHeight 收放(打字/prefill/清空都正确)。
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height ='auto';
    el.style.height =`${Math.min(el.scrollHeight, maxHeightPx)}px`;
  }, [maxHeightPx]);

  // 文本变化 → paint 前定高(useLayoutEffect 避免先高一帧再收的闪动)。
  useLayoutEffect(() => {
    resize();
  }, [text, resize]);

  // 挂载后再补量 + 只在**宽度**变化时重量。根因:hero→底栏首帧过渡里 composer 宽度尚未定(过窄),
  // 空输入框的 scrollHeight 会偏大 → 被 maxHeight 卡住把空框撑高;而原 effect 只在 text 变才跑,
  // 空文本永不重量 → 那条会话的输入框永久拉高。宽度稳定后重量即收回(治「第一个会话输入框被拉高」)。
  // 只认宽度、不认高度:避免「设高 → 高变 → 再触发」的观察回环。
  useEffect(() => {
    const el = textareaRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    // rAF 补一帧;再在 hero→底栏 framer 退场(~0.3s)结束后补一次 —— 那段过渡期布局未定,
    // 空框 scrollHeight 可能偏大被 maxHeight 卡住;退场落定后重量必收回正确行高。
    const raf = requestAnimationFrame(resize);
    const settle = setTimeout(resize, 400);
    let lastW = parent.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = parent.clientWidth;
      if (w !== lastW) {
        lastW = w;
        resize();
      }
    });
    ro.observe(parent);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      ro.disconnect();
    };
  }, [resize]);

  useImperativeHandle(
    ref,
    () => ({
      prefill: (t: string) => {
        setText(t);
        textareaRef.current?.focus();
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) el.setSelectionRange(el.value.length, el.value.length);
        });
      },
      focus: () => textareaRef.current?.focus(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controlled, onChange],
  );

  const submit = () => {
    if (busy) return;
    if (requireAuth) {
      onRequireAuth?.();
      return;
    }
    const t = text.trim();
    if ((!t && !canSendEmpty) || disabled || !sendReady) return;
    onSend(t);
    if (!controlled) setInner('');
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // CJK 组字中的回车是选词不是发送;Shift+Enter 换行。
    if (e.key ==='Enter'&& !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = requireAuth ? !!text.trim() || canSendEmpty : !disabled && sendReady && (!!text.trim() || canSendEmpty);

  return (
    <div
      {...containerProps}
      className={cn('relative flex flex-col gap-2 rounded-16 border border-border-strong bg-surface-card p-2.5 transition', 'focus-within:border-foreground/25 focus-within:ring-4 focus-within:ring-foreground/5',
        disabled && 'opacity-70',
        className,
        containerProps?.className,
      )}
    >
      {overlay}
      {topSlot}

      <div className="relative min-w-0">
        {placeholderOverlay && text.length === 0 && placeholderOverlay}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          onPaste={onPaste}
          placeholder={placeholderOverlay ? '' : placeholder}
          rows={minRows}
          disabled={disabled}
          autoFocus={autoFocus}
          // 「outline-none」:焦点可供性由外层输入框容器承担(上面的
          // `focus-within:border-foreground/25 focus-within:ring-4 focus-within:ring-foreground/5`),
          // 整框变深 + 起环,比在 textarea 内部再画一圈更贴设计。
          className="block w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-14 leading-paragraph text-foreground outline-none placeholder:text-faint disabled:cursor-not-allowed disabled:opacity-60"/>
      </div>

      {/* 底部工具栏:左 feature 按钮(+号等)| 撑开 | 右侧控件(模型选择器)| 水位 | 发送/停止/登录 */}
      <div className="flex items-center gap-1">
        {leftActions}
        <span className="flex-1"/>
        {rightActions}
        {context && context.totalTokens > 0 && (
          <ContextMeter
            totalTokens={context.totalTokens}
            maxTokens={context.maxTokens}
            percentage={context.percentage}
            model={context.model}
            className="mr-1"/>
        )}
        {busy && !requireAuth ? (
          <button
            type="button" onClick={onStop}
            disabled={stopping || !onStop}
            aria-label={stopping ? '正在停止' : '停止生成'}
            title={stopping ? '正在停止…' : '停止当前回答'}
            className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-8 text-on-dark transition-colors',
              stopping ? 'cursor-wait bg-foreground/60' : 'bg-foreground hover:bg-foreground/85',
            )}
          >
            {stopping ? (
              <Loader2 className="size-4 animate-spin"/>
            ) : (
              <Square className="size-3 fill-current" strokeWidth={0} aria-hidden="true"/>
            )}
          </button>
        ) : (
          <button
            type="button" onClick={submit}
            disabled={!canSend}
            aria-label={requireAuth ? '登录后开始' : '发送 (Enter)'}
            title={requireAuth ? '登录后开始' : '发送 (Enter)'}
            className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-8 transition-colors',
              canSend ? 'bg-foreground text-on-dark hover:bg-foreground/90' : 'bg-surface-2 text-faint',
              !canSend && 'cursor-not-allowed',
            )}
          >
            {requireAuth ? <LogIn className="size-4" strokeWidth={2.2} /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
          </button>
        )}
      </div>
    </div>
  );
});
Composer.displayName ='Composer';
