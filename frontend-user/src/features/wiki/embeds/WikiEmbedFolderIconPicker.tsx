import {
  Archive,
  Atom,
  Beaker,
  BookMarked,
  BookOpen,
  Bookmark,
  Brain,
  ChevronDown,
  Dna,
  FileText,
  FlaskConical,
  Folder,
  GraduationCap,
  Heart,
  Inbox,
  Layers,
  Library,
  Lightbulb,
  Microscope,
  Newspaper,
  PenTool,
  Sparkles,
  Star,
  Telescope,
  type LucideIcon,
} from "lucide-react";

const COLOR_OPTIONS = [
  {
    id: "none",
    label: "默认",
    swatchClass: "border border-border bg-background",
  },
  { id: "red", label: "朱砂", swatchClass: "bg-brand-red" },
  { id: "green", label: "松青", swatchClass: "bg-brand-green" },
  { id: "amber", label: "琥珀", swatchClass: "bg-brand-amber" },
  { id: "blue", label: "青墨", swatchClass: "bg-cat-blue" },
  {
    id: "soft",
    label: "浅灰",
    swatchClass: "border border-border bg-surface-2",
  },
] as const;

const ICON_OPTIONS: Array<{
  id: string;
  Icon: LucideIcon;
  label: string;
}> = [
  { id: "folder", Icon: Folder, label: "文件夹" },
  { id: "inbox", Icon: Inbox, label: "收件箱" },
  { id: "book-open", Icon: BookOpen, label: "书本" },
  { id: "book-marked", Icon: BookMarked, label: "书签本" },
  { id: "bookmark", Icon: Bookmark, label: "书签" },
  { id: "library", Icon: Library, label: "书库" },
  { id: "file-text", Icon: FileText, label: "文档" },
  { id: "layers", Icon: Layers, label: "分层" },
  { id: "archive", Icon: Archive, label: "归档" },
  { id: "newspaper", Icon: Newspaper, label: "期刊" },
  { id: "pen-tool", Icon: PenTool, label: "写作" },
  { id: "lightbulb", Icon: Lightbulb, label: "灵感" },
  { id: "star", Icon: Star, label: "星标" },
  { id: "heart", Icon: Heart, label: "收藏" },
  { id: "sparkles", Icon: Sparkles, label: "亮点" },
  { id: "brain", Icon: Brain, label: "脑科学" },
  { id: "flask", Icon: FlaskConical, label: "实验" },
  { id: "beaker", Icon: Beaker, label: "烧杯" },
  { id: "microscope", Icon: Microscope, label: "显微" },
  { id: "atom", Icon: Atom, label: "原子" },
  { id: "dna", Icon: Dna, label: "基因" },
  { id: "telescope", Icon: Telescope, label: "天文" },
  { id: "grad-cap", Icon: GraduationCap, label: "学历" },
];

/**
 * 文件夹图标与背景色选择器 · 纯样式 fixture。
 * 对齐 product-mock FolderIconPicker，并同时展示检索暂存区与文献集侧栏的入口状态。
 */
export function WikiEmbedFolderIconPicker() {
  return (
    <div
      className="grid w-[min(100%,42rem)] gap-4 rounded-16 border border-border bg-surface-1 p-4 sm:grid-cols-[minmax(0,1fr)_14rem]"
      aria-hidden
      data-wiki-fixture="folder-icon-picker"
    >
      <section className="min-w-0 rounded-12 border border-border bg-surface-card p-3">
        <div className="flex items-start justify-between gap-3 border-b border-border-soft pb-3">
          <div>
            <p className="text-14 font-medium text-foreground">文件夹外观</p>
            <p className="mt-1 text-12 text-faint">
              展开文件夹后，点击图标打开选择器
            </p>
          </div>
          <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-1 text-12 text-subtle">
            本机偏好
          </span>
        </div>

        <div className="mt-3 space-y-2" data-wiki-spot="文件夹入口状态">
          <FolderRow
            context="检索工作区"
            label="暂存区"
            count="12"
            Icon={Inbox}
            iconClass="bg-brand-green/10 text-brand-green"
            active
          />
          <FolderRow
            context="个人文献集"
            label="医学影像综述"
            count="28"
            Icon={Brain}
            iconClass="bg-cat-blue-soft text-cat-blue"
          />
        </div>

        <p className="mt-3 text-12 leading-paragraph text-muted-foreground">
          图标和底色只改变文件夹的识别外观；文献内容、权限与同步状态不受影响。
        </p>
      </section>

      <section
        className="rounded-12 border border-border bg-surface-card p-2 shadow-raised"
        data-wiki-spot="文件夹图标选择器"
      >
        <p className="mb-2 px-1 text-12 font-medium text-faint">背景色</p>
        <div className="mb-3 flex flex-wrap gap-2 px-1">
          {COLOR_OPTIONS.map(({ id, label, swatchClass }) => {
            const selected = id === "green";
            return (
              <span
                key={id}
                title={label}
                className={
                  selected
                    ? "inline-flex size-6 items-center justify-center rounded-pill ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "inline-flex size-6 items-center justify-center rounded-pill"
                }
              >
                <span className={`size-4 rounded-pill ${swatchClass}`} />
              </span>
            );
          })}
        </div>

        <p className="mb-2 px-1 text-12 font-medium text-faint">图标</p>
        <div className="grid grid-cols-5 gap-1">
          {ICON_OPTIONS.map(({ id, Icon, label }) => {
            const selected = id === "inbox";
            return (
              <span
                key={id}
                title={label}
                className={
                  selected
                    ? "inline-flex size-9 items-center justify-center rounded-8 bg-foreground text-on-dark"
                    : "inline-flex size-9 items-center justify-center rounded-8 text-subtle"
                }
              >
                <Icon className="size-4" strokeWidth={1.8} />
              </span>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function FolderRow({
  context,
  label,
  count,
  Icon,
  iconClass,
  active = false,
}: {
  context: string;
  label: string;
  count: string;
  Icon: LucideIcon;
  iconClass: string;
  active?: boolean;
}) {
  return (
    <div
      className={
        active
          ? "flex items-center gap-2 rounded-8 bg-danger-soft px-3 py-2"
          : "flex items-center gap-2 rounded-8 border border-border-soft px-3 py-2"
      }
    >
      <span
        className={`inline-flex size-6 shrink-0 items-center justify-center rounded-4 ${iconClass}`}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-12 font-medium text-foreground">{label}</p>
        <p className="mt-1 text-12 text-faint">{context}</p>
      </div>
      <span className="text-12 tabular-nums text-faint">{count}</span>
      <ChevronDown className="size-4 text-faint" />
    </div>
  );
}
