import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Image,
  Loader2,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";

const ARTIFACTS = [
  ["literature-review.md", "Markdown · 18 KB", "preview"],
  ["evidence-matrix.xlsx", "表格 · 42 KB", "preview"],
  ["references.zip", "文件夹 · 打包下载", "download"],
] as const;

/** Claw 一轮回答的交付文件、科研图与右侧预览区。 */
export function WikiEmbedClawArtifactOutput() {
  return (
    <div
      className="grid w-[min(100%,54rem)] overflow-hidden rounded-12 border border-border bg-surface-card lg:grid-cols-[1fr_22rem]"
      aria-hidden
      data-wiki-fixture="claw-artifact-output"
    >
      <main className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 text-12 font-medium text-brand-green">
          <Sparkles className="size-4" /> AI 交付
        </div>
        <p className="mt-2 text-12 leading-paragraph text-subtle">
          已整理关键论点、证据矩阵和可复核的参考文献包。文件交付物与消息摘要分别保存。
        </p>

        <div className="mt-4 overflow-hidden rounded-12 border border-brand-green/30 bg-brand-green-soft">
          {ARTIFACTS.map(([name, meta, action], index) => (
            <div
              key={name}
              className="flex items-center gap-3 border-b border-brand-green/20 p-3 last:border-0"
            >
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 bg-surface-card text-brand-green">
                {index === 0 ? (
                  <FileText className="size-4" />
                ) : index === 1 ? (
                  <FileSpreadsheet className="size-4" />
                ) : (
                  <FolderArchive className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-12 font-medium text-foreground">
                  {name}
                </p>
                <p className="mt-1 text-10 text-faint">{meta}</p>
              </div>
              <span className="inline-flex h-7 items-center gap-1 rounded-4 border border-brand-green/30 bg-surface-card px-2 text-10 text-brand-green">
                {action === "preview" ? (
                  <Eye className="size-3" />
                ) : (
                  <Download className="size-3" />
                )}
                {action === "preview" ? "预览" : "下载"}
              </span>
            </div>
          ))}
        </div>

        <figure className="mt-4 overflow-hidden rounded-12 border border-border">
          <div className="flex items-center justify-between border-b border-border bg-surface-1 px-3 py-2">
            <figcaption className="flex items-center gap-1 text-11 font-medium text-foreground">
              <Image className="size-4 text-brand-amber" /> evidence-flow.svg
            </figcaption>
            <span className="text-10 text-faint">科研绘图 · 可下载 SVG</span>
          </div>
          <div className="grid h-28 grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 bg-surface-card px-4">
            {[
              ["检索", "2,483 篇"],
              ["筛选", "126 篇"],
              ["综合", "18 条证据"],
            ].map(([label, meta], index) => (
              <div key={label} className="contents">
                <div
                  className={
                    index === 1
                      ? "rounded-8 border border-brand-amber bg-brand-amber-soft p-3 text-center"
                      : "rounded-8 border border-brand-green bg-brand-green-soft p-3 text-center"
                  }
                >
                  <p className="text-11 font-medium text-foreground">{label}</p>
                  <p className="mt-1 text-10 text-faint">{meta}</p>
                </div>
                {index < 2 ? (
                  <ArrowRight className="size-4 text-faint" />
                ) : null}
              </div>
            ))}
          </div>
        </figure>
      </main>

      <aside className="min-w-0 bg-surface-1">
        <header className="flex h-11 items-center gap-2 border-b border-border px-3">
          <ArrowLeft className="size-4 text-faint" />
          <span className="min-w-0 flex-1 truncate text-12 font-medium text-foreground">
            evidence-matrix.xlsx
          </span>
          <Download className="size-4 text-faint" />
        </header>
        <div className="p-3">
          <div className="overflow-hidden rounded-8 border border-border bg-surface-card">
            <div className="grid grid-cols-[2rem_1.2fr_1fr] bg-brand-green-soft text-10 font-medium text-foreground">
              <span className="border-r border-border p-2">#</span>
              <span className="border-r border-border p-2">研究</span>
              <span className="p-2">核心发现</span>
            </div>
            {[
              ["1", "Lewis 2020", "检索增强减少知识错误"],
              ["2", "Guu 2020", "预训练阶段接入语料库"],
              ["3", "Izacard 2021", "多文档融合提升问答"],
              ["4", "Gao 2024", "评估需覆盖检索与生成"],
            ].map((row) => (
              <div
                key={row[0]}
                className="grid grid-cols-[2rem_1.2fr_1fr] border-t border-border-hairline text-9 text-subtle"
              >
                {row.map((cell, index) => (
                  <span
                    key={cell}
                    className={index < 2 ? "border-r border-border p-2" : "p-2"}
                  >
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-10 text-faint">
            <span>工作表 1 / 2</span>
            <span>100%</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

const REVIEW_RECORDS = [
  {
    title: "A Multimodal Framework for Early Disease Detection",
    target: "Nature Medicine · Journal",
    status: "审稿中",
    tone: "amber",
    progress: "审稿人 B 正在评议",
    date: "8 月 12 日",
  },
  {
    title: "Responsible Deployment of Clinical Language Models",
    target: "The Lancet Digital Health · Journal",
    status: "已完成",
    tone: "green",
    progress: "建议：大修后重审",
    date: "8 月 9 日",
  },
  {
    title: "人工智能辅助科研写作的证据边界研究",
    target: "博士学位论文 · Thesis",
    status: "草稿",
    tone: "neutral",
    progress: "材料待确认",
    date: "8 月 7 日",
  },
] as const;

/** 智能审稿记录的筛选、状态与行级动作。 */
export function WikiEmbedPeerReviewRecordsList() {
  return (
    <div
      className="w-[min(100%,50rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="peer-review-records-list"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 pt-4">
        <div className="pb-3">
          <p className="text-10 font-medium uppercase text-brand-red">
            Peer Review
          </p>
          <h3 className="mt-1 font-serif text-18 font-medium text-foreground">
            审稿记录
          </h3>
        </div>
        <span className="mb-3 inline-flex h-8 items-center gap-1 rounded-8 bg-brand-red px-3 text-11 font-medium text-on-dark">
          <UploadCloud className="size-4" /> 新建审稿
        </span>
        <nav className="order-last flex w-full gap-4">
          {[
            ["全部", "3"],
            ["待处理", "1"],
            ["进行中", "1"],
            ["已完成", "1"],
          ].map(([label, count], index) => (
            <span
              key={label}
              className={
                index === 0
                  ? "border-b-2 border-brand-red pb-3 text-11 font-medium text-brand-red"
                  : "pb-3 text-11 text-faint"
              }
            >
              {label} <span className="tabular-nums">{count}</span>
            </span>
          ))}
        </nav>
      </header>

      <div className="divide-y divide-border-hairline">
        {REVIEW_RECORDS.map((record) => (
          <article
            key={record.title}
            className="grid gap-3 p-4 md:grid-cols-[1fr_10rem_8rem_auto] md:items-center"
          >
            <div className="min-w-0">
              <p className="line-clamp-1 text-13 font-medium text-foreground">
                {record.title}
              </p>
              <p className="mt-1 text-10 text-faint">{record.target}</p>
            </div>
            <div>
              <span
                className={
                  record.tone === "green"
                    ? "inline-flex items-center gap-1 rounded-pill bg-brand-green-soft px-2 py-1 text-10 text-brand-green"
                    : record.tone === "amber"
                      ? "inline-flex items-center gap-1 rounded-pill bg-brand-amber-soft px-2 py-1 text-10 text-brand-amber"
                      : "inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-1 text-10 text-faint"
                }
              >
                {record.tone === "green" ? (
                  <CheckCircle2 className="size-3" />
                ) : record.tone === "amber" ? (
                  <Loader2 className="size-3" />
                ) : (
                  <FileText className="size-3" />
                )}
                {record.status}
              </span>
              <p className="mt-1 truncate text-10 text-faint">
                {record.progress}
              </p>
            </div>
            <p className="inline-flex items-center gap-1 text-10 text-faint">
              <Clock3 className="size-3" /> {record.date}
            </p>
            <div className="flex items-center justify-end gap-2">
              <span className="inline-flex h-7 items-center gap-1 rounded-4 border border-border px-2 text-10 text-subtle">
                {record.status === "已完成"
                  ? "查看结果"
                  : record.status === "草稿"
                    ? "继续填写"
                    : "查看进度"}
                <ChevronRight className="size-3" />
              </span>
              <MoreHorizontal className="size-4 text-faint" />
            </div>
          </article>
        ))}
      </div>
      <footer className="flex items-center justify-between border-t border-border bg-surface-1 px-4 py-3 text-10 text-faint">
        <span>共 3 条 · 第 1 / 1 页</span>
        <span>失败记录可保留已完成意见并重试</span>
      </footer>
    </div>
  );
}

/** 智能审稿材料确认后的产品内成功回执。 */
export function WikiEmbedPeerReviewSubmitSuccess() {
  return (
    <div
      className="w-[min(100%,38rem)] overflow-hidden rounded-16 border border-border bg-surface-card shadow-raised"
      aria-hidden
      data-wiki-fixture="peer-review-submit-success"
    >
      <div className="bg-brand-green-soft px-6 py-6 text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-pill bg-brand-green text-on-dark">
          <Check className="size-7" />
        </span>
        <h3 className="mt-4 font-serif text-22 font-medium text-foreground">
          材料已确认，AI 评议已启动
        </h3>
        <p className="mx-auto mt-2 max-w-md text-12 leading-paragraph text-subtle">
          这是 Scholay 内部模拟评议回执，不代表稿件已发送给期刊或学校。
        </p>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-12 border border-border">
          {[
            ["稿件标题", "A Multimodal Framework for Early Disease Detection"],
            ["目标期刊", "Nature Medicine"],
            ["评议编号", "PR-20260812-7F3A"],
            ["提交时间", "2026-08-12 14:32 (UTC+8)"],
            ["通讯作者", "Lin Chen · lin.chen@example.edu"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-[6rem_1fr] border-b border-border-hairline last:border-0"
            >
              <span className="bg-surface-1 px-3 py-2 text-10 text-faint">
                {label}
              </span>
              <span className="min-w-0 truncate px-3 py-2 text-11 text-foreground">
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-8 bg-brand-amber-soft p-3">
          <ShieldCheck className="size-4 shrink-0 text-brand-amber" />
          <p className="text-11 leading-paragraph text-subtle">
            系统会依次完成方法论编排、三位 AI
            审稿人与主审报告。可以关闭页面，稍后回到记录查看。
          </p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <span className="inline-flex h-9 items-center justify-center gap-1 rounded-8 border border-border text-11 text-subtle">
            <ArrowLeft className="size-3" /> 返回投稿管理
          </span>
          <span className="inline-flex h-9 items-center justify-center gap-1 rounded-8 bg-brand-red text-11 font-medium text-on-dark">
            前往审稿记录 <ArrowRight className="size-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
