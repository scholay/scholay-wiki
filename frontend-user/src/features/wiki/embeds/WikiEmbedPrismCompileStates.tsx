import {
  AlertTriangle,
  Check,
  Clock3,
  Download,
  FileText,
  Play,
  RefreshCcw,
} from "lucide-react";

const FLOW = [
  { label: "排队", detail: "queued", done: true },
  { label: "编译", detail: "running", done: true },
  { label: "已生成", detail: "success", done: true },
] as const;

/** Prism 编译主链与失败分支 · 纯样式 fixture。 */
export function WikiEmbedPrismCompileStates() {
  return (
    <div
      className="w-[min(100%,44rem)] space-y-3"
      aria-hidden
      data-wiki-fixture="prism-compile-states"
    >
      <section className="rounded-12 border border-border bg-surface-card p-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-brand-red" />
          <p className="text-14 font-medium text-foreground">本次编译</p>
          <span className="ml-auto rounded-pill bg-brand-green/10 px-3 py-1 text-12 text-brand-green">
            PDF 已更新
          </span>
        </div>

        <ol className="mt-4 grid grid-cols-3 gap-2">
          {FLOW.map((step, index) => (
            <li
              key={step.label}
              className="relative rounded-8 bg-surface-1 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-pill bg-brand-green text-on-dark">
                  <Check className="size-3" />
                </span>
                <div>
                  <p className="text-12 font-medium text-foreground">
                    {step.label}
                  </p>
                  <p className="text-12 font-mono text-faint">{step.detail}</p>
                </div>
              </div>
              {index < FLOW.length - 1 && (
                <span className="absolute left-full top-1/2 z-raised h-px w-2 bg-border" />
              )}
            </li>
          ))}
        </ol>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-8 border border-border-soft px-3 py-2">
          <Clock3 className="size-3.5 text-faint" />
          <span className="text-12 text-subtle">
            12 页 · 3,842 词 · 刚刚生成
          </span>
          <span className="ml-auto inline-flex h-7 items-center gap-1 rounded-8 bg-foreground px-3 text-12 text-on-dark">
            <Download className="size-3.5" />
            下载 PDF
          </span>
        </div>
      </section>

      <section className="rounded-12 border border-brand-amber/30 bg-warning-soft p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 size-4 shrink-0 text-brand-amber" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-12 font-medium text-foreground">
                失败分支示例 · LaTeX 错误
              </p>
              <span className="rounded-pill bg-surface-card px-2 py-1 font-mono text-12 text-brand-amber">
                error
              </span>
            </div>
            <p className="mt-2 text-12 leading-paragraph text-subtle">
              公式环境缺少结束标记。正文类错误可尝试有限自动修复；参考文献、服务异常与超时需按提示处理。
            </p>
            <div className="mt-3 flex gap-2">
              <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-foreground px-3 text-12 text-on-dark">
                <RefreshCcw className="size-3.5" />让 AI 修复
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-surface-card px-3 text-12 text-foreground">
                <Play className="size-3" />
                查看诊断
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
