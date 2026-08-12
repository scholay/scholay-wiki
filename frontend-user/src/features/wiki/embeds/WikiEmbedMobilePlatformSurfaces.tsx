import {
  ChevronDown,
  ChevronLeft,
  Maximize2,
  Network,
  Share2,
  X,
  ZoomIn,
} from "lucide-react";

const DETAIL_TYPES = [
  {
    label: "论文详情",
    title: "Attention Is All You Need",
    meta: "NeurIPS · 2017",
  },
  {
    label: "期刊详情",
    title: "Nature Medicine",
    meta: "医学 · Q1",
  },
  {
    label: "学者详情",
    title: "Geoffrey Hinton",
    meta: "University of Toronto",
  },
] as const;

/** 论文、期刊和学者 canonical 详情页共用的移动顶栏。 */
export function WikiEmbedMobileDetailHeader() {
  return (
    <div
      className="grid w-[min(100%,66rem)] gap-4 md:grid-cols-3"
      aria-hidden
      data-wiki-fixture="mobile-detail-header"
    >
      {DETAIL_TYPES.map((detail) => (
        <section
          key={detail.label}
          className="overflow-hidden rounded-20 border border-border bg-surface-card"
        >
          <header className="flex h-14 items-center gap-1 border-b border-border px-2">
            <span className="flex size-9 items-center justify-center rounded-pill text-foreground">
              <ChevronLeft className="size-5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
              {detail.label}
            </span>
            <span className="flex size-9 items-center justify-center rounded-pill text-muted-foreground">
              <Share2 className="size-5" />
            </span>
          </header>
          <div className="px-4 py-6">
            <p className="text-16 font-medium leading-sans text-foreground">
              {detail.title}
            </p>
            <p className="mt-2 text-12 text-faint">{detail.meta}</p>
            <div className="mt-6 space-y-2">
              <span className="block h-2 w-full rounded-pill bg-surface-2" />
              <span className="block h-2 w-4/5 rounded-pill bg-surface-2" />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

/** /mp/diagram 的小程序 WebView 图表态与缺参兜底态。 */
export function WikiEmbedMpDiagramViewer() {
  return (
    <div
      className="grid w-[min(100%,54rem)] gap-4 md:grid-cols-2"
      aria-hidden
      data-wiki-fixture="mp-diagram-viewer"
    >
      <section className="overflow-hidden rounded-20 border border-border bg-background p-4">
        <div>
          <div className="rounded-12 border border-border bg-surface-1 px-6 py-6">
            <DiagramNode icon={<Network className="size-4" />}>
              提出研究问题
            </DiagramNode>
            <ChevronDown className="mx-auto my-2 size-4 text-faint" />
            <DiagramNode icon={<ZoomIn className="size-4" />}>
              检索与筛选文献
            </DiagramNode>
            <ChevronDown className="mx-auto my-2 size-4 text-faint" />
            <DiagramNode icon={<Maximize2 className="size-4" />}>
              综合证据并输出
            </DiagramNode>
          </div>
          <p className="mt-4 text-center text-12 text-faint">
            点按图表进入全屏 · 全屏内可拖拽缩放
          </p>
        </div>
      </section>

      <section className="flex min-h-80 items-center justify-center rounded-20 border border-border bg-background p-6 text-center">
        <p className="text-14 text-muted-foreground">
          缺少图表内容,请从对话里重新打开
        </p>
      </section>
    </div>
  );
}

const QUOTA_TOASTS = [
  {
    title: "本周期用量已过半",
    body: "用量按周期自动恢复,可先安排重要任务。",
    action: "查看用量",
    bar: "bg-brand-amber",
    dot: "bg-brand-amber",
    pill: "bg-warning-soft text-brand-amber",
  },
  {
    title: "即将达到本周期用量上限",
    body: "用完后可等待自动恢复,或用手动恢复/经费继续。",
    action: "查看用量",
    bar: "bg-brand-amber",
    dot: "bg-brand-amber",
    pill: "bg-warning-soft text-brand-amber",
  },
  {
    title: "用量已恢复",
    body: "可以继续使用了。",
    action: "",
    bar: "bg-brand-green",
    dot: "bg-brand-green",
    pill: "bg-brand-green-soft text-brand-green",
  },
  {
    title: "经费已到账",
    body: "开启「用经费继续」后,额度用完会自动续跑,只扣超出部分。",
    action: "去开启",
    bar: "bg-status-info",
    dot: "bg-status-info",
    pill: "bg-status-info-soft text-status-info",
  },
  {
    title: "本周期用量已达上限",
    body: "额度恢复后可继续使用。",
    action: "查看用量",
    bar: "bg-brand-amber",
    dot: "bg-brand-amber",
    pill: "bg-warning-soft text-brand-amber",
  },
] as const;

/** 当前额度和经费通知的五种静态呈现。 */
export function WikiEmbedQuotaStatusToasts() {
  return (
    <div
      className="grid w-[min(100%,44rem)] gap-3 md:grid-cols-2"
      aria-hidden
      data-wiki-fixture="quota-status-toasts"
    >
      {QUOTA_TOASTS.map((toast) => (
        <section
          key={toast.title}
          className="flex min-h-28 overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay"
        >
          <span className={`w-1 shrink-0 ${toast.bar}`} />
          <div className="flex min-w-0 flex-1 gap-2 p-3">
            <span
              className={`mt-2 size-2 shrink-0 rounded-pill ${toast.dot}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-14 font-medium text-foreground">
                  {toast.title}
                </p>
                <span
                  className={`shrink-0 rounded-pill px-2 py-1 text-12 ${toast.pill}`}
                >
                  系统通知
                </span>
              </div>
              <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
                {toast.body}
              </p>
              {toast.action ? (
                <span className="mt-2 inline-flex rounded-8 border border-border px-2 py-1 text-12 font-medium text-foreground">
                  {toast.action}
                </span>
              ) : null}
            </div>
            <X className="size-4 shrink-0 text-faint" />
          </div>
        </section>
      ))}
    </div>
  );
}

function DiagramNode({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-56 items-center gap-2 rounded-8 border border-border bg-surface-card px-3 py-2 text-12 font-medium text-foreground">
      <span className="text-brand-green">{icon}</span>
      {children}
    </div>
  );
}
