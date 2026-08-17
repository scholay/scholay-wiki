import { ArrowUp, Plus, Sparkles } from "lucide-react";
import { WikiEmbedBrandLogo } from "./WikiEmbedBrandLogo";
import type { CSSProperties } from "react";

const SMART_HERO_MOCK_THEME = {
  "--wiki-mock-space-2-5": "0.625rem",
} as CSSProperties;

/**
 * 智能搜论文空态入口 · 纯样式 fixture。
 * 对齐 SmartSearchHero + SmartComposer 的桌面空态；此 fixture 的历史 ID 虽含 claw，
 * 产品契约仍是智能搜论文，真正的 Claw 空态由 claw-empty-state 覆盖。
 */
export function WikiEmbedClawHeroEntry() {
  return (
    <div
      className="relative flex min-h-80 w-[min(100%,44rem)] items-center justify-center overflow-hidden rounded-16 bg-surface-card px-6 py-8"
      style={SMART_HERO_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="claw-hero-smart-entry"
    >
      <div className="absolute -left-28 -top-24 size-96 rounded-pill bg-brand-green/15 blur-3xl" />
      <div className="absolute -right-32 top-8 size-96 rounded-pill bg-brand-amber/15 blur-3xl" />
      <div className="absolute -bottom-32 left-1/4 size-80 rounded-pill bg-brand-green/10 blur-3xl" />

      <div className="relative z-raised flex w-full max-w-2xl flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-16 bg-brand-green/30 blur-xl" />
            <span className="relative flex size-14 items-center justify-center rounded-16 bg-surface-2">
              <Sparkles className="size-7 text-brand-green" strokeWidth={1.8} />
            </span>
          </div>
          <h2 className="flex flex-wrap items-center justify-center gap-x-2 font-serif text-24 font-medium text-foreground">
            <span>和</span>
            <WikiEmbedBrandLogo variant="wordmark" height={17} />
            <span>一起找论文</span>
          </h2>
        </div>

        <div className="flex w-full flex-col gap-2 rounded-16 border border-border-strong bg-surface-card p-[var(--wiki-mock-space-2-5)] shadow-raised">
          <div className="min-h-16 px-1 py-1 text-14 leading-paragraph text-faint">
            对比 Transformer 与 Mamba 的长序列建模
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-flex size-8 items-center justify-center rounded-8 text-muted-foreground">
              <Plus className="size-4" />
            </span>
            <span className="ml-auto rounded-8 px-2 py-1 text-12 text-subtle">
              GPT-5
            </span>
            <span className="inline-flex size-9 items-center justify-center rounded-8 bg-surface-2 text-faint">
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
