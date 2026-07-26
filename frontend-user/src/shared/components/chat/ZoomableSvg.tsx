import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Loader2, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

/**
 * 可放大查看的矢量图块(mermaid 渲染结果 / 内联 SVG 共用)——
 *   - 行内:带描边容器 + hover 右上角「放大」按钮
 *   - 点击放大:全屏 Dialog,**可拖拽平移 + 滚轮/按钮缩放 + 双击复位**
 *
 * pan/zoom 用成熟库 react-zoom-pan-pinch(项目「第三方优先」),**动态 import**:
 * 只在用户点放大时才加载,不进聊天主包(库 + 弹窗逻辑都在 lazy chunk)。
 */

const PanZoomView = lazy(async () => {
  const { TransformWrapper, TransformComponent } = await import('react-zoom-pan-pinch');
  function View({ svgHtml }: { svgHtml: string }) {
    return (
      <TransformWrapper
        minScale={0.3}
        maxScale={12}
        centerOnInit
        doubleClick={{ mode: 'reset' }}
        wheel={{ step: 0.12 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%', cursor: 'grab' }}
              contentStyle={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
            >
              {/* 放大视图里去掉行内的尺寸约束,让图按缩放自由放大 */}
              <div
                className="[&_svg]:h-auto [&_svg]:max-h-none [&_svg]:max-w-none"
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            </TransformComponent>
            <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-pill border border-border bg-background/95 p-1 shadow-overlay backdrop-blur-sm">
              <CtrlBtn label="缩小" onClick={() => zoomOut()}>
                <Minus className="size-4" />
              </CtrlBtn>
              <CtrlBtn label="复位" onClick={() => resetTransform()}>
                <RotateCcw className="size-3.5" />
              </CtrlBtn>
              <CtrlBtn label="放大" onClick={() => zoomIn()}>
                <Plus className="size-4" />
              </CtrlBtn>
            </div>
          </>
        )}
      </TransformWrapper>
    );
  }
  return { default: View };
});

function CtrlBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function ZoomableSvg({ svgHtml, className }: { svgHtml: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={
        'group relative mb-2.5 last:mb-0 overflow-x-auto rounded-md border border-border bg-background p-3 ' +
        (className ?? '')
      }
    >
      {/* 图块本体即全屏入口:触屏(小程序 web-view / 手机浏览器)没有 hover,
          仅靠 hover 显形的「放大」按钮永远不可达 —— 点图直接开全屏是唯一可靠路径。 */}
      <div
        role="button"
        tabIndex={0}
        aria-label="放大查看图表"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen(true);
        }}
        className="cursor-zoom-in [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="放大查看"
        title="放大查看"
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border border-border bg-background/90 px-1.5 py-0.5 text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <Maximize2 className="size-3" /> 放大
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* 全屏灯箱:视口尺寸用 arbitrary value(无对应 token,lightbox 本就按视口比例) */}
        <DialogContent
          dismissable
          className="h-[90vh] w-[95vw] max-w-[95vw] gap-0 overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">图表放大查看</DialogTitle>
          <div className="relative h-full w-full bg-surface-1">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              }
            >
              {open && <PanZoomView svgHtml={svgHtml} />}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
