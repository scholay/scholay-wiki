import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Search,
} from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const STEPS = [
  { id: 1, label: "文件上传" },
  { id: 2, label: "期刊选择" },
  { id: 3, label: "Cover Letter" },
  { id: 4, label: "核对投递" },
] as const;

/** JournalWizardPage 第 2 步的桌面冻结态。 */
export function WikiEmbedPeerReviewWizard() {
  return (
    <div
      className="flex h-[38rem] w-[min(100%,78rem)] flex-col overflow-hidden bg-surface-1"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="peer-review-wizard"
    >
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-border bg-surface-1 px-8">
        <div className="flex w-44 shrink-0 items-center">
          <span className="inline-flex h-9 items-center gap-1 rounded-8 border border-border bg-background px-4 text-12 text-subtle">
            <ChevronLeft className="size-3.5" />
            返回上一步
          </span>
        </div>

        <ol className="flex min-w-0 flex-1 items-center">
          {STEPS.map((step, index) => {
            const done = step.id < 2;
            const active = step.id === 2;
            return (
              <li key={step.id} className="flex flex-1 items-center">
                <div className="flex w-20 shrink-0 flex-col items-center gap-1">
                  <span
                    className={
                      active
                        ? "flex size-7 items-center justify-center rounded-pill border border-brand-red bg-brand-red-soft text-12 font-medium text-brand-red"
                        : done
                          ? "flex size-7 items-center justify-center rounded-pill border border-transparent bg-surface-2 text-12 font-medium text-faint"
                          : "flex size-7 items-center justify-center rounded-pill border border-border bg-background text-12 font-medium text-faint"
                    }
                  >
                    {done ? <Check className="size-3" /> : step.id}
                  </span>
                  <span
                    className={
                      active
                        ? "whitespace-nowrap text-12 font-medium text-brand-red"
                        : "whitespace-nowrap text-12 text-faint"
                    }
                  >
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 ? (
                  <div className="-mt-4 h-px flex-1 bg-border" />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="flex w-72 shrink-0 items-center justify-end gap-2">
          <span className="inline-flex h-9 items-center rounded-8 border border-border bg-background px-3 text-12 text-muted-foreground">
            取消草稿
          </span>
          <span className="inline-flex h-9 items-center gap-1 rounded-8 bg-brand-red px-4 text-12 font-medium text-on-brand">
            下一步 · Cover Letter
            <ChevronRight className="size-3.5" />
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-hidden px-8 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-6">
            <section>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <p className="text-12 font-medium text-brand-red">STEP 02</p>
                  <h2 className="mt-1 font-serif text-24 font-medium text-foreground">
                    选择目标期刊
                  </h2>
                </div>
                <span className="text-12 text-faint">
                  选填 · 可在提交前修改
                </span>
              </div>
              <div className="flex h-11 items-center gap-3 rounded-8 border border-border bg-background px-4">
                <Search className="size-4 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 text-14 text-faint">
                  搜索期刊名称、ISSN 或关键词
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <article className="rounded-8 border border-brand-red bg-brand-red-soft p-4">
                  <p className="text-14 font-medium text-foreground">
                    Nature Machine Intelligence
                  </p>
                  <p className="mt-1 text-12 text-muted-foreground">
                    IF 18.8 · JCR Q1 · Springer Nature
                  </p>
                  <p className="mt-3 text-12 font-medium text-brand-red">
                    已选择
                  </p>
                </article>
                <article className="rounded-8 border border-border bg-background p-4">
                  <p className="text-14 font-medium text-foreground">
                    Journal of Machine Learning Research
                  </p>
                  <p className="mt-1 text-12 text-muted-foreground">
                    IF 6.0 · JCR Q1 · Microtome Publishing
                  </p>
                  <p className="mt-3 text-12 text-faint">选择此期刊</p>
                </article>
              </div>
            </section>

            <section className="border-t border-border pt-5">
              <div className="mb-3 flex items-end justify-between">
                <h3 className="font-serif text-18 font-medium text-foreground">
                  核对稿件信息
                </h3>
                <span className="text-12 text-faint">AI 已从主稿中识别</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="题目" value="Attention Is All You Need" wide />
                <Field label="稿件类型" value="Research Article" />
                <Field label="关键词" value="Transformer · Attention · NLP" />
                <Field
                  label="摘要"
                  value="We propose a new simple network architecture based solely on attention mechanisms…"
                  wide
                  tall
                />
              </div>
            </section>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 overflow-hidden border-l border-border bg-background xl:block">
          <div className="p-5">
            <p className="text-12 font-medium text-faint">已上传资料</p>
            <div className="mt-3 flex items-center gap-3 rounded-8 border border-border bg-surface-1 p-3">
              <FileText className="size-5 shrink-0 text-brand-red" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-12 font-medium text-foreground">
                  manuscript.pdf
                </p>
                <p className="mt-1 text-12 text-faint">2.4 MB · 主稿</p>
              </div>
            </div>

            <section className="mt-5 rounded-8 border border-brand-red border-l-2 bg-background p-4">
              <p className="text-12 font-medium text-brand-red">已选期刊</p>
              <h3 className="mt-1 text-14 font-medium text-foreground">
                Nature Machine Intelligence
              </h3>
              <p className="mt-1 text-12 text-muted-foreground">
                IF 18.80 · JCR Q1
              </p>
            </section>

            <section className="mt-5 border-t border-border pt-4">
              <p className="text-12 font-medium text-foreground">温馨提示</p>
              <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
                目标期刊用于组织评议场景，并不会把稿件发送到该期刊。请核对 AI
                识别的题目、摘要和关键词。
              </p>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  wide,
  tall,
}: {
  label: string;
  value: string;
  wide?: boolean;
  tall?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="mb-1 text-12 font-medium text-subtle">{label}</p>
      <div
        className={
          tall
            ? "min-h-20 rounded-8 border border-border bg-background px-3 py-2 text-14 leading-paragraph text-subtle"
            : "flex h-10 items-center rounded-8 border border-border bg-background px-3 text-14 text-subtle"
        }
      >
        {value}
      </div>
    </div>
  );
}
