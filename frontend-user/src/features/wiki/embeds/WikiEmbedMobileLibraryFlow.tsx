import {
  ChevronDown,
  ChevronLeft,
  Compass,
  LayoutGrid,
  Plus,
  Share2,
  User,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

const FOLDERS = [
  ["LLM 综述", "12 篇 · 2 小时前更新", "green"],
  ["医学影像", "8 篇 · 昨天更新", "amber"],
  ["待读论文", "4 篇 · 3 天前更新", "green"],
] as const;

/** MobileLibraryPage 的文件夹列表冻结态。 */
export function WikiEmbedMobileLibraryFlow() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-surface-1"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-library-flow"
    >
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-background px-1">
        <span className="flex size-10 items-center justify-center text-muted-foreground">
          <ChevronLeft className="size-5" />
        </span>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-20 font-medium text-foreground">我的收藏</h2>
            <p className="mt-1 text-12 text-muted-foreground">
              按主题整理你收藏的文献
            </p>
          </div>
          <span className="flex h-9 shrink-0 items-center gap-2 rounded-8 bg-brand-red px-4 text-14 font-medium text-on-brand">
            <Plus className="size-4" />
            新建
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-12 text-muted-foreground">共 3 个文件夹</span>
          <span className="flex items-center gap-1 text-12 text-muted-foreground">
            最近更新
            <ChevronDown className="size-4 text-faint" />
          </span>
        </div>

        <ul className="mt-3 space-y-3" data-wiki-spot="移动文件夹列表">
          {FOLDERS.map(([name, meta, accent]) => (
            <li
              key={name}
              className="flex items-center gap-3 rounded-16 border border-border bg-surface-card"
              style={{ padding: 14 }}
            >
              <FolderCover accent={accent} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-14 font-medium text-foreground">
                  {name}
                </p>
                <p className="mt-2 truncate text-12 text-muted-foreground">
                  {meta}
                </p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-border text-muted-foreground">
                <Share2 className="size-4" />
              </span>
            </li>
          ))}
        </ul>
      </main>

      <MobileNav />
    </div>
  );
}

/** 源 FolderCover 的三层书脊构图，数据与动效已冻结。 */
function FolderCover({ accent }: { accent: "green" | "amber" }) {
  return (
    <div className="relative shrink-0" style={{ height: 74, width: 70 }}>
      <div
        className="absolute rounded-8 border border-border bg-surface-1"
        style={{ left: 18, top: 8, height: 58, width: 44 }}
      />
      <div
        className="absolute rounded-8 border border-border bg-surface-card"
        style={{ left: 9, top: 4, height: 62, width: 44 }}
      />
      <div
        className="absolute left-0 top-0 flex flex-col rounded-8 border border-border-strong bg-surface-card"
        style={{ height: 66, width: 46, gap: 5, padding: 7 }}
      >
        <div
          className={`rounded-4 ${accent === "green" ? "bg-brand-green" : "bg-brand-amber"}`}
          style={{ height: 3, width: 18 }}
        />
        <div
          className="rounded-4 bg-border-strong"
          style={{ height: 2.5, width: 32 }}
        />
        <div
          className="rounded-4 bg-border-strong"
          style={{ height: 2.5, width: 26 }}
        />
        <div
          className="rounded-4 bg-border-strong"
          style={{ height: 2.5, width: 30 }}
        />
      </div>
    </div>
  );
}

function MobileNav() {
  const items = [
    [Compass, "浏览"],
    [ClawBrandIcon, "AI Claw"],
    [LayoutGrid, "功能"],
    [User, "我的"],
  ] as const;
  return (
    <footer className="grid h-16 shrink-0 grid-cols-4 border-t border-border bg-background px-2">
      {items.map(([Icon, label]) => (
        <span
          key={label}
          className="relative flex flex-col items-center justify-center gap-1 text-faint"
        >
          <Icon className="size-5" />
          <span className="text-12">{label}</span>
        </span>
      ))}
    </footer>
  );
}
