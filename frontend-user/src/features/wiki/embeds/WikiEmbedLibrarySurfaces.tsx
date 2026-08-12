import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  History,
  Link2,
  PencilLine,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

const IMPORT_RESULTS = [
  [
    "Large Language Models for Scientific Discovery",
    "Jane Doe, Lin Chen",
    "Nature Machine Intelligence · 2025 · 638 引用",
    "G",
    false,
  ],
  [
    "Artificial Intelligence for Science in Quantum, Atomistic, and Continuum Systems",
    "Kyle Mills et al.",
    "Nature · 2023 · 1,842 引用",
    "D",
    true,
  ],
  [
    "Scientific Discovery in the Age of Artificial Intelligence",
    "Hanchen Wang et al.",
    "Nature · 2023 · 2,104 引用",
    "G",
    false,
  ],
] as const;

/** PaperWorkbenchDialog 添加语境 + OnlineSearchTab。 */
export function WikiEmbedLibraryImportWorkbench() {
  return (
    <div
      className="flex h-[40rem] max-h-[80dvh] w-[min(100%,60rem)] flex-col overflow-hidden rounded-8 border border-border bg-background shadow-overlay"
      aria-hidden
      data-wiki-fixture="library-import-workbench"
    >
      <WorkbenchHeader
        tone="neutral"
        title="添加文献"
        description="通过在线搜索或上传 PDF，把文献添加到「我的文献集」"
      />
      <WorkbenchTabs
        active="在线搜索"
        tabs={["在线搜索", "上传 PDF", "Zotero · 即将", "EndNote · 即将"]}
      />
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border-hairline px-6">
        <Search className="size-4 shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 text-12 font-medium text-foreground">
          AI for scientific discovery
        </span>
        <X className="size-3 text-faint" />
      </div>
      <ul className="min-h-0 flex-1 overflow-hidden">
        {IMPORT_RESULTS.map(
          ([title, authors, meta, source, favorited], index) => (
            <li
              key={title}
              className={
                index === 0
                  ? "flex items-center gap-2.5 bg-surface-1 px-6 py-2.5"
                  : "flex items-center gap-2.5 px-6 py-2.5"
              }
            >
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-4 border border-border bg-background">
                <FileText className="size-3.5 text-subtle" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-12 font-medium text-foreground">
                  {title}
                </p>
                <p className="mt-1 flex items-center gap-2 truncate text-12 text-subtle">
                  <SourceLetter>{source}</SourceLetter>
                  <span className="truncate">{authors}</span>
                  <span>· {meta}</span>
                </p>
              </div>
              {favorited ? (
                <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-4 border border-brand-amber px-2 text-12 font-medium text-brand-amber">
                  完善信息
                </span>
              ) : null}
              <span
                className={
                  favorited
                    ? "inline-flex size-8 shrink-0 items-center justify-center rounded-4 bg-brand-red text-on-brand"
                    : "inline-flex size-8 shrink-0 items-center justify-center rounded-4 border border-border text-faint"
                }
              >
                {favorited ? (
                  <Check className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
              </span>
            </li>
          ),
        )}
      </ul>
      <WorkbenchFooter
        hint={
          <>
            收藏到{" "}
            <span className="font-medium text-foreground">「我的文献集」</span>
          </>
        }
      >
        <FooterButton>完成</FooterButton>
      </WorkbenchFooter>
    </div>
  );
}

/** LibraryBulkToolbar 的删除确认态：工具条留在遮罩下方。 */
export function WikiEmbedLibraryBulkActions() {
  return (
    <div
      className="relative h-[17rem] w-[min(100%,50rem)] overflow-hidden rounded-8 border border-border bg-background"
      aria-hidden
      data-wiki-fixture="library-bulk-actions"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border-hairline px-4">
        <span className="text-12 font-medium tabular-nums text-foreground">
          已选 3 项
        </span>
        <span className="text-12 text-faint">（共 28 项）</span>
        <span className="inline-flex h-7 items-center rounded-4 border border-border px-2.5 text-12 text-subtle">
          全选
        </span>
        <span className="inline-flex h-7 items-center gap-1 rounded-4 border border-border px-2.5 text-12 font-medium text-subtle">
          <ArrowRightLeft className="size-3" /> 转移
        </span>
        <span className="inline-flex h-7 items-center gap-1 rounded-4 border border-brand-red bg-brand-red px-2.5 text-12 font-medium text-on-brand">
          <Trash2 className="size-3" /> 删除
        </span>
        <span className="inline-flex size-7 items-center justify-center rounded-4 border border-border text-faint">
          <X className="size-3.5" />
        </span>
      </div>
      <div className="space-y-0 px-4 py-2">
        {[
          "RAG for Scientific Literature",
          "Evidence-Grounded Research Agents",
          "Evaluation of AI Scientists",
        ].map((title) => (
          <div
            key={title}
            className="flex items-center gap-3 border-b border-border-hairline px-2 py-2.5 last:border-0"
          >
            <span className="inline-flex size-4 items-center justify-center rounded-4 bg-brand-red text-on-brand">
              <Check className="size-3" />
            </span>
            <FileText className="size-4 text-faint" />
            <span className="truncate text-12 text-foreground">{title}</span>
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex items-center justify-center bg-foreground/25 p-4">
        <section className="w-[22.5rem] overflow-hidden rounded-8 border border-border bg-background shadow-overlay">
          <header className="flex h-13 items-center gap-2 border-b border-border-hairline px-4 pr-12">
            <AlertTriangle className="size-4 shrink-0 text-brand-red" />
            <h3 className="text-12 font-medium text-foreground">
              删除 3 篇论文？
            </h3>
          </header>
          <p className="px-4 py-4 text-12 leading-paragraph text-subtle">
            将从文献集永久移除选中的 3 篇论文。此操作不可撤销。
          </p>
          <footer className="flex h-13 items-center justify-end gap-2 border-t border-border-hairline px-4">
            <span className="inline-flex h-7 items-center rounded-4 border border-border px-3 text-12 text-subtle">
              取消
            </span>
            <span className="inline-flex h-7 items-center rounded-4 bg-brand-red px-3 text-12 font-medium text-on-brand">
              确认删除
            </span>
          </footer>
        </section>
      </div>
    </div>
  );
}

const METADATA_FIELDS = [
  ["标题", "Large Language Models for Scientific Discovery", "full"],
  ["作者", "Jane Doe; Lin Chen; Mateo Silva", "full"],
  ["期刊 / 会议", "Nature Machine Intelligence", "wide"],
  ["年份", "2025", "narrow"],
  ["DOI", "10.1038/s42256-025-00001", "full"],
] as const;

/** 管理语境只冻结 MetadataPanel，不再把 PDF 子态拼到同一画面。 */
export function WikiEmbedLibraryMaintenanceWorkbench() {
  return (
    <div
      className="flex h-[40rem] max-h-[82dvh] w-[min(100%,60rem)] flex-col overflow-hidden rounded-8 border border-border bg-background shadow-overlay"
      aria-hidden
      data-wiki-fixture="library-maintenance-workbench"
    >
      <WorkbenchHeader
        tone="amber"
        title="论文信息管理"
        description="Large Language Models for Scientific Discovery"
      />
      <WorkbenchTabs active="基本信息" tabs={["基本信息", "PDF", "在线关联"]} />
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_21.25rem] overflow-hidden">
        <section className="flex min-h-0 flex-col overflow-hidden border-r border-border-hairline">
          <div className="flex items-center justify-end border-b border-border px-6 pb-2 pt-3">
            <span className="inline-flex items-center gap-1 text-12 text-faint">
              <History className="size-3" /> 2 处修改 · 未保存
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
            <div className="space-y-3">
              <div className="grid grid-cols-[2fr_1fr] gap-3">
                {METADATA_FIELDS.slice(0, 2).map(([label, value]) => (
                  <StaticField
                    key={label}
                    label={label}
                    value={value}
                    required
                  />
                ))}
              </div>
              <div className="grid grid-cols-[2fr_1fr] gap-3">
                {METADATA_FIELDS.slice(2, 4).map(([label, value], index) => (
                  <StaticField
                    key={label}
                    label={label}
                    value={value}
                    required={index === 1}
                  />
                ))}
              </div>
              <StaticField
                label={METADATA_FIELDS[4][0]}
                value={METADATA_FIELDS[4][1]}
                mono
              />
              <div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-12 font-medium text-subtle">摘要</span>
                  <span className="text-12 text-faint">
                    312 / 1500 · 支持 Markdown
                  </span>
                </div>
                <div className="mt-1 min-h-[9rem] rounded-4 border border-border bg-background px-3 py-2 font-mono text-12 leading-paragraph text-subtle">
                  Foundation models are increasingly used to support scientific
                  discovery. This paper reviews how language models connect
                  literature evidence, experiment design, and validation while
                  keeping the original sources inspectable.
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex flex-col overflow-hidden bg-surface-1/40">
          <header className="flex items-center justify-between gap-2 border-b border-border-hairline px-4 pb-3 pt-4">
            <span className="inline-flex items-center gap-2 text-12 font-medium text-foreground">
              <Eye className="size-3.5 text-faint" /> 实时预览
            </span>
            <span className="inline-flex items-center gap-1 rounded-pill bg-brand-green/10 px-2 py-1 text-12 font-medium text-brand-green">
              <CheckCircle2 className="size-2.5" /> 已同步
            </span>
          </header>
          <div className="space-y-3 px-4 py-4">
            <article className="space-y-2 rounded-8 border border-border bg-background p-3">
              <h4 className="text-12 font-medium leading-paragraph text-foreground">
                Large Language Models for Scientific Discovery
              </h4>
              <p className="text-12 text-subtle">
                Jane Doe, Lin Chen, Mateo Silva
              </p>
              <div className="space-y-1 border-t border-border-hairline pt-2 text-12">
                <PreviewRow label="收录">
                  Nature Machine Intelligence
                </PreviewRow>
                <PreviewRow label="年份">2025</PreviewRow>
                <PreviewRow label="DOI">10.1038/s42256-025-00001</PreviewRow>
              </div>
              <div className="border-t border-border-hairline pt-2">
                <p className="mb-1 text-12 font-medium uppercase text-faint">
                  摘要
                </p>
                <p className="line-clamp-6 text-12 leading-paragraph text-subtle">
                  Foundation models are increasingly used to support scientific
                  discovery. This paper reviews how language models connect
                  literature evidence, experiment design, and validation while
                  keeping original sources inspectable.
                </p>
              </div>
            </article>
            <p className="flex items-start gap-2 text-12 text-subtle">
              <Sparkles className="mt-1 size-3.5 shrink-0 text-brand-amber" />
              预览随输入实时更新 · 保存后立即更新文献卡
            </p>
          </div>
        </aside>
      </div>
      <WorkbenchFooter
        hint={
          <>
            标 <span className="text-brand-red">*</span> 为必填 ·
            清空某项并保存，该项会恢复为在线论文的信息
          </>
        }
      >
        <FooterButton borderless>取消</FooterButton>
        <FooterButton>
          <RotateCcw className="size-3.5" /> 重置
        </FooterButton>
        <FooterButton primary="green">
          <Save className="size-3.5" /> 保存修改
        </FooterButton>
      </WorkbenchFooter>
    </div>
  );
}

/** 管理语境的 RelinkPanel 已关联、已选候选态。 */
export function WikiEmbedLibraryRelinkWorkbench() {
  return (
    <div
      className="flex h-[40rem] max-h-[82dvh] w-[min(100%,60rem)] flex-col overflow-hidden rounded-8 border border-border bg-background shadow-overlay"
      aria-hidden
      data-wiki-fixture="library-relink-workbench"
    >
      <WorkbenchHeader
        tone="amber"
        title="论文信息管理"
        description="Large Language Models for Scientific Discovery"
      />
      <WorkbenchTabs active="在线关联" tabs={["基本信息", "PDF", "在线关联"]} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="px-6 pt-4">
          <section className="flex items-start gap-3 rounded-8 border border-border-hairline bg-surface-1 px-4 py-2.5">
            <span className="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-4 border border-border bg-background">
              <Link2 className="size-3.5 text-brand-amber" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-12 font-medium uppercase text-faint">
                  当前关联
                </span>
                <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 font-medium text-subtle">
                  Discovery
                </span>
              </div>
              <p className="mt-1 truncate text-12 font-medium text-foreground">
                Large Language Models for Scientific Discovery
              </p>
              <p className="mt-1 text-12 text-faint">
                Nature Machine Intelligence · 2025 · DOI
                10.1038/s42256-025-00001
              </p>
            </div>
          </section>
        </div>

        <div className="mt-3 flex items-center gap-1 border-b border-border px-6">
          {[
            ["Graph", "18"],
            ["Discovery", "12"],
            ["Medicine", "4"],
          ].map(([label, count], index) => (
            <span
              key={label}
              className={
                index === 0
                  ? "relative inline-flex h-9 items-center gap-2 px-3 text-12 font-medium text-brand-amber"
                  : "inline-flex h-9 items-center gap-2 px-3 text-12 font-medium text-subtle"
              }
            >
              {label}
              <span
                className={
                  index === 0
                    ? "inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand-amber px-1 text-12 text-foreground"
                    : "inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-surface-2 px-1 text-12 text-subtle"
                }
              >
                {count}
              </span>
              {index === 0 ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-pill bg-brand-amber" />
              ) : null}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 px-6 pb-3 pt-4">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-8 border border-border bg-background px-3">
            <Search className="size-3.5 shrink-0 text-subtle" />
            <span className="min-w-0 flex-1 truncate text-12 text-foreground">
              Large language models scientific discovery
            </span>
            <span className="shrink-0 font-mono text-12 text-faint">
              DOI: 10.1038/s42256-025-00001
            </span>
          </div>
          <span className="inline-flex h-10 items-center gap-2 rounded-8 border border-brand-amber px-3 text-12 font-medium text-brand-amber">
            <RefreshCw className="size-3.5" /> 重新检索
          </span>
        </div>

        <div className="px-6 pb-4">
          <p className="mb-3 flex items-center gap-2 text-12 text-subtle">
            <Check className="size-3.5 text-brand-green" /> 已从
            <span className="font-medium text-foreground">Graph</span> 找到
            <span className="font-medium text-foreground">18</span> 条候选 ·
            按相关度排序
          </p>
          <ul className="space-y-2">
            {[
              [
                "Large Language Models for Scientific Discovery",
                "Jane Doe, Lin Chen, Mateo Silva",
                "Nature Machine Intelligence · 2025 · DOI 10.1038/s42256-025-00001",
                true,
              ],
              [
                "Large Language Models as Scientific Assistants",
                "A. Patel, M. Wang",
                "Patterns · 2024 · DOI 10.1016/j.patter.2024.100901",
                false,
              ],
            ].map(([title, authors, meta, selected]) => (
              <li
                key={String(title)}
                className={
                  selected
                    ? "flex items-start gap-3 rounded-8 border-2 border-brand-amber bg-brand-amber-soft/40 px-4 py-3"
                    : "flex items-start gap-3 rounded-8 border-2 border-border px-4 py-3"
                }
              >
                <span
                  className={
                    selected
                      ? "mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-pill border-2 border-brand-amber bg-brand-amber text-foreground"
                      : "mt-1 size-5 shrink-0 rounded-pill border-2 border-border bg-background"
                  }
                >
                  {selected ? <Check className="size-3" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-12 font-medium text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 truncate text-12 text-subtle">{authors}</p>
                  <p className="mt-1 text-12 text-faint">{meta}</p>
                </div>
                <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 font-medium text-subtle">
                  Graph
                </span>
                {selected ? (
                  <span className="inline-flex items-center gap-1 rounded-4 bg-brand-amber px-2 py-1 text-12 font-medium text-foreground">
                    <Check className="size-3" /> 已选
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <WorkbenchFooter hint="关联后，你编辑过的内容和已上传的 PDF 都会保留">
        <FooterButton borderless>取消</FooterButton>
        <FooterButton primary="amber">
          <Check className="size-3.5" /> 替换关联
        </FooterButton>
      </WorkbenchFooter>
    </div>
  );
}

/** SharedReceivePage 的受保护合集提取码弹层单态。 */
export function WikiEmbedShareReceiveVariants() {
  return (
    <div
      className="w-[22.5rem] max-w-full"
      aria-hidden
      data-wiki-fixture="share-receive-variants"
    >
      <SharePhone title="文献合集">
        <div className="min-h-0 flex-1 overflow-hidden px-4 pt-4">
          <ShareBanner initial="Y" neutral>
            <span className="font-medium">YAYA</span>
            <span className="text-subtle"> 给你分享了一个文献合集</span>
            <span className="mt-1 block text-12 text-faint">
              收藏后可在你的文献库随时查看
            </span>
          </ShareBanner>
          <div className="mt-4 flex items-start gap-3">
            <span className="flex h-14 w-12 shrink-0 flex-col gap-1 rounded-4 border border-border bg-surface-1 p-2">
              <span className="text-12 font-medium text-faint">合集</span>
              <span className="mt-1 h-1 w-full rounded-pill bg-border-strong" />
              <span className="h-1 w-3/4 rounded-pill bg-border" />
              <span className="h-1 w-full rounded-pill bg-border" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-16 font-medium leading-display text-foreground">
                扩散模型关键论文
              </h3>
              <p className="mt-2 flex flex-wrap items-center gap-1 text-12 text-subtle">
                <FileText className="size-3" /> 12 篇文献 ·{" "}
                <UsersRound className="size-3" /> 35 位作者 · 更新于 2026-08
              </p>
            </div>
          </div>
          <div className="mb-1 mt-4 flex items-center justify-between">
            <span className="text-14 font-medium text-foreground">
              合集内文献
            </span>
            <span className="text-12 text-faint">按被引量排序</span>
          </div>
          {[
            [
              "Denoising Diffusion Probabilistic Models",
              "Ho 等 · NeurIPS 2020",
              "18,204",
            ],
            [
              "High-Resolution Image Synthesis with Latent Diffusion Models",
              "Rombach 等 · CVPR 2022",
              "12,891",
            ],
            [
              "Score-Based Generative Modeling through SDEs",
              "Song 等 · ICLR 2021",
              "7,420",
            ],
          ].map(([title, meta, cites], index) => (
            <div
              key={title}
              className={
                index > 0
                  ? "flex gap-3 border-t border-border-hairline py-3"
                  : "flex gap-3 py-3"
              }
            >
              <span className="w-5 shrink-0 text-12 font-medium tabular-nums text-faint">
                0{index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-12 font-medium leading-display text-foreground">
                  {title}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2 text-12 text-faint">
                  <span className="truncate">{meta}</span>
                  <span className="flex shrink-0 items-center gap-1 font-medium text-brand-red">
                    <Quote className="size-3" />
                    {cites}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <ShareFooter secondary="打开" primary="登录后收藏" tall />
        <div className="absolute inset-0 flex items-end bg-foreground/35">
          <section className="w-full rounded-t-16 bg-background p-4 pb-8 shadow-overlay">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-14 font-medium text-foreground">
                请输入提取码
              </h3>
              <X className="size-5 text-faint" />
            </div>
            <p className="mb-4 text-12 text-subtle">
              输入提取码后即可查看合集的全部文献
            </p>
            <div className="flex h-12 items-center justify-center rounded-8 border border-border bg-background font-mono text-16 text-faint">
              请输入提取码
            </div>
            <span className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-8 bg-brand-red text-12 font-medium text-on-brand opacity-50">
              确认
            </span>
          </section>
        </div>
      </SharePhone>
    </div>
  );
}

function WorkbenchHeader({
  tone,
  title,
  description,
}: {
  tone: "neutral" | "amber";
  title: string;
  description: string;
}) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-hairline px-6 pb-3 pt-4">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={
            tone === "amber"
              ? "inline-flex size-9 shrink-0 items-center justify-center rounded-4 bg-brand-amber-soft text-brand-amber"
              : "inline-flex size-9 shrink-0 items-center justify-center rounded-4 bg-surface-2 text-foreground"
          }
        >
          {tone === "amber" ? (
            <PencilLine className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <h3 className="text-12 font-medium text-foreground">{title}</h3>
          <p className="mt-1 truncate text-12 text-subtle">{description}</p>
        </div>
      </div>
      <X className="size-4 text-faint" />
    </header>
  );
}

function WorkbenchTabs({ active, tabs }: { active: string; tabs: string[] }) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-6">
      {tabs.map((tab) => {
        const selected = tab === active;
        const [label, suffix] = tab.split(" · ");
        return (
          <span
            key={tab}
            className={
              selected
                ? "relative inline-flex h-10 items-center gap-2 px-3 text-12 font-medium text-brand-amber"
                : "inline-flex h-10 items-center gap-2 px-3 text-12 font-medium text-subtle"
            }
          >
            {label}
            {suffix ? (
              <span className="rounded-pill bg-brand-amber px-1 py-1 text-12 font-medium text-foreground">
                {suffix}
              </span>
            ) : null}
            {selected ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-pill bg-brand-amber" />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function WorkbenchFooter({
  hint,
  children,
}: {
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border-hairline bg-surface-1 px-6 py-3">
      <span className="flex min-w-0 items-center gap-1 text-12 text-subtle">
        {hint}
      </span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </footer>
  );
}

function FooterButton({
  primary,
  borderless,
  children,
}: {
  primary?: "green" | "amber";
  borderless?: boolean;
  children: React.ReactNode;
}) {
  const style = primary
    ? primary === "green"
      ? "bg-brand-green text-on-brand"
      : "bg-brand-amber text-foreground"
    : borderless
      ? "text-subtle"
      : "border border-border bg-background text-subtle";
  return (
    <span
      className={`inline-flex h-8 items-center gap-1 rounded-4 px-3 text-12 font-medium ${style}`}
    >
      {children}
    </span>
  );
}

function SourceLetter({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-4 border border-border bg-surface-1 text-12 font-medium text-subtle">
      {children}
    </span>
  );
}

function StaticField({
  label,
  value,
  required,
  mono,
}: {
  label: string;
  value: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 text-12 font-medium text-subtle">
        <span>
          {label}
          {required ? <span className="ml-1 text-brand-red">*</span> : null}
        </span>
      </div>
      <div
        className={`mt-1 flex h-9 items-center truncate rounded-4 border border-border bg-background px-3 text-12 text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-2 text-subtle">
      <span className="w-10 shrink-0 text-faint">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </p>
  );
}

function SharePhone({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="relative flex h-[37.5rem] w-[22.5rem] max-w-full shrink-0 flex-col overflow-hidden rounded-16 border border-border bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <ArrowLeft className="size-5 text-subtle" />
        <span className="text-14 font-medium text-foreground">{title}</span>
      </header>
      {children}
    </article>
  );
}

function ShareBanner({
  initial,
  neutral,
  children,
}: {
  initial?: string;
  neutral?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-8 px-4 py-3 ${neutral ? "bg-surface-1" : "bg-brand-amber-soft"}`}
    >
      {initial ? (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-red text-12 font-medium text-on-brand">
          {initial}
        </span>
      ) : null}
      <p className="min-w-0 text-12 leading-paragraph text-foreground">
        {children}
      </p>
    </div>
  );
}

function ShareFooter({
  primary,
  secondary,
  tall,
}: {
  primary: string;
  secondary?: string;
  tall?: boolean;
}) {
  return (
    <footer className="flex shrink-0 gap-2 border-t border-border p-4">
      {secondary ? (
        <span
          className={`inline-flex flex-1 items-center justify-center gap-1 rounded-8 border border-border text-12 text-subtle ${tall ? "h-12" : "h-11"}`}
        >
          <Eye className="size-4" /> {secondary}
        </span>
      ) : null}
      <span
        className={`inline-flex flex-[1.4] items-center justify-center gap-1 rounded-8 bg-brand-red text-12 font-medium text-on-brand ${tall ? "h-12" : "h-11"}`}
      >
        <Download className="size-4" /> {primary}
      </span>
    </footer>
  );
}
