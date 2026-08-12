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
  [Folder, "文献集", "我的文献集合", "text-brand-red"],
] as const;

/** /m/tools 首页代表态；对齐站内能力与全网工具入口的两级结构。 */
export function WikiEmbedMobileTools() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden rounded-20 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="mobile-tools"
    >
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface-card px-4">
        <span className="text-18 font-medium text-foreground">功能</span>
        <Search className="size-5 text-muted-foreground" />
      </header>

      <main className="space-y-6 px-4 py-4">
        <section className="space-y-3">
          <div>
            <h2 className="text-14 font-medium text-foreground">站内功能</h2>
            <p className="text-12 text-faint">Scholay 原生科研能力</p>
          </div>

          <div className="flex items-center gap-3 rounded-12 bg-brand-amber-soft p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-card">
              <ClawBrandIcon className="size-6 text-brand-green" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-14 font-medium text-foreground">
                AI Claw 科研智能体
              </span>
              <span className="block truncate text-12 text-muted-foreground">
                用一句话指挥它帮你找、读、写、比
              </span>
            </span>
            <span className="rounded-pill bg-brand-red px-4 py-2 text-12 font-medium text-on-dark">
              开启
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {NATIVE_TOOLS.map(([Icon, name, desc, tone]) => (
              <div
                key={name}
                className="flex flex-col gap-2 rounded-12 border border-border bg-surface-card p-4"
              >
                <span className="flex size-9 items-center justify-center rounded-8 bg-surface-2">
                  <Icon className={`size-5 ${tone}`} />
                </span>
                <span>
                  <span className="block text-12 font-medium text-foreground">
                    {name}
                  </span>
                  <span className="block truncate text-12 text-faint">
                    {desc}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-14 font-medium text-foreground">全网功能</h2>
            <p className="text-12 text-faint">科研网站、工具与数据库目录</p>
          </div>
          <div className="flex flex-col gap-3 rounded-12 bg-foreground p-4 text-on-dark">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-8 bg-surface-card/10">
                <Globe className="size-5" />
              </span>
              <span className="flex-1 text-14 font-medium">科研全网导航</span>
              <ArrowRight className="size-4" />
            </div>
            <p className="text-12 leading-paragraph text-on-dark/70">
              海量网站、工具和数据库，覆盖检索、写作、绘图与数据流程。
            </p>
            <div className="flex flex-wrap gap-2">
              {["arXiv", "Zotero", "Overleaf", "Connected Papers"].map(
                (label) => (
                  <span
                    key={label}
                    className="rounded-pill bg-surface-card/10 px-3 py-1 text-12"
                  >
                    {label}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="grid h-16 grid-cols-4 border-t border-border bg-surface-card px-2">
        <MobileNav icon={Compass} label="浏览" />
        <MobileNav icon={ClawBrandIcon} label="AI Claw" />
        <MobileNav icon={LayoutGrid} label="功能" active />
        <MobileNav icon={User} label="我的" />
      </footer>
    </div>
  );
}

function MobileNav({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Compass;
  label: string;
  active?: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-1">
      {active ? (
        <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
      ) : null}
      <Icon className="size-5" />
      <span
        className={
          active ? "text-12 font-medium text-foreground" : "text-12 text-faint"
        }
      >
        {label}
      </span>
    </div>
  );
}
