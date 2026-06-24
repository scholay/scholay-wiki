import { useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * 安全渲染内联 SVG —— AI 回答里的 ```svg 代码块 + .svg 交付物预览共用。
 *
 * SVG 可内嵌 <script> / onload= / 外链 <use> 等 → 直接 innerHTML 注入是 XSS。
 * 用 DOMPurify 的 svg profile 清洗(去脚本/事件处理器/外部引用)后再注入,安全。
 * 多租户里图源来自 AI(及将来用户),必须清洗。
 */
/** 清洗内联 SVG → 安全可注入的 HTML 字符串(无 <svg> 返回 '')。供 SafeSvg / InlineSvg 复用。 */
export function sanitizeSvg(code: string): string {
  const src = (code ?? '').trim();
  if (!src.includes('<svg')) return '';
  return DOMPurify.sanitize(src, { USE_PROFILES: { svg: true, svgFilters: true } });
}

export function SafeSvg({ code, className }: { code: string; className?: string }) {
  const clean = useMemo(() => sanitizeSvg(code), [code]);

  if (!clean) return null;
  return (
    <div
      className={'[&>svg]:h-auto [&>svg]:max-w-full ' + (className ?? '')}
      // DOMPurify svg profile 已清洗,注入安全。
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
