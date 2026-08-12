import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  CloudDownload,
  Download,
  ExternalLink,
  FileText,
  FolderInput,
  Globe2,
  Link2,
  LockKeyhole,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const IMPORT_RESULTS = [
  {
    title: "Large Language Models for Scientific Discovery",
    meta: "Nature · 2025 · OpenAlex",
    status: "可收藏",
  },
  {
    title:
      "Artificial Intelligence for Science in Quantum, Atomistic, and Continuum Systems",
    meta: "Nature · 2023 · Semantic Scholar",
    status: "已有记录",
  },
] as const;

/** 文献导入的统一工作台壳与在线搜索结果。 */
export function WikiEmbedLibraryImportWorkbench() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised"
      aria-hidden
      data-wiki-fixture="library-import-workbench"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-14 font-medium text-foreground">导入文献</h3>
          <p className="mt-1 text-11 text-faint">
            选择来源并核对后加入当前文件夹
          </p>
        </div>
        <X className="size-4 text-faint" />
      </header>

      <div className="flex border-b border-border bg-surface-1 px-4">
        {[
          ["在线搜索", true],
          ["上传 PDF", false],
          ["Zotero", false],
          ["EndNote", false],
        ].map(([label, active]) => (
          <span
            key={String(label)}
            className={
              active
                ? "border-b-2 border-brand-red px-4 py-3 text-12 font-medium text-brand-red"
                : "px-4 py-3 text-12 text-faint"
            }
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_13rem]">
        <main className="min-w-0 p-4">
          <div className="flex h-10 items-center gap-2 rounded-8 border border-border px-3">
            <Search className="size-4 text-faint" />
            <span className="min-w-0 flex-1 truncate text-13 text-foreground">
              AI for scientific discovery
            </span>
            <span className="inline-flex h-7 items-center rounded-4 bg-foreground px-3 text-11 font-medium text-on-dark">
              搜索
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between text-11 text-faint">
            <span>多来源结果按到达顺序合并</span>
            <span className="inline-flex items-center gap-1">
              <CircleCheck className="size-3 text-brand-green" /> 3 个来源已完成
            </span>
          </div>

          <div className="mt-2 divide-y divide-border-hairline rounded-8 border border-border">
            {IMPORT_RESULTS.map((paper, index) => (
              <div key={paper.title} className="flex gap-3 p-3">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 bg-brand-green-soft text-brand-green">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-13 font-medium leading-sans text-foreground">
                    {paper.title}
                  </p>
                  <p className="mt-1 text-11 text-faint">{paper.meta}</p>
                </div>
                <span
                  className={
                    index === 0
                      ? "inline-flex h-7 shrink-0 items-center gap-1 rounded-4 bg-brand-red px-2 text-11 font-medium text-on-dark"
                      : "inline-flex h-7 shrink-0 items-center gap-1 rounded-4 bg-surface-2 px-2 text-11 text-faint"
                  }
                >
                  {index === 0 ? (
                    <Plus className="size-3" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  {paper.status}
                </span>
              </div>
            ))}
          </div>
        </main>

        <aside className="border-t border-border bg-surface-1 p-4 md:border-l md:border-t-0">
          <p className="text-11 font-medium text-foreground">导入到</p>
          <div className="mt-2 flex items-center gap-2 rounded-8 border border-border bg-surface-card px-3 py-2 text-12 text-subtle">
            <FolderInput className="size-4 text-brand-amber" />
            默认文件夹
            <ChevronDown className="ml-auto size-3 text-faint" />
          </div>
          <div className="mt-4 rounded-8 bg-brand-amber-soft p-3 text-11 leading-paragraph text-subtle">
            PDF 上传后会先识别元数据；只有确认候选或选择自由文件后才写入文献集。
          </div>
          <p className="mt-4 inline-flex items-center gap-1 text-11 text-brand-red">
            <ArrowRight className="size-3" /> 前往完整检索页
          </p>
        </aside>
      </div>
    </div>
  );
}

/** 文献列表进入选择模式后的批量工具条与删除确认。 */
export function WikiEmbedLibraryBulkActions() {
  return (
    <div
      className="w-[min(100%,48rem)] space-y-4"
      aria-hidden
      data-wiki-fixture="library-bulk-actions"
    >
      <div className="flex flex-wrap items-center gap-2 rounded-12 border border-border bg-surface-card p-3 shadow-raised">
        <span className="inline-flex size-7 items-center justify-center rounded-4 bg-brand-red text-on-dark">
          <Check className="size-4" />
        </span>
        <span className="mr-2 text-13 font-medium text-foreground">
          已选择 3 篇
        </span>
        <span className="inline-flex h-8 items-center gap-2 rounded-8 border border-border px-3 text-12 text-subtle">
          <FolderInput className="size-4" /> 移动到
          <ChevronDown className="size-3" />
        </span>
        <span className="inline-flex h-8 items-center gap-2 rounded-8 border border-border px-3 text-12 text-subtle">
          <CloudDownload className="size-4" /> 导出引用
        </span>
        <span className="inline-flex h-8 items-center gap-2 rounded-8 border border-brand-red/30 px-3 text-12 text-brand-red">
          <Trash2 className="size-4" /> 删除
        </span>
        <span className="ml-auto inline-flex size-8 items-center justify-center rounded-8 text-faint">
          <X className="size-4" />
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
        <section className="overflow-hidden rounded-12 border border-border bg-surface-card">
          {[
            "RAG for Scientific Literature",
            "Evidence-Grounded Research Agents",
            "Evaluation of AI Scientists",
          ].map((title) => (
            <div
              key={title}
              className="flex items-center gap-3 border-b border-border-hairline p-3 last:border-0"
            >
              <span className="inline-flex size-4 items-center justify-center rounded-4 border border-brand-red bg-brand-red text-on-dark">
                <Check className="size-3" />
              </span>
              <FileText className="size-4 text-faint" />
              <span className="min-w-0 flex-1 truncate text-12 text-foreground">
                {title}
              </span>
            </div>
          ))}
        </section>

        <section className="rounded-12 border border-brand-red/30 bg-surface-card p-4 shadow-raised">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-danger-soft text-brand-red">
              <AlertTriangle className="size-4" />
            </span>
            <div>
              <h3 className="text-13 font-medium text-foreground">
                删除 3 篇论文？
              </h3>
              <p className="mt-1 text-11 leading-paragraph text-subtle">
                会移除文献信息和已上传 PDF；此操作不可恢复。
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <span className="inline-flex h-8 items-center rounded-8 border border-border px-3 text-11 text-subtle">
              取消
            </span>
            <span className="inline-flex h-8 items-center rounded-8 bg-brand-red px-3 text-11 font-medium text-on-dark">
              确认删除
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

const METADATA_FIELDS = [
  ["标题", "Large Language Models for Scientific Discovery"],
  ["作者", "Jane Doe; Lin Chen; Mateo Silva"],
  ["期刊", "Nature Machine Intelligence"],
  ["年份", "2025"],
] as const;

/** 文献基本信息与 PDF 文件维护的双态工作台。 */
export function WikiEmbedLibraryMaintenanceWorkbench() {
  return (
    <div
      className="w-[min(100%,52rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised"
      aria-hidden
      data-wiki-fixture="library-maintenance-workbench"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-14 font-medium text-foreground">管理文献</h3>
          <p className="text-11 text-faint">
            编辑显示信息，或替换这条记录的 PDF
          </p>
        </div>
        <div className="flex gap-1 rounded-8 bg-surface-1 p-1">
          <span className="rounded-4 bg-surface-card px-3 py-1 text-11 font-medium text-foreground shadow-raised">
            基本信息
          </span>
          <span className="px-3 py-1 text-11 text-faint">PDF 文件</span>
          <span className="px-3 py-1 text-11 text-faint">重新关联</span>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_1fr]">
        <section className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <p className="text-12 font-medium text-foreground">基本信息</p>
            <span className="rounded-pill bg-brand-amber-soft px-2 py-1 text-10 text-brand-amber">
              2 处修改 · 未保存
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {METADATA_FIELDS.map(([label, value], index) => (
              <label key={label} className="block">
                <span className="text-10 font-medium text-faint">{label}</span>
                <span
                  className={
                    index < 2
                      ? "mt-1 block rounded-8 border border-brand-amber/50 bg-brand-amber-soft px-3 py-2 text-11 text-foreground"
                      : "mt-1 block rounded-8 border border-border px-3 py-2 text-11 text-subtle"
                  }
                >
                  {value}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-10 text-faint">
              清空字段后会回落到在线论文信息
            </span>
            <span className="inline-flex h-8 items-center gap-1 rounded-8 bg-foreground px-3 text-11 font-medium text-on-dark">
              <PencilLine className="size-3" /> 保存修改
            </span>
          </div>
        </section>

        <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <section className="border-b border-border bg-surface-1 p-4 sm:border-b-0 sm:border-r lg:border-b lg:border-r-0 xl:border-b-0 xl:border-r">
            <p className="text-12 font-medium text-foreground">实时预览</p>
            <article className="mt-3 rounded-8 border border-border bg-surface-card p-3">
              <span className="inline-flex items-center gap-1 rounded-4 bg-brand-green-soft px-2 py-1 text-10 text-brand-green">
                <Globe2 className="size-3" /> 在线关联
              </span>
              <h4 className="mt-3 font-serif text-14 font-medium leading-display text-foreground">
                Large Language Models for Scientific Discovery
              </h4>
              <p className="mt-2 text-11 text-subtle">
                Jane Doe 等 · Nature Machine Intelligence · 2025
              </p>
              <p className="mt-3 text-10 text-faint">预览随输入实时更新</p>
            </article>
          </section>

          <section className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-12 font-medium text-foreground">PDF 文件</p>
              <span className="inline-flex items-center gap-1 text-10 text-brand-green">
                <CircleCheck className="size-3" /> 已上传
              </span>
            </div>
            <div className="mt-3 rounded-8 border border-border p-3">
              <div className="flex items-start gap-2">
                <FileText className="size-4 shrink-0 text-brand-red" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-11 font-medium text-foreground">
                    manuscript-final.pdf
                  </p>
                  <p className="mt-1 text-10 text-faint">3.8 MB · 可在线预览</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-10">
                <span className="inline-flex h-7 items-center justify-center gap-1 rounded-4 border border-border text-subtle">
                  <Upload className="size-3" /> 替换文件
                </span>
                <span className="inline-flex h-7 items-center justify-center gap-1 rounded-4 border border-border text-subtle">
                  <Link2 className="size-3" /> 粘贴链接
                </span>
              </div>
              <p className="mt-3 inline-flex items-center gap-1 text-10 text-brand-red">
                <Trash2 className="size-3" /> 移除 PDF，保留文献信息
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** 文献重新关联或取消关联的独立工作面。 */
export function WikiEmbedLibraryRelinkWorkbench() {
  return (
    <div
      className="w-[min(100%,46rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised"
      aria-hidden
      data-wiki-fixture="library-relink-workbench"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-14 font-medium text-foreground">
            重新关联在线论文
          </h3>
          <p className="mt-1 text-11 text-faint">
            替换来源快照前需要明确选择并确认
          </p>
        </div>
        <X className="size-4 text-faint" />
      </header>

      <div className="p-4">
        <section className="flex items-start gap-3 rounded-8 border border-border bg-surface-1 p-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 bg-brand-green-soft text-brand-green">
            <Link2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-10 font-medium text-faint">当前关联</p>
            <p className="mt-1 line-clamp-1 text-12 font-medium text-foreground">
              Large Language Models for Scientific Discovery
            </p>
            <p className="mt-1 text-10 text-faint">
              OpenAlex · DOI 10.1038/s42256-025-00001
            </p>
          </div>
          <span className="text-10 text-brand-red">取消关联</span>
        </section>

        <div className="mt-4 flex gap-1 border-b border-border">
          {["综合", "OpenAlex", "Semantic Scholar", "PubMed"].map(
            (label, index) => (
              <span
                key={label}
                className={
                  index === 0
                    ? "border-b-2 border-brand-red px-3 py-2 text-11 font-medium text-brand-red"
                    : "px-3 py-2 text-11 text-faint"
                }
              >
                {label}
              </span>
            ),
          )}
        </div>

        <div className="mt-3 flex h-9 items-center gap-2 rounded-8 border border-border px-3">
          <Search className="size-4 text-faint" />
          <span className="min-w-0 flex-1 truncate text-11 text-foreground">
            Large language models scientific discovery
          </span>
          <span className="rounded-4 bg-foreground px-2 py-1 text-10 text-on-dark">
            搜索
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {[
            [
              "Large Language Models for Scientific Discovery",
              "Nature Machine Intelligence · 2025",
              true,
            ],
            [
              "Large Language Models as Scientific Assistants",
              "Patterns · 2024",
              false,
            ],
          ].map(([title, meta, selected]) => (
            <div
              key={String(title)}
              className={
                selected
                  ? "flex items-start gap-3 rounded-8 border border-brand-green bg-brand-green-soft p-3"
                  : "flex items-start gap-3 rounded-8 border border-border p-3"
              }
            >
              <span
                className={
                  selected
                    ? "inline-flex size-4 items-center justify-center rounded-pill bg-brand-green text-on-dark"
                    : "size-4 rounded-pill border border-border"
                }
              >
                {selected ? <Check className="size-3" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-12 font-medium text-foreground">
                  {title}
                </p>
                <p className="mt-1 text-10 text-faint">{meta}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-border bg-surface-1 px-4 py-3">
        <span className="inline-flex items-center gap-1 text-10 text-brand-amber">
          <AlertTriangle className="size-3" /> 若目标已收藏，会合并到已有记录
        </span>
        <div className="flex gap-2">
          <span className="inline-flex h-8 items-center rounded-8 border border-border px-3 text-11 text-subtle">
            取消
          </span>
          <span className="inline-flex h-8 items-center gap-1 rounded-8 bg-brand-red px-3 text-11 font-medium text-on-dark">
            <RefreshCw className="size-3" /> 替换关联
          </span>
        </div>
      </footer>
    </div>
  );
}

/** 分享接收页的论文、期刊与受保护合集三种稳定变体。 */
export function WikiEmbedShareReceiveVariants() {
  return (
    <div
      className="grid w-[min(100%,54rem)] gap-3 lg:grid-cols-3"
      aria-hidden
      data-wiki-fixture="share-receive-variants"
    >
      <ShareVariantCard
        eyebrow="论文详情"
        icon={<FileText className="size-5" />}
        tone="green"
        title="Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
        meta="Patrick Lewis 等 · NeurIPS 2020"
        body="包含标题、作者、摘要与来源，可在 Scholay 打开或收藏到个人文献集。"
        action="收藏到文献集"
      />
      <ShareVariantCard
        eyebrow="期刊详情"
        icon={<BookOpen className="size-5" />}
        tone="amber"
        title="Nature Machine Intelligence"
        meta="SCI · JCR Q1 · IF 14.4"
        body="实时展示分区、影响指标、出版信息和年度趋势；期刊分享不使用提取码。"
        action="在 Scholay 打开"
      />

      <article className="overflow-hidden rounded-16 border border-border bg-surface-card">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <LockKeyhole className="size-4 text-brand-red" />
          <span className="text-12 font-medium text-foreground">
            受保护的文献合集
          </span>
        </header>
        <div className="p-4">
          <p className="text-10 text-faint">YAYA 分享 · 共 12 篇</p>
          <h3 className="mt-2 font-serif text-16 font-medium text-foreground">
            扩散模型关键论文
          </h3>
          <p className="mt-2 text-11 leading-paragraph text-subtle">
            预览前几篇；打开全部或转存时才请求提取码。
          </p>
          <div className="mt-4 rounded-12 border border-brand-red/30 bg-danger-soft p-3">
            <p className="flex items-center gap-2 text-11 font-medium text-foreground">
              <ShieldCheck className="size-4 text-brand-red" /> 输入 4 位提取码
            </p>
            <div className="mt-3 flex gap-2">
              <span className="flex h-9 flex-1 items-center rounded-8 border border-brand-red bg-surface-card px-3 font-mono text-12 text-foreground">
                8K2M
              </span>
              <span className="inline-flex h-9 items-center rounded-8 bg-brand-red px-3 text-11 font-medium text-on-dark">
                确认
              </span>
            </div>
            <p className="mt-2 text-10 text-brand-red">
              示例错误：提取码不正确，请重新输入
            </p>
          </div>
        </div>
        <footer className="grid grid-cols-2 gap-2 border-t border-border p-3">
          <span className="inline-flex h-8 items-center justify-center gap-1 rounded-8 border border-border text-10 text-subtle">
            <ExternalLink className="size-3" /> 打开合集
          </span>
          <span className="inline-flex h-8 items-center justify-center gap-1 rounded-8 bg-brand-red text-10 font-medium text-on-dark">
            <Download className="size-3" /> 收藏合集
          </span>
        </footer>
      </article>
    </div>
  );
}

function ShareVariantCard({
  eyebrow,
  icon,
  tone,
  title,
  meta,
  body,
  action,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  tone: "green" | "amber";
  title: string;
  meta: string;
  body: string;
  action: string;
}) {
  return (
    <article className="overflow-hidden rounded-16 border border-border bg-surface-card">
      <header className="border-b border-border px-4 py-3 text-12 font-medium text-foreground">
        {eyebrow}
      </header>
      <div className="p-4">
        <span
          className={
            tone === "green"
              ? "inline-flex size-10 items-center justify-center rounded-8 bg-brand-green-soft text-brand-green"
              : "inline-flex size-10 items-center justify-center rounded-8 bg-brand-amber-soft text-brand-amber"
          }
        >
          {icon}
        </span>
        <h3 className="mt-3 line-clamp-3 font-serif text-16 font-medium leading-display text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-10 text-faint">{meta}</p>
        <p className="mt-3 text-11 leading-paragraph text-subtle">{body}</p>
      </div>
      <footer className="border-t border-border p-3">
        <span className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-8 bg-foreground text-10 font-medium text-on-dark">
          {action} <ArrowRight className="size-3" />
        </span>
      </footer>
    </article>
  );
}
