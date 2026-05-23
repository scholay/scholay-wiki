import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  File as FileIcon,
  Loader2,
  Maximize2,
  Rows3,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// 把 pdfjs worker 文件经 Vite ?url 取到生产稳定 URL —— 这是 react-pdf v10 + pdfjs v5
// 推荐做法,避开 CDN(隔离 / 内网部署友好),也免去 `copy-pdf-worker` 这类 npm 脚本。
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;

// PDF 文本选区 / annotation 必需 css
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

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
 * 性能:
 *   - single 模式只渲染当前一页,大文件友好
 *   - continuous / two-up 一次性 mount 所有 Page —— 学术论文 < 30 页常态,
 *     真要支持百页 PDF 再上 @tanstack/react-virtual
 */

export type PdfSource =
  | string
  | Blob
  | ArrayBuffer
  | {
      url: string;
      httpHeaders?: Record<string, string>;
      withCredentials?: boolean;
    };

type PdfMode = 'single' | 'continuous' | 'two-up';

interface PdfViewerProps {
  file: PdfSource;
  className?: string;
  /** 初始页码(默认 1) */
  initialPage?: number;
  /** 初始模式(默认 single) */
  initialMode?: PdfMode;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;

export function PdfViewer({
  file,
  className,
  initialPage = 1,
  initialMode = 'single',
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  // null = fit-width 自适应;number = 手动缩放比
  const [scale, setScale] = useState<number | null>(null);
  const [mode, setMode] = useState<PdfMode>(initialMode);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Page 渲染参数:single 用 container width;continuous / two-up 同理但 two-up 需要折半
  const horizontalPadding = 32;
  const fitWidth = scale === null;
  const pageWidth = useMemo(() => {
    if (!fitWidth) return undefined;
    if (containerWidth <= 0) return undefined;
    if (mode === 'two-up') {
      // 两页 + 中间 12px gap
      return Math.max(Math.floor((containerWidth - horizontalPadding - 12) / 2), 200);
    }
    return Math.max(containerWidth - horizontalPadding, 200);
  }, [fitWidth, containerWidth, mode]);
  const pageScale = scale ?? undefined;

  // 把 union 拆成 react-pdf 的 file + options
  const { fileProp, options } = useMemo(() => {
    if (
      file &&
      typeof file === 'object' &&
      'url' in file &&
      typeof (file as { url?: unknown }).url === 'string'
    ) {
      const { url, httpHeaders, withCredentials } = file as {
        url: string;
        httpHeaders?: Record<string, string>;
        withCredentials?: boolean;
      };
      return {
        fileProp: { url },
        options: {
          ...(httpHeaders ? { httpHeaders } : {}),
          ...(withCredentials != null ? { withCredentials } : {}),
        },
      };
    }
    return { fileProp: file, options: undefined };
  }, [file]);

  // Multi-page 模式:页 → DOM wrapper 的 ref 表,用于 scrollIntoView + IntersectionObserver
  const pageWrapRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const registerPageWrap = useCallback((n: number) => (el: HTMLDivElement | null) => {
    if (el) pageWrapRefs.current.set(n, el);
    else pageWrapRefs.current.delete(n);
  }, []);

  // scrollToPage —— 显式滚到某页(只在"程序主动想滚"的场景调:翻页按钮 / 模式切换)。
  // 关键:**不要**把它放在 `safePage` 的 useEffect 里。否则 IntersectionObserver
  // 更新页号 → useEffect 触发 → scrollIntoView 把页强滚到顶 → 形成反馈环,
  // 体感"滚到下页时被卡一下拉回顶部"。
  const scrollToPage = useCallback((n: number) => {
    const el = pageWrapRefs.current.get(n);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // 模式切换(single → multi)时,把当前页带到视口顶 ——
  // requestAnimationFrame 等下一帧让多页 DOM mount 完
  useEffect(() => {
    if (mode === 'single') return;
    const id = requestAnimationFrame(() => scrollToPage(safePage));
    return () => cancelAnimationFrame(id);
    // 故意只看 mode + numPages,**不**响应 safePage 变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, numPages]);

  // 多页模式:IntersectionObserver 同步"用户滚到了第几页" → 只更新 page 状态(展示用),
  // 不触发任何滚动操作 —— 用户的物理滚动是权威。
  useEffect(() => {
    if (mode === 'single' || numPages === 0) return;
    const root = scrollContainerRef.current;
    if (!root) return;
    const visible = new Set<number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number(e.target.getAttribute('data-page-number'));
          if (!n) continue;
          if (e.isIntersecting) visible.add(n);
          else visible.delete(n);
        }
        if (visible.size === 0) return;
        const minVisible = Math.min(...visible);
        // 不重复 set 同值,避免无谓 rerender
        setPage((p) => (p === minVisible ? p : minVisible));
      },
      { root, threshold: 0.1 }
    );
    pageWrapRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [mode, numPages]);

  // 翻页按钮:更新状态 + 多页模式下显式滚到对应页
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

  return (
    <div className={cn('flex flex-col h-full min-h-0 bg-surface-2', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 h-12 px-4 bg-background border-b border-border-soft shrink-0">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={goPrev}
            disabled={safePage <= 1}
            className={iconBtnCls}
            aria-label="上一页"
            title="上一页"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="tabular-nums text-muted-foreground min-w-[5em] text-center">
            {numPages > 0 ? `${safePage} / ${numPages}` : '— / —'}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={numPages === 0 || safePage >= numPages}
            className={iconBtnCls}
            aria-label="下一页"
            title="下一页"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* 模式切换 */}
        <div className="inline-flex items-center gap-0.5 rounded-sm bg-surface-2 p-0.5">
          <ModeBtn active={mode === 'single'} onClick={() => setMode('single')} label="单页">
            <FileIcon className="size-3.5" />
          </ModeBtn>
          <ModeBtn active={mode === 'continuous'} onClick={() => setMode('continuous')} label="连续滚动">
            <Rows3 className="size-3.5" />
          </ModeBtn>
          <ModeBtn active={mode === 'two-up'} onClick={() => setMode('two-up')} label="双页并排">
            <Columns2 className="size-3.5" />
          </ModeBtn>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={zoomOut}
            disabled={(scale ?? 1) <= MIN_SCALE}
            className={iconBtnCls}
            aria-label="缩小"
            title="缩小"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="tabular-nums text-muted-foreground min-w-[3.5em] text-center">
            {scale === null ? '自适应' : `${Math.round(scale * 100)}%`}
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={(scale ?? 1) >= MAX_SCALE}
            className={iconBtnCls}
            aria-label="放大"
            title="放大"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={toFitWidth}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors',
              scale === null
                ? 'bg-surface-2 text-foreground'
                : 'text-subtle hover:bg-surface-2 hover:text-foreground'
            )}
            aria-label="自适应宽度"
            title="自适应宽度"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Document 区 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto flex justify-center"
      >
        {loadError ? (
          <ErrorBlock message={loadError} />
        ) : (
          <Document
            file={fileProp}
            options={options}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);
              setLoadError(null);
              // 重新 mount 多页模式时 pageWrap refs 失效,清一下重建
              pageWrapRefs.current.clear();
            }}
            onLoadError={(err) => {
              setLoadError(err?.message || 'PDF 加载失败');
            }}
            loading={<LoadingBlock />}
            error={null}
            noData={null}
            className="py-4 w-full"
          >
            {numPages > 0 && mode === 'single' && (
              <div className="flex justify-center">
                <Page
                  pageNumber={safePage}
                  width={pageWidth}
                  scale={pageScale}
                  renderAnnotationLayer={false}
                  renderTextLayer
                  loading={<LoadingBlock />}
                  error={<ErrorBlock message={`第 ${safePage} 页渲染失败`} />}
                  className="shadow-[0_2px_8px_rgba(15,23,42,0.10)] bg-background"
                />
              </div>
            )}

            {numPages > 0 && mode === 'continuous' && (
              <div className="flex flex-col items-center gap-3">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                  <div
                    key={n}
                    ref={registerPageWrap(n)}
                    data-page-number={n}
                  >
                    <Page
                      pageNumber={n}
                      width={pageWidth}
                      scale={pageScale}
                      renderAnnotationLayer={false}
                      renderTextLayer
                      loading={<LoadingBlock />}
                      error={<ErrorBlock message={`第 ${n} 页渲染失败`} />}
                      className="shadow-[0_2px_8px_rgba(15,23,42,0.10)] bg-background"
                    />
                  </div>
                ))}
              </div>
            )}

