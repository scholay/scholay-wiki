import { ArrowUp } from "lucide-react";
import { MockModeToggle } from "./fixtures/mock-chrome";

/**
 * 智能搜索底栏 Composer · 纯样式 fixture。
 * 对齐 product-mock Composer compact + SmartSearchToggle(有会话时的底部 dock)。
 */
export function WikiEmbedSmartSearchDock() {
  return (
    <div
      className="w-[min(100%,36rem)]"
      aria-hidden
      data-wiki-fixture="smart-search-dock"
    >
      <div className="relative flex flex-col overflow-hidden rounded-16 border border-border-strong bg-surface-card shadow-raised">
        <div className="flex h-12 items-center gap-3 pl-6 pr-2">
          <MockModeToggle label="智能搜索" tone="smart" />
          <div className="relative min-w-0 flex-1">
            <span className="block truncate text-16 text-faint">
              继续与智能搜索对话…
            </span>
          </div>
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-faint">
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </div>
  );
}
