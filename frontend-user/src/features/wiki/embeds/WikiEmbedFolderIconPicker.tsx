import {
  Archive,
  Atom,
  Beaker,
  BookMarked,
  BookOpen,
  Bookmark,
  Brain,
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
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

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

/** 文件夹图标与背景色选择弹层 · 来源：product-mock FolderIconPicker。 */
export function WikiEmbedFolderIconPicker() {
  return (
    <div
      className="w-full max-w-full rounded-8 border border-border bg-background p-2 shadow-overlay"
      style={{ ...DISCOVERY_MOCK_THEME, width: 220 }}
      aria-hidden
      data-wiki-fixture="folder-icon-picker"
    >
      <p className="mb-2 px-1 text-12 font-medium text-faint">背景色</p>
      <div
        className="mb-3 flex flex-wrap gap-1 px-1"
        role="listbox"
        aria-label="文件夹背景色"
      >
        {COLOR_OPTIONS.map(({ id, label, swatchClass }) => {
          const selected = id === "green";
          return (
            <span
              key={id}
              title={label}
              role="option"
              aria-selected={selected}
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
      <div
        className="grid grid-cols-5 gap-1"
        role="listbox"
        aria-label="文件夹图标"
      >
        {ICON_OPTIONS.map(({ id, Icon, label }) => {
          const selected = id === "inbox";
          return (
            <span
              key={id}
              title={label}
              role="option"
              aria-selected={selected}
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
    </div>
  );
}
