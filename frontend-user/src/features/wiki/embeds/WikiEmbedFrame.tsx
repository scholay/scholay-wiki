import type { ReactNode } from "react";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";

interface WikiEmbedFrameProps {
  /** 可见图注同时为 figure 提供无障碍名称，明确演示态边界。 */
  caption: string;
  children: ReactNode;
}

/**
 * 词条内嵌演示壳：井口说明留在凹进衬底之外，井内只承载静态产品截面。
 * 尺寸随 fixture 自然宽高，max-w-full 与横向滚动共同兜住窄屏。
 */
export function WikiEmbedFrame({ caption, children }: WikiEmbedFrameProps) {
  return (
    <figure className="mt-6 w-fit max-w-full scroll-mt-20">
      <figcaption className="mb-2 flex max-w-full flex-wrap items-center gap-2 px-1 text-12 leading-paragraph">
        <span className="font-medium text-subtle">界面示意</span>
        <span className="text-muted-foreground">{caption}</span>
      </figcaption>
      <div className="wiki-embed-stage w-fit max-w-full rounded-16 p-3 md:p-4">
        <div className="wiki-embed-canvas w-fit max-w-full overflow-x-auto rounded-12 p-1">
          <ErrorBoundary
            fallback={(_error, reset) => (
              <div className="rounded-8 border border-dashed border-border bg-surface-card px-4 py-6 text-center">
                <p className="text-12 font-medium text-foreground">
                  演示组件暂时无法显示
                </p>
                <p className="mt-1 text-12 text-muted-foreground">
                  不影响词条正文阅读。可重试加载。
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-3 inline-flex h-8 items-center rounded-8 border border-border bg-surface-card px-3 text-12 font-medium text-foreground hover:border-border-strong"
                >
                  重试
                </button>
              </div>
            )}
          >
            {children}
          </ErrorBoundary>
        </div>
      </div>
    </figure>
  );
}
