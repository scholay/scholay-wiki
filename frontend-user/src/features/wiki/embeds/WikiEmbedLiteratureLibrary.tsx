import {
  BookMarked,
  BookOpen,
  ChevronDown,
  FilePenLine,
  Folder,
  Grid3x3,
  MessageSquare,
  MoreHorizontal,
  Network,
  Plus,
  Quote,
  Share2,
  Sparkles,
} from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const FOLDERS = [
  ["暂存区", "5", false],
  ["默认文件夹", "28", true],
  ["LLM 综述", "12", false],
  ["Agent 综述", "7", false],
] as const;

const PAPERS = [
  {
    source: "G",
    title: "Denoising Diffusion Probabilistic Models",
    authors: "Jonathan Ho, Ajay Jain, Pieter Abbeel",
    meta: "DOI: 10.48550/arXiv.2006.11239 · NeurIPS · 2020",
    abstract:
      "We present high quality image synthesis results using diffusion probabilistic models, a class of latent variable models inspired by nonequilibrium thermodynamics.",
    pdf: "PDF 完整",
    tone: "green",
  },
  {
    source: "D",
    title: "High-Resolution Image Synthesis with Latent Diffusion Models",
    authors: "Robin Rombach, Andreas Blattmann, Dominik Lorenz 等 5 人",
    meta: "DOI: 10.1109/CVPR52688.2022.01042 · CVPR · 2022",
    abstract:
      "Latent diffusion models reduce the computational requirements of diffusion training while preserving image quality and modeling flexibility.",
    pdf: "PDF 缺失",
    tone: "muted",
  },
] as const;

