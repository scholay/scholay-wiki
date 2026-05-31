import { Document, Page } from 'react-pdf';
import {
  ErrorBlock,
  LoadingBlock,
  type PdfMode,
  buildPairs,
} from './internals';

interface PdfViewerContentProps {
  // react-pdf <Document/> 入参(已被 PdfViewer 主组件拆好)
  fileProp: unknown;
  options: object | undefined;
  // 状态
  numPages: number;
  safePage: number;
  mode: PdfMode;
  // 渲染参数
  pageWidth: number | undefined;
  pageScale: number | undefined;
  // 多页模式 — 给每页 wrapper 注册 ref(IntersectionObserver / scrollIntoView 用)
  registerPageWrap: (n: number) => (el: HTMLDivElement | null) => void;
  // Document 事件
  onLoadSuccess: (info: { numPages: number }) => void;
  onLoadError: (err: Error) => void;
}

const pageCommonClass = 'shadow-[0_2px_8px_rgba(15,23,42,0.10)] bg-background';

/**
 * Document + Page 渲染区。
 * 三种模式的 layout 都封装在这里;翻页 / 缩放 / 模式切换都由父级控制。
 */
export function PdfViewerContent({
  fileProp,
  options,
  numPages,
  safePage,
  mode,
  pageWidth,
  pageScale,
  registerPageWrap,
  onLoadSuccess,
  onLoadError,
}: PdfViewerContentProps) {
  return (
    <Document
      // react-pdf 的 file prop union 类型在我们包装后等价兼容,这里 cast 一下避免噪声
      file={fileProp as never}
      options={options}
      onLoadSuccess={onLoadSuccess}
      onLoadError={onLoadError}
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
            className={pageCommonClass}
          />
        </div>
      )}

      {numPages > 0 && mode === 'continuous' && (
        <div className="flex flex-col items-center gap-3">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <div key={n} ref={registerPageWrap(n)} data-page-number={n}>
              <Page
                pageNumber={n}
                width={pageWidth}
                scale={pageScale}
                renderAnnotationLayer={false}
                renderTextLayer
                loading={<LoadingBlock />}
                error={<ErrorBlock message={`第 ${n} 页渲染失败`} />}
                className={pageCommonClass}
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
                  <div key={n} ref={registerPageWrap(n)} data-page-number={n}>
                    <Page
                      pageNumber={n}
                      width={pageWidth}
                      scale={pageScale}
                      renderAnnotationLayer={false}
                      renderTextLayer
                      loading={<LoadingBlock />}
                      error={<ErrorBlock message={`第 ${n} 页渲染失败`} />}
                      className={pageCommonClass}
                    />
                  </div>
                ) : (
                  // 末页对齐用的占位 —— 单数页时右侧留空
                  <div key={`empty-${j}`} style={{ width: pageWidth, minWidth: 200 }} />
                )
              )}
            </div>
          ))}
        </div>
      )}
    </Document>
  );
}
PdfViewerContent.displayName = 'PdfViewerContent';
