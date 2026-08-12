import { AlertTriangle, FileText, RefreshCcw } from "lucide-react";
import { PRISM_MOCK_THEME } from "./WikiEmbedPrismSurfaces";

/** PrismWorkspaceV2 一次编译失败后的单一可恢复状态。 */
export function WikiEmbedPrismCompileStates() {
  return (
    <div
      className="flex h-[30rem] w-[min(100%,62rem)] flex-col bg-background"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-compile-states"
    >
      <header className="flex h-14 items-center gap-3 border-b border-border px-4">
        <FileText className="size-4 text-brand-red" />
        <span className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
          扩散模型医学影像综述
        </span>
        <span className="text-12 text-faint">已自动保存</span>
        <span className="inline-flex h-8 items-center rounded-8 border border-border px-3 text-12 text-subtle">
          通用 Article
        </span>
        <span className="inline-flex h-8 items-center rounded-8 bg-brand-red px-3 text-12 font-medium text-on-brand">
          编译
        </span>
      </header>

      <div className="flex items-center gap-2 border-b border-brand-amber/30 bg-warning-soft px-4 py-2 text-12 text-brand-amber">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          本次编译未通过：公式环境缺少结束标记
        </span>
        <span className="inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-background px-3 text-12 text-subtle">
          <RefreshCcw className="size-3" />让 AI 修复
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[42%_58%]">
        <section className="flex min-h-0 flex-col border-r border-border">
          <div className="flex h-10 items-center gap-2 border-b border-border bg-surface-1 px-4 text-12 font-medium text-foreground">
            AI 写作对话
          </div>
          <div className="flex-1 space-y-3 p-4">
            <div className="ml-auto w-4/5 rounded-8 bg-foreground px-3 py-2 text-12 leading-paragraph text-on-dark">
              请编译当前稿件并修复正文里的 LaTeX 错误。
            </div>
            <div className="w-4/5 rounded-8 border border-border bg-background px-3 py-2 text-12 leading-paragraph text-subtle">
              编译在公式段落停止。你可以让我修复正文后重新编译。
            </div>
          </div>
          <div className="border-t border-border p-3">
            <div className="rounded-8 border border-border bg-background px-3 py-3 text-12 text-faint">
              输入修改要求…
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-surface-2 p-2">
          <div className="flex h-full flex-col overflow-hidden rounded-8 border border-border-strong bg-background shadow-overlay">
            <div className="m-3 rounded-8 border border-brand-amber/30 bg-warning-soft p-3 text-12 text-brand-amber">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-3.5 shrink-0" />
                <div>
                  <p className="font-medium">本次编译未通过</p>
                  <p className="mt-1 text-subtle">
                    {"Missing \\end{equation} near line 184."}
                  </p>
                  <span className="mt-2 inline-flex h-7 items-center rounded-8 border border-border bg-background px-3 text-12 text-subtle">
                    让 AI 修复
                  </span>
                </div>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-12 text-faint">
              <FileText className="size-6" />
              <p>编译通过后在这里预览 PDF</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
