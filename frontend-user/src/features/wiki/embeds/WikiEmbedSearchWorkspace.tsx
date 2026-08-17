import {
  FileText,
  Grid3x3,
  MessageSquare,
  Network,
  Search,
} from "lucide-react";

const WORKSPACE_FUNCTIONS = [
  { label: "矩阵分析", Icon: Grid3x3, active: true },
  { label: "文献图谱", Icon: Network, active: false },
  { label: "PDF Chat", Icon: MessageSquare, active: false },
] as const;

/**
 * 学术搜索的三列工作区，冻结“矩阵分析已打开”这一种合法状态。
 * 三个工作区功能共享同一互斥开关；文献集使用同一组能力，但不与本图并列模拟。
 */

export function WikiEmbedSearchWorkspace() {
  return (
    <div
      className="grid h-72 w-[min(100%,58rem)] grid-cols-[13rem_12rem_minmax(0,1fr)] overflow-hidden rounded-12 border border-border bg-background"
      aria-hidden
      data-wiki-fixture="search-workspace"
    >
      <section className="flex min-w-0 flex-col border-r border-border">
        <header className="flex h-11 items-center gap-2 border-b border-border px-3">
          <Search className="size-3.5 text-faint" />
          <span className="text-12 font-medium text-foreground">
            论文库搜索
          </span>
        </header>
        <div className="space-y-2 p-3">
          {["大语言模型可解释性", "检索增强生成", "长序列建模"].map(
            (title, index) => (
              <article
                key={title}
                className={`rounded-8 border p-2 ${
                  index === 0
                    ? "border-foreground bg-surface-1"
                    : "border-border bg-background"
                }`}
              >
                <p className="m-0 line-clamp-2 text-12 font-medium text-foreground">
                  {title}
                </p>
                <p className="m-0 mt-1 text-12 text-faint">2024 · 论文结果</p>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="flex min-w-0 flex-col border-r border-border bg-surface-1">
        <header className="flex h-11 items-center gap-2 border-b border-border px-3">
          <FileText className="size-3.5 text-faint" />
          <span className="text-12 font-medium text-foreground">
            文件区 · 3 篇
          </span>
        </header>
        <div className="divide-y divide-border">
          {[
            "RAG for Knowledge-Intensive NLP",
            "Attention Is All You Need",
            "Mamba",
          ].map((title) => (
            <div key={title} className="px-3 py-3">
              <p className="m-0 line-clamp-2 text-12 text-foreground">
                {title}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-w-0 flex-col">
        <header
          className="flex h-11 items-center gap-1 border-b border-border bg-surface-1 px-2"
          data-wiki-spot="互斥工作区功能"
        >
          {WORKSPACE_FUNCTIONS.map(({ label, Icon, active }) => (
            <span
              key={label}
              className={`inline-flex h-7 min-w-0 items-center gap-1 rounded-4 border px-2 text-12 font-medium ${
                active
                  ? "border-brand-red/30 bg-brand-red/5 text-brand-red"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </span>
          ))}
        </header>
        <div className="min-h-0 flex-1 p-3">
          <p className="m-0 text-12 font-medium text-foreground">矩阵分析</p>
          <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-8 border border-border text-12">
            {[
              "论文",
              "研究方法",
              "主要结论",
              "Lewis 2020",
              "RAG",
              "知识密集任务",
              "Vaswani 2017",
              "Transformer",
              "注意力架构",
            ].map((cell, index) => (
              <span
                key={`${cell}-${index}`}
                className={`border-b border-r border-border px-2 py-2 ${
                  index < 3
                    ? "bg-surface-2 font-medium text-foreground"
                    : "text-subtle"
                }`}
              >
                {cell}
              </span>
            ))}
          </div>
          <p className="mb-0 mt-2 text-12 text-faint">
            当前只展开矩阵分析；切换图谱或 PDF Chat 会替换此区域。
          </p>
        </div>
      </section>
    </div>
  );
}
