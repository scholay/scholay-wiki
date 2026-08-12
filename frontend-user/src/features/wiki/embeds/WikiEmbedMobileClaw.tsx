import {
  ArrowUp,
  BookOpen,
  Compass,
  FileText,
  ImageIcon,
  LayoutGrid,
  Newspaper,
  PanelLeft,
  Plus,
  Puzzle,
  Sparkles,
  SquarePen,
  User,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

const SUGGESTIONS = [
  [BookOpen, "找一篇综述", "找一篇关于 Transformer 在医学影像中的应用综述"],
  [FileText, "读 PDF 写摘要", "上传 PDF，帮我写一段约 200 字的中文摘要"],
  [Newspaper, "查期刊动态", "Nature Methods 最近半年的 AI 相关文章"],
  [ImageIcon, "看图分析", "检查这张实验装置图里缺少什么对照"],
] as const;

/** MobileClawPage 新对话空白态。 */
export function WikiEmbedMobileClaw() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-claw"
    >
      <div className="relative flex min-h-0 flex-1 flex-col bg-background">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-sticky flex items-center justify-between bg-gradient-to-b from-background via-background/85 to-transparent px-2 pt-2"
          style={{ paddingBottom: 20 }}
        >
          <span className="flex size-9 items-center justify-center rounded-pill text-foreground">
            <PanelLeft className="size-5" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-pill text-foreground">
            <SquarePen className="size-5" />
          </span>
        </div>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6 py-8 pt-12">
          <div className="flex w-full max-w-sm flex-col items-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-16 bg-brand-green/25 blur-xl" />
              <div className="relative flex size-14 items-center justify-center rounded-16 bg-surface-2">
                <Sparkles
                  className="size-7 text-brand-green"
                  strokeWidth={1.8}
                />
              </div>
            </div>
            <h2 className="mt-4 font-serif text-20 font-medium text-foreground">
              智能助手 · Claw
            </h2>
            <p className="mt-2 text-center text-12 leading-paragraph text-muted-foreground">
              找文献 · 读论文 · 查期刊 · 改摘要，也能上传 PDF / 图片帮你分析
            </p>

            <div className="mt-6 flex w-full flex-col gap-2">
              {SUGGESTIONS.map(([Icon, label, prompt]) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-16 border border-border bg-surface-1 py-3"
                  style={{ paddingInline: 14 }}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-surface-card">
                    <Icon className="size-4 text-brand-green" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-14 font-medium text-foreground">
                      {label}
                    </span>
                    <span className="truncate text-12 text-faint">
                      {prompt}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>

        <div className="shrink-0 bg-background px-3 pb-3 pt-2">
          <div
            className="relative flex flex-col gap-2 rounded-16 border border-border-strong bg-surface-card"
            style={{ padding: 10 }}
          >
            <p className="truncate px-1 py-1 text-14 text-faint">
              问问智能助手 · Enter 发送 / Shift+Enter 换行 ·
              可直接粘贴/拖入图片文件
            </p>
            <div className="flex items-center gap-1">
              <span className="flex size-8 items-center justify-center rounded-8 text-muted-foreground">
                <Plus className="size-4" strokeWidth={2.2} />
              </span>
              <span className="flex h-8 items-center gap-1 rounded-8 px-2 text-muted-foreground">
                <Puzzle className="size-4" strokeWidth={2.2} />
              </span>
              <span className="flex-1" />
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-faint">
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </span>
            </div>
          </div>
        </div>
      </div>

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
          className={`relative flex flex-col items-center justify-center gap-1 ${label === "AI Claw" ? "text-foreground" : "text-faint"}`}
        >
          {label === "AI Claw" ? (
            <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
          ) : null}
          <Icon className="size-5" />
          <span
            className={`text-12 ${label === "AI Claw" ? "font-medium" : ""}`}
          >
            {label}
          </span>
        </span>
      ))}
    </footer>
  );
}
