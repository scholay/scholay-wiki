import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import DOMPurify from 'dompurify';

/**
 * Word(.docx)预览 —— mammoth 把 docx 转 HTML,DOMPurify 消毒后渲染。
 * mammoth 体积较大 → 动态 import,只在真预览 docx 时才加载。字节由父组件拉好传入。
 */
export function DocxPreview({ bytes }: { bytes: ArrayBuffer }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(false);
    (async () => {
      try {
        const mammoth = await import('mammoth');
        // mammoth 要独立的 ArrayBuffer 副本(避免被复用的 buffer 影响);slice 拷一份。
        const result = await mammoth.convertToHtml({ arrayBuffer: bytes.slice(0) });
        if (cancelled) return;
        setHtml(DOMPurify.sanitize(result.value));
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        无法解析 Word 文档
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        正在解析文档…
      </div>
    );
  }
  return (
    <div
      // docx 转出的 HTML 已 DOMPurify 消毒;space-y 给段落/标题基础行距(无 prose 插件)。
      // h-full overflow-auto:多页 Word 在父级 overflow-hidden 下需自带滚动容器(其余预览分支都有,docx 曾漏)。
      // 内嵌图 / 宽表加约束防窄屏横向溢出。
      className="h-full space-y-2.5 overflow-auto px-5 py-4 text-sm leading-paragraph text-foreground [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_img]:h-auto [&_img]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