/** 桌面“我的资源 · 文献集”：资源侧栏、标准工具栏与未选择状态的论文列表。 */
export function WikiEmbedLiteratureLibrary() {
  return (
    <div
      className="grid h-[38rem] w-full max-w-6xl overflow-hidden rounded-8 border border-border bg-background md:grid-cols-[12rem_minmax(25rem,1fr)_minmax(18rem,0.8fr)]"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="literature-library"
    >
      <aside className="hidden min-h-0 flex-col border-r border-border bg-surface-1 md:flex">
        <div className="min-h-0 flex-1 overflow-hidden py-3">
          <SidebarSection
            title="文献集"
            icon={BookMarked}
            action={
              <span className="inline-flex items-center gap-1 text-12 font-medium text-foreground">
                <Plus className="size-3" /> 新建
              </span>
            }
          >
            <nav className="mt-2 space-y-1" data-wiki-spot="文献集文件夹">
              {FOLDERS.map(([label, count, active]) => (
                <div
                  key={label}
                  className={
                    active
                      ? "flex h-8 items-center gap-2 bg-brand-red-soft px-4 text-16 font-medium text-brand-red"
                      : "flex h-8 items-center gap-2 px-4 text-16 text-subtle"
                  }
                >
                  <Folder className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="tabular-nums text-faint">{count}</span>
                </div>
              ))}
            </nav>
          </SidebarSection>

          <SidebarSection title="期刊集" icon={BookOpen} bordered>
            <CompactRow label="关注期刊" count="9" />
            <CompactRow label="投稿候选" count="4" />
          </SidebarSection>
          <SidebarSection title="稿件集" icon={FilePenLine} bordered>
            <CompactRow label="进行中" count="3" />
          </SidebarSection>
          <SidebarSection title="资源集" icon={Folder} bordered>
            <CompactRow label="课题工作区" count="5" />
          </SidebarSection>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col bg-background">
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4">
          <span className="inline-flex h-8 min-w-0 items-center gap-2 rounded-8 border border-border-strong bg-surface-1 px-3 text-14 font-medium text-foreground">
            <Folder className="size-3.5 text-faint" />
            默认文件夹
            <ChevronDown className="size-3.5 text-faint" />
          </span>
          <div
            className="flex shrink-0 items-center gap-1"
            data-wiki-spot="文献集工作区功能"
          >
            <span className="inline-flex h-8 items-center gap-1 rounded-8 bg-foreground px-2 text-12 font-medium text-on-dark">
              <Grid3x3 className="size-3.5" /> 矩阵分析
            </span>
            <span className="inline-flex h-8 items-center gap-1 rounded-8 px-2 text-12 text-subtle">
              <Network className="size-3.5" /> 图谱
            </span>
            <span className="inline-flex h-8 items-center gap-1 rounded-8 px-2 text-12 text-subtle">
              <MessageSquare className="size-3.5" /> PDF Chat
            </span>
          </div>
          <span className="inline-flex h-8 items-center gap-1 rounded-8 px-2 text-12 text-subtle">
            <Plus className="size-3.5" /> 加入{" "}
            <ChevronDown className="size-3" />
          </span>
          <span className="inline-flex h-8 items-center gap-1 rounded-8 px-2 text-12 text-subtle">
            <Share2 className="size-3.5" /> 分享
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden px-4 lg:px-8">
          <header className="flex items-center justify-between gap-3 pb-2 pt-1">
            <div className="flex items-center gap-3 text-16">
              <span className="font-medium text-foreground">共 28 篇</span>
              <span className="text-border-strong">·</span>
              <span className="text-faint">本页 20 篇 · PDF 16 / 20</span>
            </div>
            <span className="inline-flex h-6 items-center gap-1 rounded-4 px-2 text-16 text-subtle">
              排序：加入时间 <ChevronDown className="size-3" />
            </span>
          </header>

          <ul
            className="divide-y divide-border-hairline"
            data-wiki-spot="文献列表"
          >
            {PAPERS.map((paper) => (
              <LibraryRow key={paper.title} paper={paper} />
            ))}
          </ul>
        </div>
      </main>

      <section className="hidden min-h-0 min-w-0 flex-col border-l border-border bg-background md:flex">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface-1 px-3">
          <Grid3x3 className="size-3.5 text-brand-red" />
          <span className="text-12 font-medium text-foreground">矩阵分析</span>
          <span className="ml-auto text-12 text-faint">当前 2 篇</span>
        </header>
        <div className="min-h-0 flex-1 p-3">
          <div className="grid grid-cols-3 overflow-hidden rounded-8 border border-border text-12">
            {[
              "论文",
              "方法",
              "结论",
              "Ho 2020",
              "扩散",
              "高质量生成",
              "Rombach 2022",
              "潜空间",
              "降低计算量",
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
          <p className="mb-0 mt-3 text-12 leading-paragraph text-faint">
            矩阵、图谱与 PDF Chat 互斥；切换会替换当前右栏。
          </p>
        </div>
      </section>
    </div>
  );
}

function SidebarSection({
  title,
  icon: Icon,
  children,
  action,
  bordered = false,
}: {
  title: string;
  icon: typeof Folder;
  children: React.ReactNode;
  action?: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <section
      className={bordered ? "mt-3 border-t border-border-hairline pt-3" : ""}
    >
      <header className="flex items-center justify-between gap-2 px-4">
        <span className="inline-flex items-center gap-2 text-16 font-medium text-foreground">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </span>
        {action}
      </header>
      {children}
    </section>
  );
}

function CompactRow({ label, count }: { label: string; count: string }) {
  return (
    <div className="mt-1 flex h-8 items-center gap-2 px-4 text-16 text-subtle">
      <Folder className="size-4 shrink-0 text-faint" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular-nums text-faint">{count}</span>
    </div>
  );
}

function LibraryRow({ paper }: { paper: (typeof PAPERS)[number] }) {
  return (
    <li className="group relative flex items-start gap-3 py-4 pl-4">
      <span className="mt-1 size-4 shrink-0 rounded-4 border border-border-strong bg-background" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start gap-2">
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-4 bg-foreground text-12 font-medium text-on-dark">
            {paper.source}
          </span>
          <h3 className="line-clamp-2 min-w-0 flex-1 text-18 font-medium leading-sans text-foreground">
            {paper.title}
          </h3>
        </div>
        <p className="truncate text-16 text-muted-foreground">
          {paper.authors}
        </p>
        <p className="truncate text-16 text-faint">{paper.meta}</p>
        <p className="line-clamp-2 text-16 leading-paragraph text-subtle">
          {paper.abstract}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusChip label="基础信息完整" tone="green" />
          <StatusChip label={paper.pdf} tone={paper.tone} />
          <span className="inline-flex h-7 items-center gap-1 rounded-4 border border-brand-amber/50 px-3 text-12 font-medium text-brand-amber">
            <Quote className="size-3" /> 引用
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-4 border border-border px-3 text-12 font-medium text-subtle">
            <Sparkles className="size-3" /> AI 翻译
          </span>
          <span className="inline-flex size-7 items-center justify-center rounded-4 border border-border text-subtle">
            <MoreHorizontal className="size-4" />
          </span>
          <span className="ml-auto text-12 text-faint">加入于 2026-07-18</span>
        </div>
      </div>
    </li>
  );
}

function StatusChip({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={
        tone === "green"
          ? "inline-flex h-7 items-center rounded-4 border border-brand-green/40 bg-brand-green-soft px-3 text-12 font-medium text-brand-green"
          : "inline-flex h-7 items-center rounded-4 border border-border bg-surface-1 px-3 text-12 font-medium text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}
