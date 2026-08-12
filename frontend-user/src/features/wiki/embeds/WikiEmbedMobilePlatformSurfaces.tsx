import { ChevronLeft, Share2, X } from "lucide-react";
import { MermaidDiagram } from "@/shared/components/chat/MermaidDiagram";

const DIAGRAM_CODE = `flowchart TD
  A[研究问题] --> B[多数据库检索]
  B --> C{去重与筛选}
  C --> D[纳入代表性综述]
  D --> E[核对外部验证]
  E --> F[比较机构 / 设备 / 人群]`;

/** 论文、期刊与学者详情共用的移动顶栏。 */
export function WikiEmbedMobileDetailHeader() {
  return (
    <header
      className="flex h-14 w-[min(100%,24rem)] shrink-0 items-center gap-1 border-b border-border bg-background px-2"
      aria-hidden
      data-wiki-fixture="mobile-detail-header"
    >
      <span className="flex size-9 items-center justify-center rounded-pill text-foreground">
        <ChevronLeft className="size-5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
        论文详情
      </span>
      <span className="flex size-9 items-center justify-center rounded-pill text-muted-foreground">
        <Share2 className="size-5" />
      </span>
    </header>
  );
}

/** /mp/diagram 的有效 Mermaid 图表查看状态。 */
export function WikiEmbedMpDiagramViewer() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden bg-background px-4"
      style={{ height: 704, paddingBlock: 20 }}
      aria-hidden
      data-wiki-fixture="mp-diagram-viewer"
    >
      <MermaidDiagram code={DIAGRAM_CODE} />
      <p className="mt-4 text-center text-12 text-faint">
        点按图表进入全屏 · 全屏内可拖拽缩放
      </p>
    </div>
  );
}

/** 额度达到上限时的一条真实、可同时成立的状态通知。 */
export function WikiEmbedQuotaStatusToasts() {
  return (
    <div
      className="flex w-80 overflow-hidden rounded-8 border border-border bg-background shadow-raised"
      aria-hidden
      data-wiki-fixture="quota-status-toasts"
    >
      <span className="w-1 shrink-0 bg-brand-amber" />
      <div className="flex flex-1 gap-2 p-3">
        <span
          className="size-2 shrink-0 rounded-pill bg-brand-amber"
          style={{ marginTop: 6 }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-14 font-medium text-foreground">
              本周期用量已达上限
            </p>
            <span
              className="shrink-0 rounded-pill bg-warning-soft text-12 text-brand-amber"
              style={{ paddingBlock: 2, paddingInline: 6 }}
            >
              系统通知
            </span>
          </div>
          <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
            额度恢复后可继续使用。
          </p>
          <div className="mt-2">
            <span className="inline-flex items-center rounded-8 border border-border px-2 py-1 text-12 font-medium text-foreground">
              查看用量
            </span>
          </div>
        </div>
        <X className="size-4 shrink-0 text-faint" />
      </div>
    </div>
  );
}
