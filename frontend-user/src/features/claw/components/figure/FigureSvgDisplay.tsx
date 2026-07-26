/**
 * FigureSvgDisplay —— 科研绘图的**图片展示区域**:把一份 SVG 字符串渲染成图 + 提供 SVG/PNG 下载。
 *
 * 单一真源的「出图 UI」:被会话内联出图(chat/TurnFigures)与右侧预览面板(figure/FigureView)共用。
 * SVG 经 SafeSvg(DOMPurify)清洗后内联(科研 SVG 不当光栅图,保矢量与可搜索文字);PNG 走浏览器
 * canvas 栅格化(2x)。图按容器宽度自适应,不裁切。
 */
import { SafeSvg } from '@/shared/components/chat/SafeSvg';
import { Download } from 'lucide-react';
import { downloadText, downloadUrl } from './export';

export function FigureSvgDisplay({
  svg,
  name,
  className,
}: {
  /** composeFigure 产出、或 agent 直接产出的 SVG 字符串(未清洗;这里经 SafeSvg 清洗内联)。 */
  svg: string;
  /** 下载文件名(不含扩展名)。 */
  name: string;
  className?: string;
}) {
  const exportSvg = () => downloadText(svg, `${name}.svg`);
  const exportPng = async () => {
    try {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = (img.naturalWidth || 1040) * scale;
      canvas.height = (img.naturalHeight || 800) * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        downloadUrl(canvas.toDataURL('image/png'), `${name}.png`);
      }
      URL.revokeObjectURL(url);
    } catch {
      /* PNG 栅格化失败时静默(SVG 下载仍可用) */
    }
  };

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={exportSvg}
          className="inline-flex items-center gap-1 rounded-8 border border-border bg-surface-card px-2 py-1 text-2xs text-subtle hover:bg-surface-2"
        >
          <Download className="h-3 w-3" /> SVG
        </button>
        <button
          type="button"
          onClick={exportPng}
          className="inline-flex items-center gap-1 rounded-8 border border-border bg-surface-card px-2 py-1 text-2xs text-subtle hover:bg-surface-2"
        >
          <Download className="h-3 w-3" /> PNG
        </button>
      </div>
      <div className="overflow-auto rounded-12 border border-border bg-surface-card p-3">
        <SafeSvg code={svg} className="mx-auto w-full [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full" />
      </div>
    </div>
  );
}
