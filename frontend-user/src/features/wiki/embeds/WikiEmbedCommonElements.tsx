import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Compass,
  Database,
  Download,
  FileText,
  FileCheck,
  FolderArchive,
  Gift,
  Globe,
  Headphones,
  Home,
  Info,
  Loader2,
  Menu,
  MoreVertical,
  Pencil,
  PenTool,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  UserPlus,
  X,
} from "lucide-react";
import { WikiEmbedBrandLogo } from "./WikiEmbedBrandLogo";
import { RhinoBrandIcon } from "@/shared/components/RhinoBrandIcon";

const NAV_ITEMS = [
  { label: "首页", icon: Home, group: "" },
  { label: "浏览器", icon: Globe, group: "" },
  { label: "学术搜索", icon: Search, group: "检索" },
  { label: "智能助手", icon: RhinoBrandIcon, group: "智能" },
  { label: "智能写作", icon: PenTool, group: "智能" },
  { label: "智能审稿", icon: FileCheck, group: "智能" },
  { label: "我的资源", icon: Database, group: "资源" },
  { label: "scholay广场", icon: Compass, group: "资源" },
] as const;

const BROWSER_TABS = [
  {
    label: "RAG for Knowledge-Intensive NLP",
    icon: FileText,
    tone: "text-foreground",
  },
  {
    label: "Nature Machine Intelligence",
    icon: BookOpen,
    tone: "text-brand-amber",
  },
  { label: "Patrick Lewis", icon: UserRound, tone: "text-brand-green" },
] as const;

/** CompactNavMenu 与 BrowserTabsBar 的 current-production 结构对照。 */
export function WikiEmbedCommonNavigationTabs() {
  return (
    <div
      className="grid w-[min(100%,62rem)] gap-4 bg-background lg:grid-cols-[18rem_minmax(0,1fr)]"
      aria-hidden
      data-wiki-fixture="common-navigation-tabs"
    >
      <section className="overflow-hidden rounded-12 border border-border bg-surface-card">
        <header className="flex h-14 items-center justify-between border-b border-border-soft px-4">
          <WikiEmbedBrandLogo size="sm" />
          <span
            className="inline-flex size-8 items-center justify-center rounded-8 bg-surface-2 text-foreground"
            data-wiki-spot="汉堡菜单"
          >
            <Menu className="size-4" strokeWidth={2} />
          </span>
        </header>
        <div className="p-2">
          <p className="px-2 py-2 text-12 font-medium text-faint">导航菜单</p>
          {NAV_ITEMS.map(({ label, icon: Icon, group }, index) => {
            const previousGroup = index > 0 ? NAV_ITEMS[index - 1].group : "";
            return (
              <div key={label}>
                {group && group !== previousGroup ? (
                  <p className="mb-1 mt-2 px-3 text-12 font-medium text-faint">
                    {group}
                  </p>
                ) : null}
                <div
                  className={
                    index === 1
                      ? "flex h-9 items-center gap-2 rounded-8 bg-surface-2 px-3 text-12 font-medium text-foreground"
                      : "flex h-9 items-center gap-2 rounded-8 px-3 text-12 text-subtle"
                  }
                >
                  <Icon className="size-4 shrink-0 text-faint" />
                  <span>{label}</span>
                </div>
              </div>
            );
          })}
          <div className="my-1 h-px bg-border-soft" />
          <div className="flex h-9 items-center gap-2 rounded-8 px-3 text-12 text-brand-red">
            <Gift className="size-4" /> 限时领取会员
          </div>
          <div className="flex h-9 items-center gap-2 rounded-8 px-3 text-12 text-brand-red">
            <UserPlus className="size-4" /> 邀请有礼
          </div>
          <div className="flex h-9 items-center gap-2 rounded-8 px-3 text-12 text-subtle">
            <Headphones className="size-4 text-faint" /> 反馈与建议
          </div>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-12 border border-border bg-surface-card">
        <p className="border-b border-border-soft px-4 py-3 text-12 font-medium text-faint">
          浏览器详情页签
        </p>
        <div
          className="flex h-tab items-center gap-3 border-b border-border-soft px-4"
          data-wiki-spot="浏览器页签"
        >
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-8 px-2 text-12 text-subtle">
            <ArrowLeft className="size-3" /> 返回
          </span>
          <span className="h-5 w-px shrink-0 bg-divider" />
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {BROWSER_TABS.map(({ label, icon: Icon, tone }, index) => (
              <span
                key={label}
                className={
                  index === 0
                    ? "inline-flex max-w-52 shrink-0 items-center gap-2 rounded-pill bg-surface-2 py-2 pl-3 pr-2 text-12 font-medium text-foreground"
                    : "inline-flex max-w-52 shrink-0 items-center gap-2 rounded-pill py-2 pl-3 pr-2 text-12 text-subtle"
                }
              >
                <Icon className={`size-3 shrink-0 ${tone}`} />
                <span className="truncate">{label}</span>
                <X className="size-3 shrink-0 text-faint" />
              </span>
            ))}
          </div>
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-8 text-subtle">
            <Plus className="size-3.5" />
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <ElementNote title="返回" body="回到打开当前详情的上一处任务页面。" />
          <ElementNote
            title="页签"
            body="保留论文、期刊、学者或 PDF 详情，切换时不丢列表。"
          />
          <ElementNote title="新建" body="按题名或 DOI 快速打开另一篇论文。" />
        </div>
      </section>
    </div>
  );
}

