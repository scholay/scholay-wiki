import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { pdfjs } from 'react-pdf';
import { cn } from '@/shared/lib/utils';

// 把 pdfjs worker 文件经 Vite ?url 取到生产稳定 URL —— 这是 react-pdf v10 + pdfjs v5
// 推荐做法,避开 CDN(隔离 / 内网部署友好),也免去 `copy-pdf-worker` 这类 npm 脚本。
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;

// PDF 文本选区 / annotation 必需 css
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import {
  MAX_SCALE,
  MIN_SCALE,
  SCALE_STEP,
  computeFitWidth,
  resolvePdfSource,
  type PdfMode,
  type PdfSource,
} from './pdf-viewer/internals';
import { PdfViewerToolbar } from './pdf-viewer/PdfViewerToolbar';
import { PdfViewerContent } from './pdf-viewer/PdfViewerContent';
import { useMultiPageScroll } from './pdf-viewer/hooks/use-multi-page-scroll';

/**
 * 通用 PDF 预览组件 —— react-pdf v10 + pdfjs v5。
 *
 * 三种阅读模式(toolbar 切换):
 *   - single     当前页 / 总页数,< > 翻页(默认)
 *   - continuous 所有页竖向滚动,IntersectionObserver 同步当前页
 *   - two-up     双页并排(像书的对开),每行 2 页 + 滚动
 *
 * 鉴权场景:
 *   - 外部公开 OA URL → 直接传 string
 *   - 后端私有 PDF    → `{ url, httpHeaders }` 形态,内部拆给 react-pdf `options` prop
 *
 * 性能:single 只渲染当前一页;continuous / two-up 一次性 mount 所有 Page
 * (学术论文 < 30 页常态,百页 PDF 再上 @tanstack/react-virtual)。
 */

export type { PdfSource };

interface PdfViewerProps {
  file: PdfSource;
  className?: string;
  /** 初始页码(默认 1) */
  initialPage?: number;
  /** 初始模式(默认 single) */
  initialMode?: PdfMode;
}

export const PdfViewer = forwardRef<HTMLDivElement, PdfViewerProps>(function PdfViewer(
  { file, className, initialPage = 1, initialMode = 'single' },
  ref
) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  // null = fit-width 自适应;number = 手动缩放比
  const [scale, setScale] = useState<number | null>(null);
  const [mode, setMode] = useState<PdfMode>(initialMode);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 暴露根 div 给外部 ref
  const rootRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement);

  // 容器宽度跟踪 —— 给 fit-width 模式用
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // file 引用变化时复位(避免上一份 PDF 的 numPages 让翻页越界)
  useEffect(() => {
    setPage(initialPage);
    setNumPages(0);
    setLoadError(null);
  }, [file, initialPage]);

  const safePage = Math.min(Math.max(page, 1), Math.max(numPages, 1));
  const pageWidth = useMemo(
    () => computeFitWidth({ containerWidth, mode, scale }),
    [containerWidth, mode, scale]
  );
  const pageScale = scale ?? undefined;
  const { fileProp, options } = useMemo(() => resolvePdfSource(file), [file]);

  // 多页模式滚动同步:IO 更新页号 → 只 setPage,不再回滚(避免反馈环)
  const handleVisiblePageChange = useCallback((minVisible: number) => {
    setPage((p) => (p === minVisible ? p : minVisible));
  }, []);
  const { registerPageWrap, scrollToPage, resetRefs } = useMultiPageScroll({
    mode,
    numPages,
    scrollRoot: scrollContainerRef,
    onVisiblePageChange: handleVisiblePageChange,
  });

  // 模式切换(single → multi)时把当前页带到视口顶 ——
  // requestAnimationFrame 等下一帧让多页 DOM mount 完。
  // 故意只看 mode + numPages,**不**响应 safePage 变化(否则 IO ↔ scroll 形成反馈环,
  // 体感"滚到下页时被卡一下拉回顶部")。
  useEffect(() => {
    if (mode === 'single') return;
    const id = requestAnimationFrame(() => scrollToPage(safePage));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, numPages]);

  // 翻页 / 缩放 actions
  const goPrev = () => {
    const next = Math.max(1, page - 1);
    setPage(next);
    if (mode !== 'single') scrollToPage(next);
  };
  const goNext = () => {
    const next = Math.min(numPages || page, page + 1);
    setPage(next);
    if (mode !== 'single') scrollToPage(next);
  };
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, (s ?? 1) + SCALE_STEP));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, (s ?? 1) - SCALE_STEP));
  const toFitWidth = () => setScale(null);

  const handleLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      setLoadError(null);
      // 重新 mount 多页模式时 pageWrap refs 失效,清一下重建
      resetRefs();
    },
    [resetRefs]
  );
  const handleLoadError = useCallback((err: Error) => {
    setLoadError(err?.message || 'PDF 加载失败');
  }, []);

  return (
    <div ref={rootRef} className={cn('flex flex-col h-full min-h-0 bg-surface-2', className)}>
      <PdfViewerToolbar
        safePage={safePage}
        numPages={numPages}
        onPrev={goPrev}
        onNext={goNext}
        mode={mode}
        onModeChange={setMode}
        scale={scale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitWidth={toFitWidth}
      />

      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto flex justify-center"
      >
        {loadError ? (
          <div className="m-8 px-4 py-3 rounded-sm bg-danger-soft text-xs text-brand-red max-w-md">
            {loadError}
          </div>
        ) : (
          <PdfViewerContent
            fileProp={fileProp}
            options={options}
            numPages={numPages}
            safePage={safePage}
            mode={mode}
            pageWidth={pageWidth}
            pageScale={pageScale}
            registerPageWrap={registerPageWrap}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadError}
          />
        )}
      </div>
    </div>
  );
});
PdfViewer.displayName = 'PdfViewer';
