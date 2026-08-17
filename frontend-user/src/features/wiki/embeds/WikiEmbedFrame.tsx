import type { ReactNode } from "react";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import type { WikiEmbedThemePolicy } from "../types";
import { WikiFigure } from "../components/WikiMedia";

interface WikiEmbedFrameProps {
  /** 图注；缺省用注册表默认文案。 */
  caption: string;
  children: ReactNode;
  className?: string;
  /** 缺省跟随 Wiki 主题；仅必须完整保留浅色 palette 的内容使用 light-only。 */
  themePolicy?: WikiEmbedThemePolicy;
}

/**
 * 词条内嵌演示壳：井口图注在凹进衬底之下，井内只承载静态产品截面。
 * 尺寸随 fixture 自然宽高，max-w-full 与横向滚动共同兜住窄屏。
 */
export function WikiEmbedFrame({
  caption,
  children,
  className,
  themePolicy = "follow-wiki",
}: WikiEmbedFrameProps) {
  return (
    <WikiFigure caption={caption} className={className}>
      <div className="wiki-embed-stage w-fit max-w-full rounded-16 p-3 md:p-4">
        <div
          className="wiki-embed-canvas w-fit max-w-full overflow-x-auto rounded-12 p-1"
          data-wiki-embed-theme={themePolicy}
        >
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
    </WikiFigure>
  );
}