/** PaperResultCard 默认展开态；字段与动作来自 current shared component。 */
export function WikiEmbedCommonReferenceCard() {
  return (
    <div
      className="w-[min(100%,58rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="common-reference-card"
      data-wiki-spot="参考文献基础信息卡片"
    >
      <article className="px-4 py-4">
        <div className="flex items-start gap-2" data-wiki-spot="论文标题">
          <span className="mt-1 size-4 shrink-0 rounded-pill border border-border-strong bg-background" />
          <h3 className="min-w-0 flex-1 text-14 font-medium text-foreground">
            Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks
          </h3>
        </div>

        <div
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-12 text-muted-foreground"
          data-wiki-spot="来源、作者与年份"
        >
          <span className="underline decoration-dotted decoration-faint underline-offset-2">
            NeurIPS
          </span>
          <span className="text-faint">·</span>
          <span className="underline decoration-dotted decoration-faint underline-offset-2">
            Patrick Lewis
          </span>
          <span>, Ethan Perez</span>
          <span className="text-faint">+4</span>
          <span className="ml-auto tabular-nums text-faint">2020</span>
        </div>

        <div
          className="mt-2 flex flex-wrap items-center gap-2 pl-6"
          data-wiki-spot="期刊指标"
        >
          <span className="inline-flex h-5 items-center rounded-pill border border-brand-green/70 px-2 text-12 font-medium text-brand-green">
            CCF A
          </span>
          <span className="inline-flex h-5 items-center rounded-pill border border-faint px-2 text-12 text-subtle">
            8.4k 引用
          </span>
          <span className="text-12 text-faint">Computer Science</span>
        </div>

        <p
          className="mt-2 pl-6 text-12 leading-paragraph text-subtle"
          data-wiki-spot="论文摘要"
        >
          大语言模型可以通过检索外部文献来更新知识并给出可追溯答案。该研究比较参数化记忆与非参数化记忆的组合方式，并报告开放域问答结果。
        </p>

        <div
          className="mt-3 flex flex-wrap items-center gap-2 pl-6"
          data-wiki-spot="卡片动作"
        >
          <span className="inline-flex h-6 items-center gap-1 rounded-8 border border-border px-3 text-12 text-subtle">
            <Bookmark className="size-3" /> 收藏
          </span>
          <span className="inline-flex h-6 items-center gap-1 rounded-8 border border-border px-3 text-12 text-subtle">
            <FileText className="size-3" /> 原文链接
          </span>
          <span className="inline-flex h-6 items-center gap-1 rounded-8 border border-border px-3 text-12 text-subtle">
            AI 翻译
          </span>
          <span className="ml-auto text-12 text-faint">
            点击标题打开论文详情
          </span>
        </div>
      </article>

      <footer className="grid gap-px border-t border-border-soft bg-border-soft sm:grid-cols-3">
        <ElementNote
          title="基础信息"
          body="题名、来源、作者、年份和摘要来自论文记录。"
        />
        <ElementNote
          title="评价标签"
          body="分区、影响因子和被引数是辅助信号，不等于论文质量结论。"
        />
        <ElementNote
          title="可用动作"
          body="收藏、打开合法原文、翻译或加入暂存区彼此独立。"
        />
      </footer>
    </div>
  );
}

