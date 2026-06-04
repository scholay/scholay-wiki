import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import type { InlineEditTarget } from './LatexEditor';

/** 选区快捷动作 —— 点一下即按预设指令提交(Cursor/Canvas 式 fast path)。 */
const QUICK_ACTIONS: { label: string; instruction: string }[] = [
  { label: '润色', instruction: '润色这段文字,让表达更顺畅、专业,但不改变原意' },
  { label: '精简', instruction: '在不丢失信息的前提下,把这段改写得更简洁' },
  { label: '扩写', instruction: '把这段适度扩写,补充必要的细节与过渡' },
  { label: '改公式', instruction: '检查并修正这段里的 LaTeX 公式与数学记号,使其规范、可编译' },
  { label: '更学术', instruction: '把这段改写成更严谨的学术书面语气' },
];

/**
 * 选区内联编辑浮层(Cmd+K)—— 锚定在选区下方,提供快捷动作 chips + 自由输入。
 * 提交走与对话相同的 SSE 编辑流(携带选区文本),结果以主编辑器内联 diff 呈现。
 */
export function PrismInlineEditPrompt({
  target,
  busy,
  onSubmit,
  onClose,
}: {
  target: InlineEditTarget;
  busy: boolean;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc 关闭 + 点浮层外关闭。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const submit = (instruction: string) => {
    const ins = instruction.trim();
    if (!ins || busy) return;
    onSubmit(ins);
  };

  // 定位:选区下方;贴右/底边时夹紧到视口内(coordsAtPos 返回视口坐标 → position:fixed)。
  const width = 380;
  const left = Math.max(8, Math.min(target.coords.left, window.innerWidth - width - 16));
  const top = Math.max(8, Math.min(target.coords.bottom + 6, window.innerHeight - 220));
  const charCount = [...target.text.replace(/\s+/g, ' ').trim()].length;

  return (
    <div
      ref={cardRef}
      style={{ position: 'fixed', left, top, width }}
      className="z-50 rounded-lg border border-border bg-popover p-2.5 shadow-xl"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-brand-green" />
        <span className="text-2xs font-bold text-foreground">就选中内容让 AI 修改</span>
        <span className="ml-auto text-2xs text-faint">已选 {charCount} 字</span>
        <button type="button" onClick={onClose} className="text-faint hover:text-foreground" aria-label="关闭">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={busy}
            onClick={() => submit(a.instruction)}
            className="rounded-pill border border-border-button px-2 py-0.5 text-2xs text-subtle transition-colors hover:border-brand-green hover:text-brand-green disabled:opacity-50"
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-1.5">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(text);
            }
          }}
          rows={2}
          placeholder="或描述你想怎么改…(Enter 提交)"
          className="max-h-24 min-h-[44px] flex-1 resize-none rounded-md border border-border-button bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <button
          type="button"
          disabled={!text.trim() || busy}
          onClick={() => submit(text)}
          className="mb-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background disabled:opacity-40"
          aria-label="提交"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
}
