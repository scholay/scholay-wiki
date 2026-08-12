import {
  Calculator,
  FileText,
  Globe,
  Languages,
  Package,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { PRISM_MOCK_THEME } from "./WikiEmbedPrismSurfaces";

const WRITING_TOOLS = [
  { label: "生成摘要", icon: FileText, tone: "green" },
  { label: "全文润色", icon: RefreshCw, tone: "neutral" },
  { label: "整篇翻译", icon: Languages, tone: "amber" },
  { label: "意见回应", icon: Globe, tone: "red" },
  { label: "投稿材料", icon: Package, tone: "red" },
  { label: "数字校验", icon: Calculator, tone: "red" },
] as const;

/** Prism 空对话写作能力入口 · 纯样式 fixture，对齐 PrismChatEmptyState。 */
export function WikiEmbedPrismWritingStart() {
  return (
    <div
      className="w-[min(100%,32rem)] bg-background p-6"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-writing-start"
    >
      <p className="text-center text-16 font-medium text-foreground">
        想从哪里开始？
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-12 border border-brand-green/30 bg-brand-green/5 p-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-brand-green/10 text-brand-green">
          <PenLine className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-14 font-medium text-foreground">
            起草《2 方法》
          </p>
          <p className="mt-1 text-12 text-subtle">
            这一节还是空的，建议从它开始
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {WRITING_TOOLS.map(({ label, icon: Icon, tone }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 rounded-8 border border-border py-3"
          >
            <span
              className={
                tone === "green"
                  ? "inline-flex size-8 items-center justify-center rounded-8 bg-brand-green/10 text-brand-green"
                  : tone === "amber"
                    ? "inline-flex size-8 items-center justify-center rounded-8 bg-warning-soft text-brand-amber"
                    : tone === "red"
                      ? "inline-flex size-8 items-center justify-center rounded-8 bg-danger-soft text-brand-red"
                      : "inline-flex size-8 items-center justify-center rounded-8 bg-surface-2 text-subtle"
              }
            >
              <Icon className="size-4" />
            </span>
            <span className="text-12 text-subtle">{label}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-12 text-faint">
        写作画像 · 医学影像综述
      </p>
    </div>
  );
}
