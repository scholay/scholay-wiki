import {
  ArrowRight,
  ClipboardCheck,
  Compass,
  Folder,
  Globe,
  LayoutGrid,
  PenLine,
  Search,
  Table,
  User,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

const NATIVE_TOOLS = [
  [ClipboardCheck, "智能审稿", "AI 预审 · 投稿建议", "text-brand-green"],
  [PenLine, "智能写作", "论文写作与润色", "text-brand-amber"],
  [Table, "矩阵分析", "多文献矩阵对比", "text-foreground"],
  [Folder, "文件夹", "收藏的论文", "text-brand-red"],
] as const;

/** MobileToolsHomePage 当前首屏。 */
export function WikiEmbedMobileTools() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-surface-1"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-tools"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <span className="text-16 font-medium text-foreground">功能</span>
        <span className="flex size-9 items-center justify-center rounded-pill text-muted-foreground">
          <Search className="size-5" />
        </span>
      </header>

      <main
        className="min-h-0 flex-1 overflow-hidden px-4"
        style={{ paddingBlock: 18 }}
      >
        <div className="flex flex-col" style={{ gap: 18 }}>
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-16 font-medium text-foreground">站内功能</h2>
              <p className="text-12 text-faint">Scholay 原生科研能力</p>
            </div>

            <div
              className="flex items-center gap-3 rounded-16 bg-amber-soft"
              style={{ padding: 14 }}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-card">
                <ClawBrandIcon className="size-6 text-brand-green" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-14 font-medium text-foreground">
                  AI Claw 科研智能体
                </span>
                <span className="truncate text-12 text-muted-foreground">
                  用一句话指挥它帮你找、读、写、比
                </span>
              </span>
              <span className="shrink-0 rounded-pill bg-brand-red px-4 py-2 text-12 font-medium text-on-brand">
                开启
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {NATIVE_TOOLS.map(([Icon, name, desc, tone]) => (
                <div
                  key={name}
                  className="flex flex-col rounded-16 border border-border bg-surface-card"
                  style={{ gap: 10, padding: 14 }}
                >
                  <span className="flex size-9 items-center justify-center rounded-8 bg-surface-2">
                    <Icon className={`size-5 ${tone}`} />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-14 font-medium text-foreground">
                      {name}
                    </span>
                    <span className="truncate text-12 text-faint">{desc}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-16 font-medium text-foreground">全网功能</h2>
              <p className="text-12 text-faint">
                凡与科研沾边的网站与工具，皆可收录
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-16 bg-foreground p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="flex items-center justify-center rounded-8 bg-background/10"
                    style={{ width: 34, height: 34 }}
                  >
                    <Globe className="size-5 text-on-dark" />
                  </span>
                  <span className="text-14 font-medium text-on-dark">
                    科研全网导航
                  </span>
                </div>
                <ArrowRight
                  className="text-on-dark/80"
                  style={{ width: 18, height: 18 }}
                />
              </div>
              <p className="text-12 leading-paragraph text-on-dark/70">
                12,368 个网站 · 工具 ·
                数据库已收录，覆盖检索、写作、绘图、数据等全科研流程，持续更新。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  "arXiv",
                  "Zotero",
                  "Overleaf",
                  "Connected Papers",
                  "+12K",
                ].map((label) => (
                  <span
                    key={label}
                    className="rounded-pill bg-background/10 px-2 py-1 text-12 text-on-dark/90"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      <MobileNav />
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
          className={`relative flex flex-col items-center justify-center gap-1 ${label === "功能" ? "text-foreground" : "text-faint"}`}
        >
          {label === "功能" ? (
            <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
          ) : null}
          <Icon className="size-5" />
          <span className={`text-12 ${label === "功能" ? "font-medium" : ""}`}>
            {label}
          </span>
        </span>
      ))}
    </footer>
  );
}
