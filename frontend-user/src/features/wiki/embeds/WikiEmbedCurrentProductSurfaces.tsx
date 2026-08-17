import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  BookOpen,
  Bot,
  Compass,
  Database,
  FileCheck,
  FilePenLine,
  Folder,
  MessageSquareText,
  PenTool,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";

const PRIMARY_FEATURES: Array<{ label: string; Icon: LucideIcon }> = [
  { label: "学术搜索", Icon: Search },
  { label: "智能助手", Icon: Bot },
  { label: "智能写作", Icon: PenTool },
  { label: "智能审稿", Icon: FileCheck },
  { label: "我的资源", Icon: Database },
  { label: "scholay广场", Icon: Compass },
];

const SEARCH_CHILDREN = [
  "智能搜论文",
  "论文库搜索",
  "期刊库搜索",
  "数据集搜索",
  "scholay 情报",
  "scholay 选刊 · 敬请期待",
];

export function WikiEmbedSiteNavigationTree() {
  return (
    <div
      className="w-[48rem] max-w-full overflow-hidden rounded-16 border border-border bg-background shadow-raised"
      aria-hidden
      data-wiki-fixture="site-navigation-tree"
    >
      <div className="border-b border-border bg-surface-1 px-4 py-3">
        <p className="m-0 text-12 font-medium text-muted-foreground">
          全站功能 · 六个一级入口
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {PRIMARY_FEATURES.map(({ label, Icon }, index) => (
            <span
              key={label}
              className={`flex min-w-0 items-center gap-1.5 rounded-8 border px-2 py-2 text-12 ${
                index === 0
                  ? "border-foreground bg-foreground text-on-inverse"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid min-h-64 grid-cols-[13rem_1fr]">
        <aside className="border-r border-border bg-surface-1 p-3">
          <p className="m-0 text-12 font-medium text-foreground">学术搜索</p>
          <div className="mt-2 space-y-1">
            {SEARCH_CHILDREN.map((label, index) => (
              <span
                key={label}
                className={`block rounded-8 px-2.5 py-1.5 text-12 ${
                  index === 0
                    ? "bg-background font-medium text-foreground shadow-raised"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </aside>
        <div className="p-4">
          <p className="m-0 text-14 font-medium text-foreground">智能搜论文</p>
          <p className="mt-1 text-12 text-muted-foreground">
            侧栏下半区按当前功能显示会话、项目、审稿记录或资源集合。
          </p>
          <div className="mt-4 space-y-2">
            {[
              "多模态模型的评测方法",
              "蛋白质结构预测综述",
              "因果推断与教育政策",
            ].map((label, index) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-8 border border-border px-3 py-2"
              >
                <span
                  className={`size-2 rounded-pill ${
                    index === 0 ? "bg-brand-green" : "bg-border-strong"
                  }`}
                />
                <span className="text-12 text-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const RESOURCE_SECTIONS: Array<{
  label: string;
  hint: string;
  route: string;
  Icon: LucideIcon;
}> = [
  {
    label: "文献集",
    hint: "以论文为单元收藏",
    route: "papers",
    Icon: BookMarked,
  },
  {
    label: "期刊集",
    hint: "以期刊为单元收藏",
    route: "journals",
    Icon: BookOpen,
  },
  {
    label: "稿件集",
    hint: "写作稿与审稿上传稿",
    route: "manuscripts",
    Icon: FilePenLine,
  },
  {
    label: "资源集",
    hint: "通用过程产物与上传物",
    route: "folders",
    Icon: Folder,
  },
];

export function WikiEmbedMyResourcesSections() {
  return (
    <div
      className="w-[46rem] max-w-full rounded-16 border border-border bg-background p-4 shadow-raised"
      aria-hidden
      data-wiki-fixture="my-resources-sections"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="m-0 text-18 font-medium text-foreground">我的资源</p>
          <p className="mt-1 text-12 text-muted-foreground">
            收藏、稿件和研究过程产物使用四个独立 section。
          </p>
        </div>
        <code className="rounded-8 bg-surface-2 px-2 py-1 text-12 text-muted-foreground">
          /library?section=…
        </code>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {RESOURCE_SECTIONS.map(({ label, hint, route, Icon }) => (
          <article
            key={route}
            className="flex items-center gap-3 rounded-12 border border-border bg-surface-1 p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-8 bg-background text-foreground shadow-raised">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-14 font-medium text-foreground">{label}</p>
              <p className="m-0 text-12 text-muted-foreground">{hint}</p>
            </div>
            <code className="text-12 text-faint">{route}</code>
          </article>
        ))}
      </div>
    </div>
  );
}

const MANUSCRIPTS = [
  {
    title: "Transformer 可解释性综述 · 初稿",
    origin: "来自智能写作 · 可写可审可循环",
    stage: "写作中",
    tone: "bg-surface-2 text-foreground",
  },
  {
    title: "医学影像分割方法比较",
    origin: "来自智能写作 · 可写可审可循环",
    stage: "审稿中",
    tone: "bg-warning-soft text-brand-amber",
  },
  {
    title: "区域创新网络的实证研究",
    origin: "审稿上传稿 · 只有审稿记录",
    stage: "已决议",
    tone: "bg-brand-green/10 text-brand-green",
  },
] as const;

export function WikiEmbedManuscriptCollection() {
  return (
    <div
      className="w-[46rem] max-w-full overflow-hidden rounded-16 border border-border bg-background shadow-raised"
      aria-hidden
      data-wiki-fixture="manuscript-collection"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="m-0 text-16 font-medium text-foreground">稿件集</p>
          <p className="m-0 text-12 text-muted-foreground">产品演示阶段</p>
        </div>
        <span className="rounded-pill border border-brand-amber/40 bg-warning-soft px-2 py-1 text-12 text-brand-amber">
          写作 ↔ 审稿循环
        </span>
      </div>
      <div className="divide-y divide-border">
        {MANUSCRIPTS.map(({ title, origin, stage, tone }) => (
          <article key={title} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-muted-foreground">
              <FilePenLine className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-14 font-medium text-foreground">
                {title}
              </p>
              <p className="m-0 truncate text-12 text-muted-foreground">
                {origin}
              </p>
            </div>
            <span className={`rounded-pill px-2 py-1 text-12 ${tone}`}>
              {stage}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}

const PLAZA_ENTRIES: Array<{
  label: string;
  route: string;
  status: string;
  Icon: LucideIcon;
}> = [
  { label: "学术工具", route: "/tools/catalog", status: "现行", Icon: Wrench },
  {
    label: "数据集搜索",
    route: "/tools/datasets",
    status: "演示",
    Icon: Database,
  },
  {
    label: "学术skills",
    route: "/tools/skills",
    status: "现行",
    Icon: Sparkles,
  },
  {
    label: "scholay 情报",
    route: "/tools/news",
    status: "现行",
    Icon: Compass,
  },
  {
    label: "学术prompts",
    route: "/tools/prompts",
    status: "演示",
    Icon: MessageSquareText,
  },
];

export function WikiEmbedScholayPlazaHub() {
  return (
    <div
      className="w-[46rem] max-w-full rounded-16 border border-border bg-background p-4 shadow-raised"
      aria-hidden
      data-wiki-fixture="scholay-plaza-hub"
    >
      <p className="m-0 text-18 font-medium text-foreground">scholay广场</p>
      <p className="mt-1 text-12 text-muted-foreground">
        Hub 汇合工具、skills 与 prompts；数据集与情报同时出现在学术搜索任务树。
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PLAZA_ENTRIES.map(({ label, route, status, Icon }) => (
          <article
            key={route}
            className="rounded-12 border border-border bg-surface-1 p-3"
          >
            <Icon className="size-4 text-foreground" />
            <p className="mb-0 mt-2 text-12 font-medium text-foreground">
              {label}
            </p>
            <p className="m-0 truncate text-12 text-faint">{route}</p>
            <span className="mt-2 inline-flex rounded-pill bg-background px-1.5 py-0.5 text-12 text-muted-foreground">
              {status}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}
