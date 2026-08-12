import { Hourglass, Search, Square, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";

const RUN_STATES_MOCK_THEME = {
  "--wiki-mock-space-2-5": "0.625rem",
} as CSSProperties;

/**
 * Claw 长任务停滞提示 · 纯样式 fixture。
 * 冻结 ConversationWorkspace 中 stalled && busy 的单一页面状态：任务仍在运行，
 * 用户可停止本轮或继续等待；不再把完成、断线和多窗口接管拼成状态图例。
 */
export function WikiEmbedClawRunStates() {
  return (
    <div
      className="w-[min(100%,46rem)] overflow-hidden rounded-16 border border-border bg-surface-card"
      style={RUN_STATES_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="claw-run-states"
    >
      <header className="flex h-14 items-center gap-2 border-b border-border px-6">
        <span className="inline-flex size-7 items-center justify-center rounded-8 bg-foreground text-on-dark">
          <Sparkles className="size-3.5" />
        </span>
        <p className="font-serif text-16 font-medium text-foreground">
          智能助手 · Claw
        </p>
      </header>

      <div className="border-b border-border px-6 py-2">
        <div className="flex items-start gap-2 rounded-12 border border-brand-amber/30 bg-warning-soft px-3 py-[var(--wiki-mock-space-2-5)] text-12">
          <Hourglass className="mt-1 size-3.5 shrink-0 text-brand-amber" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              这一轮已较长时间没有新进展
            </p>
            <p className="leading-paragraph text-muted-foreground">
              复杂任务可能仍在执行；如不想继续等待，可停止本轮后重新发送。
            </p>
            <div className="mt-2 flex gap-2">
              <span className="inline-flex h-7 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-foreground">
                停止本轮
              </span>
              <span className="inline-flex h-7 items-center rounded-8 px-3 text-12 text-subtle">
                继续等待
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative min-h-64 bg-surface-card px-6 pb-24 pt-6">
        <div className="ml-auto max-w-md rounded-16 rounded-tr-4 bg-foreground px-4 py-3 text-12 leading-paragraph text-on-dark">
          搜索近五年扩散模型在医学影像重建中的外部验证研究。
        </div>
        <div className="mt-6 inline-flex h-6 max-w-full items-center gap-2 rounded-pill border border-border-soft/60 bg-surface-2/80 px-3">
          <Search className="size-3 shrink-0 text-brand-green" />
          <span className="truncate text-12 font-medium text-muted-foreground">
            正在检索论文
          </span>
          <span className="shrink-0 text-12 tabular-nums text-faint">
            02:04
          </span>
          <span className="text-12 text-faint">•••</span>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-card via-surface-card/90 to-transparent px-6 pb-4 pt-12">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-16 border border-border-strong bg-surface-card p-[var(--wiki-mock-space-2-5)] shadow-raised">
            <div className="px-1 py-1 text-14 text-faint">
              正在等待 AI 回答…
            </div>
            <div className="flex items-center gap-1">
              <span className="ml-auto inline-flex size-9 items-center justify-center rounded-8 bg-foreground text-on-dark">
                <Square className="size-3 fill-current" strokeWidth={0} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
