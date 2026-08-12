import type { ReactNode } from "react";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";

interface WikiEmbedFrameProps {
  /** 同时作为可见说明与无障碍名称，明确演示态边界。 */
  caption: string;
  children: ReactNode;
}

/**
 * 词条内嵌演示壳：平面文档框承载静态产品截面，并公开标明它是界面示意。
 */
export function WikiEmbedFrame({ caption, children }: WikiEmbedFrameProps) {
  return (
    <figure className="wiki-embed-stage w-full max-w-full rounded-12 border border-border p-3 md:p-4">
      <figcaption className="mb-3 flex flex-wrap items-center gap-2 text-12 leading-paragraph">
        <span className="rounded-4 bg-surface-2 px-2 py-1 font-medium text-subtle">
          界面示意
        </span>
        <span className="text-muted-foreground">{caption}</span>
      </figcaption>
      <div className="wiki-embed-canvas w-full max-w-full overflow-x-auto rounded-8">
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
    </figure>
  );
}
