import { Sparkles, Quote } from 'lucide-react';
import type { InlineEditTarget } from './LatexEditor';

/**
 * 选区工具条 —— 在编辑器里选中一段文字后,于选区上方浮出「编辑此处 / 引用此处」(类 Notion/Cursor 选区菜单)。
 * - 编辑此处 = 走 Cmd+K 内联编辑(直接改这段)。
 * - 引用此处 = 把这段带进下方对话框作为引用,用户再写指令交给 AI 处理。
 * 用 fixed 定位到选区头坐标上方;onMouseDown preventDefault 避免点击时抢走编辑器焦点/清空选区。
 */
export function PrismSelectionToolbar({
  target,
  onEdit,
  onQuote,
}: {
  target: InlineEditTarget;
  onEdit: () => void;
  onQuote: () => void;
}) {
  const left = Math.max(8, Math.min(target.coords.left, window.innerWidth - 188));
  const top = Math.max(8, target.coords.top - 40); // 浮在选区上方,不挡下方文字

  return (
    <div
      style={{ position: 'fixed', left, top, zIndex: 40 }}
      onMouseDown={(e) => e.preventDefault()}
      className="flex items-center gap-0.5 rounded-12 border border-border bg-popover p-0.5 shadow-overlay"
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-1 rounded-8 px-2 py-1 text-12 text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Sparkles className="size-3 text-brand-green" /> 编辑此处
      </button>
      <span className="h-4 w-px bg-border" />
      <button
        type="button"
        onClick={onQuote}
        className="flex items-center gap-1 rounded-8 px-2 py-1 text-12 text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Quote className="size-3" /> 引用此处
      </button>
    </div>
  );
}
PrismSelectionToolbar.displayName = 'PrismSelectionToolbar';
