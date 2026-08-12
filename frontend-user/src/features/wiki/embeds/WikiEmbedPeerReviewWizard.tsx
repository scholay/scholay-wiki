import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const STEPS = [
  { id: 1, label: "文件上传" },
  { id: 2, label: "期刊选择" },
  { id: 3, label: "Cover Letter" },
  { id: 4, label: "核对投递" },
] as const;

/**
 * 智能审稿向导顶栏 · 纯样式 fixture。
 * 对齐 product-mock WizardLayout + StepIndicator(冻结在第 2 步)。
 */
export function WikiEmbedPeerReviewWizard() {
  const current = 2;
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-8 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="peer-review-wizard"
    >
      <header className="border-b border-border bg-surface-card">
        <div className="px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-12 text-faint">第 2 / 4 步</p>
              <p className="truncate text-14 font-medium text-foreground">
                期刊选择
              </p>
            </div>
            <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-8 bg-brand-red px-3 text-12 font-medium text-on-dark">
              下一步
              <ChevronRight className="size-3.5" />
            </span>
          </div>
          <div className="mt-3 flex gap-1">
            {STEPS.map((step) => (
              <span
                key={step.id}
                className={cn(
                  "h-1 flex-1 rounded-pill",
                  step.id <= current ? "bg-brand-red" : "bg-border",
                )}
              />
            ))}
          </div>
        </div>

        <div className="hidden h-16 items-center gap-4 px-6 lg:flex">
          <div className="flex w-36 shrink-0">
            <span className="inline-flex h-9 items-center gap-1 rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
              <ChevronLeft className="size-3.5" />
              返回上一步
            </span>
          </div>

          <ol className="flex min-w-0 flex-1 items-center">
            {STEPS.map((step, idx) => {
              const done = step.id < current;
              const active = step.id === current;
              return (
                <li key={step.id} className="flex flex-1 items-center">
                  <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-pill border text-12 font-medium",
                        done && "border-border bg-surface-card text-faint",
                        active &&
                          "border-brand-red bg-danger-soft text-brand-red",
                        !done &&
                          !active &&
                          "border-border bg-surface-card text-faint",
                      )}
                    >
                      {done ? <Check className="size-3" /> : step.id}
                    </span>
                    <span
                      className={cn(
                        "whitespace-nowrap text-12",
                        active ? "font-medium text-brand-red" : "text-faint",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="-mt-4 h-px flex-1 bg-border" />
                  )}
                </li>
              );
            })}
          </ol>

          <div className="flex w-40 shrink-0 justify-end">
            <span className="inline-flex h-9 items-center gap-1 rounded-8 bg-brand-red px-4 text-12 font-medium text-on-dark">
              下一步
              <ChevronRight className="size-3.5" />
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3 px-4 py-6 md:px-6">
          <p className="font-serif text-16 font-medium text-foreground">
            核对稿件信息并选择目标期刊
          </p>
          <div className="flex h-9 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint">
            Attention Is All You Need
          </div>
          <div className="h-20 rounded-8 border border-border bg-surface-card px-3 py-2 text-12 text-faint">
            We propose a new simple network architecture, the Transformer…
          </div>
          <div className="flex h-9 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint">
            Nature Machine Intelligence
          </div>
        </div>
        <aside className="hidden border-l border-border bg-surface-card p-6 xl:block">
          <p className="text-12 font-medium text-foreground">已上传资料</p>
          <p className="mt-2 text-12 text-faint">manuscript.pdf · 2.4 MB</p>
          <p className="mt-4 text-12 font-medium text-foreground">提示</p>
          <p className="mt-1 text-12 leading-paragraph text-subtle">
            目标期刊可稍后修改；确认后进入 Cover Letter。
          </p>
        </aside>
      </div>
    </div>
  );
}