            {numPages > 0 && mode === 'two-up' && (
              <div className="flex flex-col items-center gap-3">
                {buildPairs(numPages).map((pair) => (
                  <div key={pair[0]} className="flex gap-3 items-start">
                    {pair.map((n, j) =>
                      n != null ? (
                        <div
                          key={n}
                          ref={registerPageWrap(n)}
                          data-page-number={n}
                        >
                          <Page
                            pageNumber={n}
                            width={pageWidth}
                            scale={pageScale}
                            renderAnnotationLayer={false}
                            renderTextLayer
                            loading={<LoadingBlock />}
                            error={<ErrorBlock message={`第 ${n} 页渲染失败`} />}
                            className="shadow-[0_2px_8px_rgba(15,23,42,0.10)] bg-background"
                          />
                        </div>
                      ) : (
                        // 末页对齐用的占位 —— 单数页时右侧留空
                        <div
                          key={`empty-${j}`}
                          style={{ width: pageWidth, minWidth: 200 }}
                        />
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </Document>
        )}
      </div>
    </div>
  );
}

// ─── 内部子组件 / 工具 ─────────────────────────────────────────────────────

const iconBtnCls =
  'inline-flex h-7 w-7 items-center justify-center rounded-sm text-subtle hover:bg-surface-2 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

function ModeBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex h-6 w-7 items-center justify-center rounded-sm transition-colors',
        active
          ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
          : 'text-subtle hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

// 把页号切成对开页对 —— [1,2], [3,4], [5,null], ...
// 不像电子书那样首页单独居中,直接 1-based 顺序对开,够日常 PDF 阅读用
function buildPairs(numPages: number): Array<[number, number | null]> {
  const pairs: Array<[number, number | null]> = [];
  for (let i = 1; i <= numPages; i += 2) {
    pairs.push([i, i + 1 <= numPages ? i + 1 : null]);
  }
  return pairs;
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">加载 PDF …</span>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="m-8 px-4 py-3 rounded-sm bg-danger-soft text-xs text-brand-red max-w-md">
      {message}
    </div>
  );
}
