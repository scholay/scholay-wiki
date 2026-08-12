import { Download, Grid3X3, Inbox, Settings2, X } from "lucide-react";

const ROWS = [
  {
    title: "Denoising Diffusion Probabilistic Models",
    method: "扩散概率模型",
    dataset: "CIFAR-10",
    metric: "FID 3.17",
    conclusion: "生成质量优于同期基线",
  },
  {
    title: "High-Resolution Image Synthesis with Latent Diffusion Models",
    method: "潜空间扩散",
    dataset: "LAION-5B",
    metric: "FID 4.02",
    conclusion: "降低高分辨率训练成本",
  },
  {
    title: "Elucidating the Design Space of Diffusion-Based Generative Models",
    method: "设计空间消融",
    dataset: "ImageNet",
    metric: "FID 1.79",
    conclusion: "统一采样与预条件设计",
  },
] as const;

/**
 * 矩阵分析工作区 · 纯样式 fixture。
 * 对齐 product-mock MatrixColumn + DimensionCell + DimensionSettingsDialog。
 */
export function WikiEmbedMatrixWorkspace() {
  return (
    <div
      className="w-[min(100%,56rem)] overflow-hidden rounded-8 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="matrix-workspace"
    >
      <header className="flex h-14 border-b border-border bg-background">
        <div className="flex w-80 shrink-0 items-center gap-2 border-r border-border px-4">
          <Inbox className="size-4 text-brand-red" />
          <span className="font-serif text-16 font-medium text-foreground">
            工作区
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Grid3X3 className="size-4 shrink-0 text-brand-red" />
            <span className="font-serif text-16 font-medium text-foreground">
              矩阵分析
            </span>
            <span className="truncate text-12 text-faint">3 篇 · 4 维度</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <span className="inline-flex h-7 items-center gap-1 rounded-8 border border-border px-3 text-12 text-subtle">
              <Settings2 className="size-3" />
              设置列
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
              <Download className="size-3" />
              导出
            </span>
          </div>
        </div>
      </header>

      <div className="overflow-x-auto" data-wiki-spot="矩阵维度">
        <table className="min-w-[54rem] border-separate border-spacing-0 text-left text-12">
          <thead>
            <tr className="bg-surface-1 text-muted-foreground">
              <th className="w-80 border-b border-r border-border bg-background p-0 font-medium">
                <div className="flex h-9 items-center gap-1 px-3">
                  <span className="relative inline-flex h-full items-center gap-2 px-2 font-medium text-foreground">
                    A
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-12 text-on-brand">
                      3
                    </span>
                    <span className="absolute inset-x-2 bottom-0 h-px rounded-pill bg-brand-red" />
                  </span>
                  <span className="inline-flex h-full items-center gap-2 px-2 text-faint">
                    B
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-surface-2 px-1 text-12">
                      1
                    </span>
                  </span>
                </div>
              </th>
              {["研究方法", "数据集", "关键指标", "结论"].map((label) => (
                <th
                  key={label}
                  className="border-b border-r border-border px-3 py-3 font-medium last:border-r-0"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.title}>
                <td className="relative w-80 border-b border-r border-border px-4 py-3 align-top">
                  <X className="absolute right-2 top-2 size-3 text-faint" />
                  <p className="line-clamp-2 pr-5 text-14 font-medium leading-sans text-foreground">
                    {row.title}
                  </p>
                  <p className="mt-2 line-clamp-2 text-12 leading-paragraph text-subtle">
                    {row.conclusion}
                  </p>
                </td>
                <MatrixCell tag="方法" value={row.method} />
                <MatrixCell tag="数据" value={row.dataset} />
                <MatrixCell tag="结果" value={row.metric} highlight />
                <MatrixCell tag="结论" value={row.conclusion} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 bg-surface-1 px-4 py-3 text-12 text-muted-foreground">
        <span>工作区 A · 3 篇论文</span>
        <span>每个单元格由 AI 按维度生成，可导出 CSV / Markdown / XLSX</span>
      </footer>
    </div>
  );
}

function MatrixCell({
  tag,
  value,
  highlight = false,
}: {
  tag: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <td className="border-b border-r border-border px-3 py-3 align-top last:border-r-0">
      <span
        className={
          highlight
            ? "rounded-4 bg-brand-red-soft px-2 py-1 font-medium text-brand-red"
            : "rounded-4 bg-surface-2 px-2 py-1 text-muted-foreground"
        }
      >
        {tag}
      </span>
      <p className="mt-2 leading-paragraph text-subtle">{value}</p>
    </td>
  );
}
