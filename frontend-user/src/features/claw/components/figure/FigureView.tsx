/**
 * FigureView —— 把细胞图配方(FigureSpec)渲染成**静态 SVG 图**(非画布)。
 * compose.ts 异步排版(elkjs 子布局)→ FigureSvgDisplay(SafeSvg 清洗 + SVG/PNG 下载)。
 * 用于右侧交付物预览面板对 *.fig.json 的兜底渲染(sci_draw 的图现在走会话内联出图,见 chat/TurnFigures)。
 */
import { useEffect, useState } from 'react';
import { composeFigure } from './compose';
import { FigureSvgDisplay } from './FigureSvgDisplay';
import type { FigureSpec } from './figure-spec';

export function FigureView({ spec }: { spec: FigureSpec }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSvg(null);
    composeFigure(spec)
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [spec]);

  if (svg === null) {
    return <div className="flex h-full w-full items-center justify-center text-2xs text-muted-foreground">渲染中…</div>;
  }
  if (!svg) {
    return <div className="flex h-full w-full items-center justify-center text-2xs text-muted-foreground">这张图暂时无法渲染</div>;
  }

  return (
    <div className="h-full w-full overflow-auto bg-surface-2 p-4">
      <FigureSvgDisplay svg={svg} name={spec.title || 'figure'} />
    </div>
  );
}
