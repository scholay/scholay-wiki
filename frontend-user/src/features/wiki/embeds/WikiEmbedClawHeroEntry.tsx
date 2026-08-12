import {
  ArrowUp,
  BookOpen,
  FileText,
  History,
  Newspaper,
  SquarePen,
} from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { MockModeToggle } from "./fixtures/mock-chrome";

/**
 * 智能搜索空态入口 · 纯样式 fixture。
 * 与上方传统搜索一样带 BrandLogo;此处再加会话条 + smart 输入壳 + 建议 chip。
 */
export function WikiEmbedClawHeroEntry() {
  return (
    <div
      className="flex w-[min(100%,36rem)] flex-col items-center"
      aria-hidden
      data-wiki-fixture="claw-hero-smart-entry"
    >
      <BrandLogo size="xl" />

      <div className="mt-6 flex w-full flex-col gap-2">
        <MockSessionStrip />
        <MockSmartComposer />
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface-card px-3 py-2 text-12 text-muted-foreground shadow-raised"
          >
            <Icon className="size-3.5 text-faint" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  { icon: BookOpen, label: "找一篇综述" },
  { icon: FileText, label: "读 PDF 写摘要" },
  { icon: Newspaper, label: "查期刊动态" },
] as const;

/** product-mock AgentSessionStrip placement=stack · 新对话空态 */
function MockSessionStrip() {
  return (
    <div className="w-full shrink-0">
      <div className="relative flex h-10 w-full items-center gap-1 rounded-12 border border-border bg-surface-card px-2 shadow-raised">
        <div className="relative z-raised flex shrink-0 items-center gap-2">
          <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-8 border border-border bg-surface-card px-2 text-subtle">
            <History className="size-3.5 shrink-0" strokeWidth={2} />
            <span className="min-w-[1ch] text-12 font-medium tabular-nums text-foreground">
              1
            </span>
          </span>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-28">
          <span className="min-w-0 max-w-full truncate text-center text-14 font-medium text-subtle">
            新对话
          </span>
        </div>

        <div className="relative z-raised ml-auto flex shrink-0 items-center gap-1">
          <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
            <SquarePen className="size-3.5" strokeWidth={2} />
            新对话
          </span>
        </div>
      </div>
    </div>
  );
}

/** product-mock SearchAutocomplete appearance=smart + SmartSearchToggle */
function MockSmartComposer() {
  return (
    <div className="relative mx-auto w-full">
      <div className="flex h-12 items-center gap-3 rounded-16 border border-border-strong bg-surface-card py-0 pl-6 pr-2 shadow-raised">
        <MockModeToggle label="智能搜索" tone="smart" />
        <div className="relative min-w-0 flex-1">
          <span className="block h-auto w-full truncate text-16 text-faint">
            对比 Transformer 与 Mamba 的长序列建模
          </span>
        </div>
        <span
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-8 border border-border bg-surface-card text-faint"
          aria-hidden
        >
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </span>
      </div>
    </div>
  );
}
