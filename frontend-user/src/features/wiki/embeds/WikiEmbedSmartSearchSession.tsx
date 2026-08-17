import {
  ArrowUp,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  FileText,
  History,
  Sparkles,
  SquarePen,
} from "lucide-react";
import { MockModeToggle } from "./fixtures/mock-chrome";

const THINKING_PREVIEW = "已完成概念拆解、同义词扩展与多源检索。";

const ASSISTANT_TEXT =
  "我已完成跨方向检索。下面 4 篇分别代表生成、检索增强、注意力和结构预测，可作为比较技术范式与证据边界的起点。";

const PAPERS = [
  {
    title: "Denoising Diffusion Probabilistic Models",
    meta: "NeurIPS · Jonathan Ho, Pieter Abbeel · 2020",
  },
  {
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    meta: "NeurIPS · Patrick Lewis, Douwe Kiela · 2020",
  },
  {
    title: "Attention Is All You Need",
    meta: "NeurIPS · Ashish Vaswani, Noam Shazeer · 2017",
  },
  {
    title: "Highly accurate protein structure prediction with AlphaFold",
    meta: "Nature · John Jumper, Demis Hassabis · 2021",
  },
] as const;

/**
 * 智能搜论文会话态 · 纯样式 fixture。
 * 对齐 product-mock ThinkingFold + AssistantBubble + PaperListScroller 组头
 * + AgentSessionStrip + Composer compact 底栏。
 */
export function WikiEmbedSmartSearchSession() {
  return (
    <div
      className="w-[min(100%,40rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="smart-search-session"
    >
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="ml-auto w-[min(100%,28rem)] rounded-16 rounded-br-4 bg-foreground px-4 py-3 text-12 leading-paragraph text-on-dark">
              找四类 AI
              代表性工作，比较生成、检索增强、注意力和结构预测的范式差异。
            </div>
            <div className="rounded-8 bg-surface-1/60">
              <div className="flex w-full min-w-0 items-center gap-2 px-2 py-1 text-left text-12 text-muted-foreground">
                <ChevronRight className="size-3 shrink-0" strokeWidth={2.2} />
                <Sparkles
                  className="size-3 shrink-0 text-faint"
                  strokeWidth={2.2}
                />
                <span className="shrink-0 font-medium">思考过程</span>
                <span className="min-w-0 flex-1 truncate font-mono text-12 text-faint">
                  {THINKING_PREVIEW}
                </span>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-16 rounded-tl-4 border border-border bg-surface-card px-4 py-3">
              <p className="text-12 leading-paragraph text-foreground">
                {ASSISTANT_TEXT}
              </p>
            </div>

            <div className="overflow-hidden rounded-8 border border-border bg-surface-card">
              <header className="flex h-9 items-center justify-between gap-2 border-b border-border-soft bg-surface-2/40 px-2">
                <div className="flex items-center gap-2 text-12 text-muted-foreground">
                  <ChevronDown className="size-3" strokeWidth={2.2} />
                  <FileText className="size-3" strokeWidth={2} />
                  <span className="font-medium text-foreground">4 篇论文</span>
                </div>
                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-4 px-2 text-12 font-medium text-brand-green">
                  <BookmarkPlus className="size-3" strokeWidth={2.2} />
                  一键暂存 4 篇
                </span>
              </header>
              <ul className="divide-y divide-border-hairline">
                {PAPERS.map((paper) => (
                  <li
                    key={paper.title}
                    className="flex items-start gap-2 px-3 py-3"
                  >
                    <span className="mt-1 inline-flex size-4 shrink-0 rounded-4 border border-border bg-surface-card" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-14 font-medium text-foreground">
                        {paper.title}
                      </span>
                      <span className="mt-1 block truncate text-12 text-faint">
                        {paper.meta}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border-soft bg-surface-card px-4 pb-4 pt-3">
        <div className="flex flex-col gap-2">
          <div className="shrink-0">
            <div className="relative flex h-10 items-center gap-1 rounded-12 border border-border bg-surface-card px-2 shadow-raised">
              <div className="relative z-raised flex shrink-0 items-center gap-2">
                <span className="inline-flex h-7 shrink-0 items-center gap-2 rounded-8 bg-surface-1/80 px-2 text-subtle">
                  <History className="size-3.5 shrink-0" strokeWidth={2} />
                  <span className="min-w-[1ch] text-12 font-medium tabular-nums text-foreground">
                    3
                  </span>
                </span>
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-28">
                <span className="min-w-0 max-w-full truncate text-center text-14 font-medium text-subtle">
                  AI 代表工作 · 范式比较
                </span>
              </div>
              <div className="relative z-raised ml-auto flex shrink-0 items-center">
                <span className="inline-flex h-7 shrink-0 items-center gap-2 rounded-8 bg-foreground px-2 text-12 font-medium text-on-dark">
                  <SquarePen className="size-3.5" strokeWidth={2} />
                  新对话
                </span>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col overflow-hidden rounded-16 border border-border-strong bg-surface-card shadow-raised">
            <div className="flex h-12 items-center gap-3 pl-5 pr-2">
              <MockModeToggle label="智能搜论文" tone="smart" />
              <div className="relative min-w-0 flex-1">
                <span className="block truncate text-16 text-faint">
                  继续与智能搜论文对话…
                </span>
              </div>
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-faint">
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
