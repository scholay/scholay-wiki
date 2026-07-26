import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2 } from 'lucide-react';

// pdfjs worker URL —— 跟 PdfViewer 一样的注入方式(Vite ?url 取生产稳定 URL,
// 避免 CDN 内外网部署差异)。如果项目里已经有别处初始化过这里再次赋值无副作用。
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;

/**
 * PDF 首页缩略图 —— PaperWorkbenchDialog 本地上传 tab State 1 左列预览用。
 *
 * 用 React.lazy 包装可以让 react-pdf + pdfjs 这坨大包(~800KB gzip)只在用户
 * 真的进入 State 1 时才加载,其他 tab(在线搜索/Zotero/EndNote)不受影响。
 *
 * pageIndex 默认 0(第一页)。父组件可以加 prev/next 按钮翻页。
 */
interface Props {
  file: File;
  pageIndex?: number;
  /** 渲染宽度(px),按真实页面比例自适应高度 */
  width?: number;
  onLoad?: (numPages: number) => void;
}

export default function PdfPageThumbnail({
  file,
  pageIndex = 0,
  width = 260,
  onLoad,
}: Props) {
  // file → object URL,卸载时 revoke 释放内存
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!src) return <Fallback />;

  return (
    <Document
      file={src}
      loading={<Fallback />}
      error={<ErrorFallback />}
      onLoadSuccess={(pdf) => onLoad?.(pdf.numPages)}
      className="flex flex-col items-center"
    >
      <Page
        pageNumber={pageIndex + 1}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={<Fallback />}
        className="border border-border rounded-sm overflow-hidden bg-surface-card"
      />
    </Document>
  );
}

function Fallback() {
  return (
    <div className="flex items-center justify-center w-full min-h-[320px] text-faint">
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}

function ErrorFallback() {
  return (
    <div className="flex items-center justify-center w-full min-h-[320px] text-xs text-faint">
      预览不可用
    </div>
  );
}
