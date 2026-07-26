import { Loader2 } from 'lucide-react';

/** 流式渲染稳定占位 —— mermaid / SVG / HTML 输出期间显示,避免「代码 ↔ 渲染」反复横跳。 */
export function RenderLoader({ text }: { text: string }) {
  return (
    <div className="mb-2.5 last:mb-0 flex min-h-[96px] items-center justify-center gap-2 rounded-12 border border-border bg-surface-1 text-12 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {text}
    </div>
  );
}