const PRISM_FILES = [
  { name: "main.tex", active: true },
  { name: "sections/introduction.tex", active: false },
  { name: "sections/method.tex", active: false },
  { name: "references.bib", active: false },
] as const;

/** Prism 文件树与 Claw 扩展区预览的两块 current-production 工作面板。 */
export function WikiEmbedCommonWorkspaces() {
  return (
    <div
      className="grid w-[min(100%,62rem)] overflow-hidden rounded-12 border border-border bg-background lg:grid-cols-[18rem_minmax(0,1fr)]"
      aria-hidden
      data-wiki-fixture="common-workspaces"
    >
      <aside className="border-b border-border-soft bg-surface-1 lg:border-b-0 lg:border-r">
        <div className="border-b border-border-soft px-4 py-3">
          <p className="text-12 text-faint">Prism · 文件树</p>
          <p className="mt-1 truncate text-14 font-medium text-foreground">
            医学影像综述
          </p>
        </div>
        <div className="py-2" data-wiki-spot="文件树">
          <div className="flex h-8 items-center justify-between px-4 text-12 font-medium text-foreground">
            <span>文件</span>
            <span className="text-faint">4</span>
          </div>
          {PRISM_FILES.map(({ name, active }, index) => (
            <div
              key={name}
              className={
                active
                  ? "flex h-8 items-center gap-2 border-l-[3px] border-foreground bg-surface-2 pl-3 pr-2 text-12 font-medium text-foreground"
                  : "flex h-8 items-center gap-2 px-4 text-12 text-subtle"
              }
            >
              <FileText className="size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {index === 2 && (
                <MoreVertical className="size-3.5 shrink-0 text-faint" />
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-border-soft p-3">
          <div className="flex items-center gap-2 text-12 text-faint">
            <Pencil className="size-3.5" /> 重命名
            <span className="h-4 w-px bg-border" />
            <Trash2 className="size-3.5" /> 删除非主文件
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-col" data-wiki-spot="扩展区">
        <header className="flex h-10 items-center gap-2 border-b border-border px-4">
          <FolderArchive className="size-3.5 text-brand-green" />
          <span className="text-14 font-medium text-foreground">扩展区</span>
          <span className="text-12 tabular-nums text-faint">· 3</span>
          <span className="ml-auto inline-flex h-7 items-center gap-1 text-12 text-subtle">
            <Download className="size-3.5" /> 下载
          </span>
        </header>
        <div className="flex h-9 items-center gap-2 border-b border-border-soft px-4 text-12 text-muted-foreground">
          <ArrowLeft className="size-3" /> 返回列表
          <span className="ml-auto truncate font-medium text-foreground">
            evidence-matrix.xlsx
          </span>
        </div>

        <div className="flex min-h-72 flex-1 flex-col bg-surface-1">
          <div
            className="flex items-center gap-1 overflow-hidden border-b border-border bg-surface-1 px-2 py-1"
            data-wiki-spot="扩展区标签页"
          >
            <span className="inline-flex shrink-0 items-center rounded-8 bg-foreground px-2 py-1 text-12 text-on-dark">
              证据矩阵
            </span>
            <span className="inline-flex shrink-0 items-center rounded-8 px-2 py-1 text-12 text-muted-foreground">
              术语说明
            </span>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden p-3">
            <table className="w-full border-collapse text-12 tabular-nums">
              <tbody>
                {[
                  ["研究", "样本", "核心发现"],
                  ["Lewis 2020", "1,024", "检索增强减少知识错误"],
                  ["Guu 2020", "845", "预训练阶段接入语料库"],
                  ["Izacard 2021", "1,632", "多文档融合提升问答"],
                ].map((row, rowIndex) => (
                  <tr
                    key={row[0]}
                    className={rowIndex === 0 ? "bg-surface-2 font-medium" : ""}
                  >
                    <td className="border border-border bg-surface-2 px-2 py-1 text-center text-faint">
                      {rowIndex + 1}
                    </td>
                    {row.map((cell) => (
                      <td
                        key={cell}
                        className="border border-border px-2 py-1 text-subtle"
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
      </section>
    </div>
  );
}

/** Agent 工具、思考、额度与阶段进度四种状态的同义区分。 */
export function WikiEmbedCommonAgentStatus() {
  return (
    <div
      className="grid w-[min(100%,62rem)] gap-4 bg-background lg:grid-cols-[minmax(0,1fr)_22rem]"
      aria-hidden
      data-wiki-fixture="common-agent-status"
    >
      <section className="space-y-3 rounded-12 border border-border bg-surface-card p-4">
        <p className="text-12 font-medium text-faint">智能体执行过程</p>
        <div
          className="overflow-hidden rounded-8 border border-border-soft bg-surface-1/70"
          data-wiki-spot="推理过程"
        >
          <div className="flex items-center gap-2 px-3 py-2 text-12 text-muted-foreground">
            <ChevronRight className="size-3" />
            <Sparkles className="size-3 text-faint" />
            <span className="font-medium text-foreground">已思考 18 秒</span>
            <span className="min-w-0 flex-1 truncate font-mono text-faint">
              先界定检索范围，再核对研究设计与结论边界…
            </span>
          </div>
        </div>

        <div
          className="overflow-hidden rounded-8 border border-border-soft bg-surface-1/70"
          data-wiki-spot="Function call 卡片"
        >
          <div className="flex min-w-0 items-center gap-2 px-3 py-2 text-12 text-muted-foreground">
            <ChevronDown className="size-3 shrink-0" />
            <Search className="size-3 shrink-0 text-brand-green" />
            <span className="shrink-0 font-medium text-foreground">
              检索论文
            </span>
            <span className="min-w-0 flex-1 truncate">
              query: retrieval augmented generation
            </span>
            <CheckCircle2 className="size-3 shrink-0 text-brand-green" />
          </div>
          <div className="grid gap-2 border-t border-border-soft px-3 py-2 sm:grid-cols-2">
            <ToolPayload
              label="入参"
              value='{"year_from": 2020, "limit": 20}'
            />
            <ToolPayload label="结果" value="已找到 20 篇论文" />
          </div>
        </div>

        <div className="overflow-hidden rounded-8 border border-border-soft bg-surface-1/70">
          <div className="flex items-center gap-2 px-3 py-2 text-12 text-muted-foreground">
            <ChevronRight className="size-3" />
            <Database className="size-3 text-muted-foreground" />
            <span className="font-medium text-foreground">整理证据矩阵</span>
            <span className="ml-auto inline-flex items-center gap-2 text-faint">
              已运行 12s <Loader2 className="size-3" />
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-12 border border-border bg-surface-card p-4">
        <div data-wiki-spot="剩余额度显示">
          <div className="flex items-center justify-between gap-3">
            <span className="text-12 font-medium text-foreground">
              本周期额度
            </span>
            <span className="text-12 font-medium tabular-nums text-muted-foreground">
              剩余 68%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-2">
            <div className="h-full w-2/3 rounded-pill bg-brand-green" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-12 text-faint">
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="size-3" /> 3 天后自动回满
            </span>
            <span className="inline-flex items-center gap-1">
              <Coins className="size-3" /> 36.75 经费
            </span>
          </div>
        </div>

        <div className="h-px bg-border-soft" />

        <div data-wiki-spot="任务进度条">
          <div className="flex items-center gap-2 text-12">
            <Clock className="size-3.5 text-brand-amber" />
            <span className="font-medium text-foreground">
              通读全文 · 制定审稿标准
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-brand-amber/15">
            <div className="h-full w-1/5 rounded-pill bg-brand-amber" />
          </div>
          <p className="mt-2 text-12 tabular-nums text-brand-amber">
            阶段 1/5 · 预计剩余约 10 分钟
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-8 bg-surface-1 px-3 py-2 text-12 leading-paragraph text-subtle">
          <Info className="mt-1 size-3.5 shrink-0 text-faint" />
          <span>
            额度条表示还能使用多少；任务进度条表示当前工作做到哪一步，两者不是同一个计量。
          </span>
        </div>
      </section>
    </div>
  );
}

function ElementNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-surface-card p-3">
      <p className="text-12 font-medium text-foreground">{title}</p>
      <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function ToolPayload({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-8 bg-background px-3 py-2">
      <p className="text-12 font-medium text-faint">{label}</p>
      <p className="mt-1 truncate font-mono text-12 text-subtle">{value}</p>
    </div>
  );
}
