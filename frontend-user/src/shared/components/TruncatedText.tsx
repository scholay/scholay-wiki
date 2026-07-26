import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/ui/hover-card';
import { cn } from '@/shared/lib/utils';

/**
 * 全局"截断 + 弹出查看全文"原语 —— 按 lines 自动选交互模式:
 *
 *   lines = 1(单行 truncate):**hover** 弹出(HoverCard)
 *     适合 venue / 名字 / 标签等短文本,hover 不打扰内联视觉
 *
 *   lines > 1(多行 line-clamp):末尾显式 **"更多"按钮**(点击打开)
 *     用 HoverCard 但 controlled open:click 才 open;鼠标离开行/弹层自动 close
 *     适合摘要等大段文本 —— 既不会鼠标路过乱弹,也不需要手动点关
 *
 * 两种模式都:
 *   - popover 内 `select-text` 可选中复制
 *   - Radix 自带 collision avoidance 防止飞出视窗
 *   - max-h 用 Radix `--radix-hover-card-content-available-height` 动态变量,
 *     上下空间不足时 popover 自动缩到当前可用高度内 + 滚动条,绝不溢出视窗
 *
 * 用法:
 *   <TruncatedText>单行长文本</TruncatedText>
 *   <TruncatedText lines={2}>多行摘要文本</TruncatedText>
 *   <TruncatedText popoverText="完整内容">显示别的</TruncatedText>
 */
export interface TruncatedTextProps {
  children: ReactNode;
  /** popover 内显示的内容;不传则使用 children */
  popoverText?: ReactNode;
  /** 截断行数 1-6,默认 1。多行模式才显示"更多"按钮 */
  lines?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  popoverClassName?: string;
  /** popover 出现方向(仅单行 hover 模式生效) */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /**
   * "更多" 按钮的额外 class —— 多行模式可用来做 hover-gated 显示。
   *   例:moreButtonClassName="opacity-0 group-hover/row:opacity-100 transition-opacity"
   *       父级有 `group/row` 时,按钮仅 row hover 才出。
   */
  moreButtonClassName?: string;
}

/** lines → 对应 Tailwind line-clamp 工具类。Tailwind 默认就到 6,无须扩展。 */
const LINE_CLAMP_CLASS: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
};

export function TruncatedText(props: TruncatedTextProps) {
  if ((props.lines ?? 1) === 1) {
    return <SingleLineHover {...props} />;
  }
  return <MultiLineMoreButton {...props} />;
}

// ===========================================================================
// 单行 — hover popover
// ===========================================================================

function SingleLineHover({
  children,
  popoverText,
  className,
  popoverClassName,
  side = 'bottom',
}: TruncatedTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowed, setOverflowed] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!el.isConnected) return;
      setOverflowed(el.scrollWidth > el.clientWidth + 1);
    };
    check();
    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [children]);

  const target = (
    <div ref={ref} className={cn('min-w-0 truncate', className)}>
      {children}
    </div>
  );

  if (!overflowed) return target;

  return (
    <HoverCard openDelay={120} closeDelay={150}>
      <HoverCardTrigger asChild>{target}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        collisionPadding={12}
        className={cn(
          'max-w-sm max-h-[var(--radix-hover-card-content-available-height)] overflow-y-auto px-3 py-2 text-xs leading-paragraph text-foreground whitespace-pre-wrap break-words select-text',
          popoverClassName
        )}
      >
        {popoverText ?? children}
      </HoverCardContent>
    </HoverCard>
  );
}

// ===========================================================================
// 多行 — line-clamp + "更多" click popover
// ===========================================================================

function MultiLineMoreButton({
  children,
  popoverText,
  lines = 2,
  className,
  popoverClassName,
  moreButtonClassName,
}: TruncatedTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowed, setOverflowed] = useState(false);
  /**
   * Controlled open —— click "更多" 才置 true,鼠标离开 trigger+content 时
   * HoverCard 通过 onOpenChange(false) 自动关。同时 ignore "true" 信号,
   * 防止 hover 进入按钮就误开。
   */
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!el.isConnected) return;
      setOverflowed(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [children, lines]);

  // lines = 1 不会走到这里,所以从映射表里安全取
  const clampClass = LINE_CLAMP_CLASS[(lines === 1 ? 2 : lines) as 2 | 3 | 4 | 5 | 6];

  return (
    // 相对定位包壳 —— 让"全部"按钮 absolute 到最后一行末尾,看起来跟着截断 …
    // 而不是占独立一行(以前是文本下方再起一行,视觉重量重)。
    // 文本本体加 pr-10 (~40px) 给按钮留位,防止覆盖最后一行的字。
    <div className="relative min-w-0">
      <div ref={ref} className={cn(clampClass, overflowed && 'pr-10', className)}>
        {children}
      </div>
      {overflowed && (
        <HoverCard
          open={open}
          // 只接受 close(hover 离开 trigger+content 时);ignore Radix 自己想 open
          // 的信号(防止 hover 进入按钮就误弹)
          onOpenChange={(next) => {
            if (!next) setOpen(false);
          }}
          closeDelay={120}
        >
          <HoverCardTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
              // absolute 贴右下角,文字"全部"接在截断 … 后面。
              // 加 pl-1 + bg-surface-card 防止与最后一行残留字符叠在一起,
              // 形成"…   全部"的视觉(中间用 padding 给一丝呼吸)。
              className={cn(
                'absolute right-0 bottom-0 pl-1 bg-surface-card text-xs text-brand-red hover:underline underline-offset-2 font-medium',
                moreButtonClassName
              )}
            >
              全部
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="bottom"
            align="end"
            sideOffset={4}
            collisionPadding={12}
            className={cn(
              'max-w-md max-h-[var(--radix-hover-card-content-available-height)] overflow-y-auto px-3 py-2 text-xs leading-paragraph text-foreground whitespace-pre-wrap break-words select-text',
              popoverClassName
            )}
          >
            {popoverText ?? children}
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
