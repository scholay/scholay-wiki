import { useSettled } from '@/shared/hooks/useSettled';
import { sanitizeSvg } from './SafeSvg';
import { ZoomableSvg } from './ZoomableSvg';
import { RenderLoader } from './RenderLoader';

/**
 * AI 回答里的 ```svg(或完整内联 <svg>)代码块 —— 渲染成矢量图(清洗后) + 可放大拖拽。
 * 流式期间(useSettled 未稳定)显示稳定 loader,不在「代码 ↔ 图」间抽搐;稳定后:
 * 合法 svg → ZoomableSvg;非法 → 回退原始代码。
 */
export function InlineSvg({ code }: { code: string }) {
  const { value: src, settled } = useSettled(code, 350);

  if (!settled) return <RenderLoader text="正在生成图形…" />;

  const clean = sanitizeSvg(src);
  if (!clean) {
    return (
      <pre className="mb-2.5 last:mb-0 overflow-x-auto rounded-md border border-border bg-surface-1 p-3 text-[12px] leading-paragraph">
        <code>{code}</code>
      </pre>
    );
  }
  return <ZoomableSvg svgHtml={clean} />;
}
