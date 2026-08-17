import { ArrowUp } from "lucide-react";
import { WikiEmbedBrandLogo } from "./WikiEmbedBrandLogo";
import { RhinoBrandIcon } from "@/shared/components/RhinoBrandIcon";
import { MockModeToggle } from "./fixtures/mock-chrome";

/**
 * 智能搜论文空会话入口 · 纯样式 fixture。
 * 对齐 SmartSearchHero + Composer compact 的同一居中状态。
 */
export function WikiEmbedSmartSearchDock() {
  return (
    <div
      className="relative flex min-h-[24rem] w-[min(100%,42rem)] items-center justify-center overflow-hidden bg-background px-6 py-8"
      aria-hidden
      data-wiki-fixture="smart-search-dock"
    >
      <div className="pointer-events-none absolute -left-28 -top-24 size-[36rem] rounded-pill bg-brand-green/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-8 size-[38rem] rounded-pill bg-brand-amber/10 blur-3xl" />
      <div className="relative z-raised flex w-full max-w-[40rem] flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-16 bg-brand-green/30 blur-xl" />
            <div className="relative flex size-14 items-center justify-center rounded-16 bg-surface-2">
              <RhinoBrandIcon
                className="size-7 text-brand-green"
                strokeWidth={1.8}
              />
            </div>
          </div>
          <h2 className="flex items-center justify-center gap-2 font-serif text-24 font-medium text-foreground">
            <span>和</span>
            <WikiEmbedBrandLogo variant="wordmark" height={17} />
            <span>一起找论文</span>
          </h2>
        </div>
        <div className="relative flex w-full flex-col overflow-hidden rounded-16 border border-border-strong bg-surface-card shadow-raised">
          <div className="flex h-12 items-center gap-3 pl-5 pr-2">
            <MockModeToggle label="智能搜论文" tone="smart" />
            <div className="relative min-w-0 flex-1">
              <span className="block truncate text-16 text-faint">
                帮我找 3 篇大语言模型可解释性的代表论文
              </span>
            </div>
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-faint">
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
