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
} from 'lucide-react';

/** 文件夹可选图标矩阵 —— key 持久化到 localStorage */
export const FOLDER_ICON_OPTIONS: { id: string; Icon: LucideIcon; label: string }[] = [
  { id: 'folder', Icon: Folder, label: '文件夹' },
  { id: 'inbox', Icon: Inbox, label: '收件箱' },
  { id: 'book-open', Icon: BookOpen, label: '书本' },
  { id: 'book-marked', Icon: BookMarked, label: '书签本' },
  { id: 'bookmark', Icon: Bookmark, label: '书签' },
  { id: 'library', Icon: Library, label: '书库' },
  { id: 'file-text', Icon: FileText, label: '文档' },
  { id: 'layers', Icon: Layers, label: '分层' },
  { id: 'archive', Icon: Archive, label: '归档' },
  { id: 'newspaper', Icon: Newspaper, label: '期刊' },
  { id: 'pen-tool', Icon: PenTool, label: '写作' },
  { id: 'lightbulb', Icon: Lightbulb, label: '灵感' },
  { id: 'star', Icon: Star, label: '星标' },
  { id: 'heart', Icon: Heart, label: '收藏' },
  { id: 'sparkles', Icon: Sparkles, label: '亮点' },
  { id: 'brain', Icon: Brain, label: '脑科学' },
  { id: 'flask', Icon: FlaskConical, label: '实验' },
  { id: 'beaker', Icon: Beaker, label: '烧杯' },
  { id: 'microscope', Icon: Microscope, label: '显微' },
  { id: 'atom', Icon: Atom, label: '原子' },
  { id: 'dna', Icon: Dna, label: '基因' },
  { id: 'telescope', Icon: Telescope, label: '天文' },
  { id: 'grad-cap', Icon: GraduationCap, label: '学历' },
];

const BY_ID = new Map(FOLDER_ICON_OPTIONS.map((o) => [o.id, o]));

export function resolveFolderIcon(
  iconId: string | undefined,
  fallback: 'staging' | 'folder',
): LucideIcon {
  if (iconId && BY_ID.has(iconId)) return BY_ID.get(iconId)!.Icon;
  return fallback === 'staging' ? Inbox : Folder;
}

/** 文件夹图标背景色 —— 只用设计 token 类,禁硬编码色值 */
export const FOLDER_COLOR_OPTIONS: {
  id: string;
  label: string;
  /** 图标容器背景 */
  bgClass: string;
  /** 图标前景色;空则沿用默认 muted */
  fgClass: string;
  /** 色板预览圆点 */
  swatchClass: string;
}[] = [
  {
    id: 'none',
    label: '默认',
    bgClass: '',
    fgClass: '',
    swatchClass: 'border border-border bg-background',
  },
  {
    id: 'red',
    label: '朱砂',
    bgClass: 'bg-brand-red/10',
    fgClass: 'text-brand-red',
    swatchClass: 'bg-brand-red',
  },
  {
    id: 'green',
    label: '松青',
    bgClass: 'bg-brand-green/10',
    fgClass: 'text-brand-green',
    swatchClass: 'bg-brand-green',
  },
  {
    id: 'amber',
    label: '琥珀',
    bgClass: 'bg-brand-amber/10',
    fgClass: 'text-brand-amber',
    swatchClass: 'bg-brand-amber',
  },
  {
    id: 'blue',
    label: '青墨',
    bgClass: 'bg-brand-blue/10',
    fgClass: 'text-brand-blue',
    swatchClass: 'bg-brand-blue',
  },
  {
    id: 'soft',
    label: '浅灰',
    bgClass: 'bg-surface-2',
    fgClass: 'text-foreground',
    swatchClass: 'bg-surface-2 border border-border',
  },
];

const COLOR_BY_ID = new Map(FOLDER_COLOR_OPTIONS.map((o) => [o.id, o]));

export function resolveFolderColor(colorId: string | undefined) {
  if (colorId && COLOR_BY_ID.has(colorId)) return COLOR_BY_ID.get(colorId)!;
  return FOLDER_COLOR_OPTIONS[0]!;
}

export function folderIconStorageKey(
  folderKey: 'staging' | number | string,
): string {
  return String(folderKey);
}
