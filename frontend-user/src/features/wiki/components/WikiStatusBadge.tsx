import { WIKI_STATUS_LABEL } from "../content";
import type { WikiArticleStatus } from "../types";
import { cn } from "@/shared/lib/utils";

const STATUS_CLASS: Record<WikiArticleStatus, string> = {
  current: "border-brand-green/20 bg-brand-green-soft text-brand-green",
  experimental: "border-brand-amber/20 bg-brand-amber-soft text-brand-amber",
  compatibility: "border-status-info/20 bg-status-info-soft text-status-info",
  historical: "border-border bg-surface-card text-muted-foreground",
  planned: "border-border bg-surface-card text-faint",
};

export function WikiStatusBadge({ status }: { status: WikiArticleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-pill border px-2 text-12 font-medium",
        STATUS_CLASS[status],
      )}
    >
      {WIKI_STATUS_LABEL[status]}
    </span>
  );
}
