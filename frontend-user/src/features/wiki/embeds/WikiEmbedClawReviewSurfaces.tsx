import type { CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Image,
  Info,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

const MOCK_THEME = {
  "--wiki-mock-space-2": "0.125rem",
  "--wiki-mock-space-6": "0.375rem",
  "--wiki-mock-space-10": "0.625rem",
  "--wiki-mock-space-14": "0.875rem",
  "--wiki-mock-space-20": "1.25rem",
  "--wiki-mock-space-28": "1.75rem",
  "--radius-4": "0.25rem",
  "--radius-8": "0.375rem",
  "--radius-12": "0.5rem",
  "--radius-16": "0.75rem",
  "--radius-20": "1rem",
  "--text-12": "0.625rem",
  "--text-14": "0.6875rem",
  "--text-16": "0.75rem",
  "--text-18": "0.8125rem",
  "--text-20": "0.875rem",
  "--text-24": "1rem",
  "--text-28": "1.25rem",
  "--text-32": "1.5rem",
  "--font-weight-medium": "700",
} as CSSProperties;

const ARTIFACTS = [
  {
    name: "literature-review.md",
    description: "Markdown · 18 KB",
    icon: FileText,
    preview: true,
  },
  {
    name: "evidence-matrix.xlsx",
    description: "表格 · 42 KB",
    icon: FileSpreadsheet,
    preview: true,
  },
  {
    name: "references",
    description: "文件夹 · 打包为 zip 下载",
    icon: FolderArchive,
    preview: false,
  },
] as const;

/** Claw 回答区文件卡、图像生成态与右侧表格预览的同状态静态截面。 */
export function WikiEmbedClawArtifactOutput() {
  return (
    <div
      className="grid min-h-[28rem] w-[min(100%,58rem)] overflow-hidden bg-background lg:grid-cols-[1fr_22rem]"
      style={MOCK_THEME}
      aria-hidden
      data-wiki-fixture="claw-artifact-output"
    >
      <main className="min-w-0 p-4 lg:border-r lg:border-border">
        <p className="mb-3 text-18 leading-paragraph text-subtle">
          已整理关键论点、证据矩阵和可复核的参考文献包。
        </p>

        <section className="rounded-12 border border-brand-green/30 bg-brand-green/5 p-[var(--wiki-mock-space-10)]">
          <div className="mb-2 flex items-center gap-[var(--wiki-mock-space-6)] px-[var(--wiki-mock-space-2)] text-12 font-medium text-brand-green">
            <Sparkles className="size-[var(--wiki-mock-space-14)]" />
            生成的文件
          </div>
          <div className="flex flex-col gap-[var(--wiki-mock-space-6)]">
            {ARTIFACTS.map(({ name, description, icon: Icon, preview }) => (
              <div
                key={name}
                className="flex items-center gap-[var(--wiki-mock-space-10)] rounded-8 border border-border bg-background px-3 py-2"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-8 bg-brand-green/10">
                  <Icon className="size-4 text-brand-green" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-16 font-medium text-foreground">
                    {name}
                    {!preview ? "/" : ""}
                  </div>
                  <div className="truncate text-12 text-muted-foreground">
                    {description}
                  </div>
                </div>
                {preview ? (
                  <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-8 border border-border px-2 text-12 text-subtle">
                    <Eye className="size-[var(--wiki-mock-space-14)]" /> 预览
                  </span>
                ) : null}
                <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-8 bg-brand-green px-2 text-12 font-medium text-on-brand">
                  <Download className="size-[var(--wiki-mock-space-14)]" />
                  {preview ? "下载" : "打包下载"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <figure className="mt-3 rounded-12 border border-brand-green/25 bg-brand-green/[0.03] p-[var(--wiki-mock-space-10)]">
          <div className="flex h-40 w-full items-center justify-center rounded-8 border border-border bg-background text-12 text-muted-foreground">
            <Image className="mr-2 size-4 text-brand-green" />
            图像生成中…
          </div>
          <figcaption className="mt-[var(--wiki-mock-space-6)] px-[var(--wiki-mock-space-2)] text-12 text-muted-foreground">
            evidence-flow
          </figcaption>
        </figure>
      </main>

      <aside className="flex min-h-0 min-w-0 flex-col bg-background">
        <div className="flex h-9 shrink-0 items-center gap-[var(--wiki-mock-space-6)] border-b border-border px-3">
          <ArrowLeft className="size-[var(--wiki-mock-space-14)] text-muted-foreground" />
          <span className="text-16 text-muted-foreground">返回成果列表</span>
        </div>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-16 font-medium text-foreground">
              evidence-matrix.xlsx
            </div>
            <div className="truncate text-12 text-muted-foreground">
              证据矩阵 · 42 KB
            </div>
          </div>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 px-2 text-14 text-muted-foreground">
            <Download className="size-[var(--wiki-mock-space-14)]" /> 下载
          </span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="flex shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-surface-1 px-2 py-1">
            <span className="inline-flex items-center rounded-4 bg-foreground px-2 py-1 text-12 text-on-dark">
              Sheet1
            </span>
            <span className="inline-flex items-center rounded-4 px-2 py-1 text-12 text-muted-foreground">
              Notes
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <table className="w-full border-collapse text-14 tabular-nums">
              <tbody>
                {[
                  ["研究", "样本", "核心发现"],
                  ["Lewis 2020", "1,024", "检索增强减少知识错误"],
                  ["Guu 2020", "845", "预训练阶段接入语料库"],
                  ["Izacard 2021", "1,632", "多文档融合提升问答"],
                  ["Gao 2024", "2,483", "评估覆盖检索与生成"],
                ].map((row, rowIndex) => (
                  <tr
                    key={row[0]}
                    className={rowIndex === 0 ? "bg-surface-1 font-medium" : ""}
                  >
                    <td className="border border-border bg-surface-2 px-[var(--wiki-mock-space-6)] py-1 text-center text-12 text-faint">
                      {rowIndex + 1}
                    </td>
                    {row.map((cell) => (
                      <td
                        key={cell}
                        className="border border-border px-2 py-1 align-top text-subtle"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </div>
  );
}

const REVIEW_RECORDS = [
  {
    title: "A Multimodal Framework for Early Disease Detection",
    mode: "期刊投稿",
    target: "Nature Medicine",
    submittedAt: "2026/8/12",
    percent: 60,
    progressTone: "bg-brand-amber",
    progressLabel: "60%",
    decision: "进行中",
    decisionClass: "bg-warning-soft text-brand-amber",
    action: "查看进度",
  },
  {
    title: "Responsible Deployment of Clinical Language Models",
    mode: "期刊投稿",
    target: "The Lancet Digital Health",
    submittedAt: "2026/8/9",
    percent: 100,
    progressTone: "bg-brand-green",
    progressLabel: "100%",
    decision: "返修",
    decisionClass: "bg-danger-soft text-brand-red",
    action: "查看评议",
  },
  {
    title: "人工智能辅助科研写作的证据边界研究",
    mode: "毕业审稿",
    target: "—",
    submittedAt: "—",
    percent: 0,
    progressTone: "bg-surface-2",
    progressLabel: "草稿中",
    decision: "—",
    decisionClass: "text-faint",
    action: "继续投稿",
  },
] as const;

/** 同行评审记录页默认「全部」态：完整页面头、状态 tabs 与六列表格。 */
export function WikiEmbedPeerReviewRecordsList() {
  return (
    <div
      className="flex w-[min(100%,64rem)] flex-col bg-surface-1"
      style={MOCK_THEME}
      aria-hidden
      data-wiki-fixture="peer-review-records-list"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-8">
        <h3 className="text-28 font-medium text-foreground">我的审稿</h3>
        <span className="inline-flex h-9 items-center gap-[var(--wiki-mock-space-6)] rounded-8 bg-brand-red px-4 text-16 font-medium text-on-brand">
          <Plus className="size-[var(--wiki-mock-space-14)]" /> 新建审稿
        </span>
      </header>

      <nav className="flex h-11 shrink-0 items-center border-b border-border bg-background px-6">
        {[
          ["全部", "3"],
          ["草稿", "1"],
          ["进行中", "1"],
          ["已完成", "1"],
        ].map(([label, count], index) => (
          <span
            key={label}
            className={
              index === 0
                ? "inline-flex h-full items-center gap-[var(--wiki-mock-space-6)] border-b-2 border-brand-red px-4 text-16 font-medium text-brand-red"
                : "inline-flex h-full items-center gap-[var(--wiki-mock-space-6)] border-b-2 border-transparent px-4 text-16 text-muted-foreground"
            }
          >
            {label}
            <span className={index === 0 ? "text-brand-red" : "text-faint"}>
              {count}
            </span>
          </span>
        ))}
      </nav>

      <div className="overflow-x-auto px-6 py-[var(--wiki-mock-space-20)]">
        <div className="min-w-[54rem] overflow-hidden rounded-8 border border-border bg-background">
          <table className="w-full text-16">
            <thead className="border-b border-border bg-surface-1">
              <tr className="text-left text-14 text-faint">
                <th className="px-4 py-3 font-normal">标题</th>
                <th className="w-36 px-4 py-3 font-normal">投递目标</th>
                <th className="w-28 px-4 py-3 font-normal">提交时间</th>
                <th className="w-40 px-4 py-3 font-normal">审稿进度</th>
                <th className="w-24 px-4 py-3 font-normal">决议</th>
                <th className="w-32 px-4 py-3 text-right font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {REVIEW_RECORDS.map((record) => (
                <tr
                  key={record.title}
                  className="border-b border-border-hairline last:border-0"
                >
                  <td className="px-4 py-4">
                    <p className="line-clamp-1 text-16 font-medium text-foreground">
                      {record.title}
                    </p>
                    <p className="mt-1 text-12 text-faint">{record.mode}</p>
                  </td>
                  <td className="px-4 py-4 text-14 text-muted-foreground">
                    <span className="line-clamp-1">{record.target}</span>
                  </td>
                  <td className="px-4 py-4 text-14 text-muted-foreground">
                    {record.submittedAt}
                  </td>
                  <td className="px-4 py-4">
                    {record.percent > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="h-[var(--wiki-mock-space-6)] flex-1 overflow-hidden rounded-pill bg-surface-2">
                          <span
                            className={`block h-full ${record.progressTone}`}
                            style={{ width: `${record.percent}%` }}
                          />
                        </span>
                        <span className="shrink-0 text-12 text-muted-foreground">
                          {record.progressLabel}
                        </span>
                      </div>
                    ) : (
                      <span className="text-12 text-faint">
                        {record.progressLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-pill px-[var(--wiki-mock-space-10)] py-[var(--wiki-mock-space-2)] text-12 font-medium ${record.decisionClass}`}
                    >
                      {record.decision}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex items-center justify-end gap-[var(--wiki-mock-space-6)]">
                      <span
                        className={
                          record.action === "继续投稿"
                            ? "inline-flex h-7 items-center rounded-8 border border-brand-red bg-background px-3 text-12 font-medium text-brand-red"
                            : "inline-flex h-7 items-center rounded-8 border border-border bg-background px-3 text-12 font-medium text-subtle"
                        }
                      >
                        {record.action}
                      </span>
                      <span className="inline-flex size-7 items-center justify-center rounded-8 border border-border text-faint">
                        <Trash2 className="size-[var(--wiki-mock-space-14)]" />
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-14 text-muted-foreground">
          <span>共 23 条 · 第 1 / 2 页</span>
          <div className="flex items-center gap-[var(--wiki-mock-space-6)]">
            <span className="inline-flex h-7 items-center gap-[var(--wiki-mock-space-2)] rounded-8 border border-border bg-background pl-[var(--wiki-mock-space-6)] pr-[var(--wiki-mock-space-10)] font-medium text-faint">
              <ChevronLeft className="size-[var(--wiki-mock-space-14)]" />{" "}
              上一页
            </span>
            <span className="inline-flex h-7 items-center gap-[var(--wiki-mock-space-2)] rounded-8 border border-border bg-background pl-[var(--wiki-mock-space-10)] pr-[var(--wiki-mock-space-6)] font-medium text-subtle">
              下一页{" "}
              <ChevronRight className="size-[var(--wiki-mock-space-14)]" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 同行评审投递成功 splash，保持 720px 白卡、104px 成功环和双按钮。 */
export function WikiEmbedPeerReviewSubmitSuccess() {
  return (
    <div
      className="flex w-[min(100%,49rem)] items-center justify-center bg-surface-3 px-8 py-10"
      style={MOCK_THEME}
      aria-hidden
      data-wiki-fixture="peer-review-submit-success"
    >
      <article className="flex w-full max-w-[45rem] flex-col gap-6 rounded-12 border border-border bg-background px-14 py-12">
        <header className="flex flex-col items-center gap-2">
          <span className="flex size-26 items-center justify-center rounded-pill bg-brand-green/10">
            <span className="flex size-20 items-center justify-center rounded-pill bg-brand-green">
              <Check className="size-10 text-on-brand" strokeWidth={3.5} />
            </span>
          </span>
          <h3 className="mt-2 font-serif text-32 font-medium leading-display-tight text-foreground">
            恭喜！稿件已成功投递
          </h3>
          <p className="max-w-[30rem] text-center text-20 leading-paragraph text-muted-foreground">
            您的稿件已成功投递至期刊编辑部，编辑团队已收到投稿并进入处理流程。
          </p>
        </header>

        <section className="rounded-12 border border-border bg-surface-3 px-6 py-[var(--wiki-mock-space-20)]">
          <div className="flex items-center justify-between">
            <h4 className="text-24 font-medium text-foreground">投稿信息</h4>
            <span className="rounded-pill bg-danger-soft px-3 py-[var(--wiki-mock-space-2)] text-14 font-medium text-brand-red">
              已提交 · 待初审
            </span>
          </div>
          <div className="my-3 h-px bg-border-hairline" />
          <dl className="flex flex-col gap-3">
            <InfoRow
              label="稿件标题"
              value="A Multimodal Framework for Early Disease Detection"
              emphasized
            />
            <InfoRow label="投稿期刊" value="Nature Medicine" />
            <InfoRow label="投稿编号" value="SCY-2026-0812-7F3A" />
            <InfoRow label="提交时间" value="2026-08-12 14:32" />
            <InfoRow label="通讯作者" value="本账户作者" />
          </dl>
        </section>

        <aside className="flex gap-3 rounded-12 border border-brand-amber/40 bg-warning-soft px-4 py-[var(--wiki-mock-space-14)]">
          <span className="mt-[var(--wiki-mock-space-2)] flex size-6 shrink-0 items-center justify-center rounded-pill bg-brand-amber">
            <Info
              className="size-[var(--wiki-mock-space-14)] text-foreground"
              strokeWidth={3}
            />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-24 font-medium text-brand-amber">
              接下来会发生什么？
            </p>
            <p className="text-16 leading-paragraph text-brand-amber/80">
              投递后系统会立即启动 AI 审稿流程：编辑部初审 →
              通读全文并匹配合适的审稿人 → 三位审稿人依次给出结构化意见 →
              主审综合三方意见做出决议。整个过程通常十分钟左右，可以关掉页面，稍后回来查看完整结果。
            </p>
          </div>
        </aside>

        <footer className="flex items-center justify-center gap-3">
          <span className="inline-flex h-11 items-center rounded-8 border border-foreground/80 px-6 text-24 font-medium text-foreground">
            返回投稿管理
          </span>
          <span className="inline-flex h-11 items-center gap-2 rounded-8 bg-brand-red px-[var(--wiki-mock-space-28)] text-24 font-medium text-on-brand">
            前往审稿记录 <ArrowRight className="size-4" />
          </span>
        </footer>
      </article>
    </div>
  );
}

function InfoRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-16 text-faint">{label}</dt>
      <dd
        className={`flex-1 text-24 text-subtle ${emphasized ? "leading-sans" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
