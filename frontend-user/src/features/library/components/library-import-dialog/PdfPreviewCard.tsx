import { lazy, Suspense, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import { formatSize } from '../../api/pdf';
import type { ParsedEvent } from '../../api/upload-resolve';

/**
 * 上传 PDF 期间左列的预览卡片 —— State 1(检索中)+ State 2(决策中)共用。
 *
 * 内含:
 *   - 文件名行(PDF tag + 文件名 + 大小 · 页数)
 *   - 翻页栏(N > 1 时显示)
 *   - 首页缩略图(react-pdf,lazy import)
 *   - 解析到标题/作者后,卡片底部展示一条
 *
 * react-pdf 用 React.lazy 包,只在卡片真的挂载时拉 chunk(~800KB gzip),
 * 不影响其他 tab(在线搜索/Zotero/EndNote)。
 */

const PdfPageThumbnail = lazy(() => import('./PdfPageThumbnail'));

interface PdfPreviewCardProps {
  file: File;
  /** 解析到的元数据(标题 / 作者 / 期刊 / 年份),卡片底部展示一条 */
  parsed?: ParsedEvent | null;
}

export function PdfPreviewCard({ file, parsed }: PdfPreviewCardProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [numPages, setNumPages] = useState<number | null>(null);

  return (
    <div className="flex flex-col rounded-12 border border-border bg-surface-card overflow-hidden">
      {/* 文件名行 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border-soft">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-4 bg-danger-soft text-brand-red text-[9px] font-bold leading-none">
            PDF
          </span>
          <div className="min-w-0">
            <div
              className="truncate text-xs font-semibold text-foreground"
              title={file.name}
            >
              {file.name}
            </div>
            <div className="text-2xs text-faint tabular-nums">
              {formatSize(file.size)}
              {numPages != null && ` · ${numPages} 页`}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="更多"
          className="inline-flex size-6 items-center justify-center rounded-8 text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </div>

      {/* 翻页栏 */}
      {numPages != null && numPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-3 py-1.5 border-b border-border-soft bg-surface-1">
          <button
            type="button"
            aria-label="上一页"
            disabled={pageIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            className="inline-flex size-6 items-center justify-center rounded-8 text-faint hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="text-2xs text-muted-foreground tabular-nums">
            {pageIndex + 1} / {numPages}
          </span>
          <button
            type="button"
            aria-label="下一页"
            disabled={pageIndex >= numPages - 1}
            onClick={() => setPageIndex((i) => Math.min(numPages - 1, i + 1))}
            className="inline-flex size-6 items-center justify-center rounded-8 text-faint hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}

      {/* 缩略图 */}
      <div className="flex-1 min-h-[320px] flex items-start justify-center p-3 bg-surface-1/40">
        <Suspense fallback={<ThumbnailFallback />}>
          <PdfPageThumbnail
            file={file}
            pageIndex={pageIndex}
            width={260}
            onLoad={setNumPages}
          />
        </Suspense>
      </div>

      {/* parsed 元数据(标题 + 作者)—— 解析完成后才显示,辅助识别 */}
      {parsed?.title && (
        <div className="px-3 py-2 border-t border-border-soft bg-surface-card">
          <div
            className="line-clamp-2 text-xs font-semibold text-foreground"
            title={parsed.title}
          >
            {parsed.title}
          </div>
          {parsed.authors && parsed.authors.length > 0 && (
            <div className="mt-0.5 text-2xs text-muted-foreground line-clamp-1">
              {parsed.authors.slice(0, 3).join(', ')}
              {parsed.authors.length > 3 && ' et al.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThumbnailFallback() {
  return (
    <div className="flex items-center justify-center w-full min-h-[320px] text-faint">
      <div className="flex flex-col items-center gap-2">
        <FileText className="size-6" strokeWidth={1.5} />
        <span className="text-2xs">加载预览…</span>
      </div>
    </div>
  );
}

