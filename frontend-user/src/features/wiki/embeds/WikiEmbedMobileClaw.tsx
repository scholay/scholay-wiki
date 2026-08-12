import {
  BookOpen,
  FileText,
  ImageIcon,
  LayoutGrid,
  Newspaper,
  PanelLeft,
  Paperclip,
  SendHorizontal,
  SquarePen,
  User,
  Compass,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

const SUGGESTIONS = [
  [BookOpen, "找一篇综述", "Transformer 在医学影像中的应用"],
  [FileText, "读 PDF 写摘要", "上传 PDF，整理一段中文摘要"],
  [Newspaper, "查期刊动态", "Nature Methods 最近的 AI 文章"],
  [ImageIcon, "看图分析", "检查实验装置中的对照设置"],
] as const;

/** /m/claw 新对话代表态；静态还原移动工作区、示例卡、输入栏和底部导航。 */
export function WikiEmbedMobileClaw() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden rounded-20 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="mobile-claw"
    >
      <div className="relative flex h-[36rem] flex-col bg-surface-card">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-sticky flex items-center justify-between bg-gradient-to-b from-surface-card via-surface-card/85 to-transparent px-2 pb-6 pt-2">
          <span className="flex size-9 items-center justify-center rounded-pill text-foreground">
            <PanelLeft className="size-5" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-pill text-faint">
            <SquarePen className="size-5" />
          </span>
        </div>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-3 pt-12">
          <div className="flex size-14 items-center justify-center rounded-16 bg-surface-2">
            <ClawBrandIcon className="size-7 text-brand-green" />
          </div>
          <h2 className="mt-4 font-serif text-20 font-medium text-foreground">
            智能助手 · Claw
          </h2>
          <p className="mt-2 text-center text-12 leading-paragraph text-muted-foreground">
            找文献 · 读论文 · 查期刊 · 改摘要
            <br />
            也能上传 PDF / 图片帮你分析
          </p>

          <div className="mt-6 flex w-full flex-col gap-2">
            {SUGGESTIONS.map(([Icon, label, prompt]) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-16 border border-border bg-surface-1 px-3 py-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-surface-card">
                  <Icon className="size-4 text-brand-green" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-12 font-medium text-foreground">
                    {label}
                  </span>
                  <span className="block truncate text-12 text-faint">
                    {prompt}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </main>

        <div className="mx-3 mb-3 rounded-16 border border-border bg-surface-card p-3 shadow-overlay">
          <p className="px-1 text-12 text-faint">给 Claw 发送消息…</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="flex size-8 items-center justify-center rounded-pill text-muted-foreground">
              <Paperclip className="size-4" />
            </span>
            <span className="flex size-8 items-center justify-center rounded-pill bg-foreground text-on-dark">
              <SendHorizontal className="size-4" />
            </span>
          </div>
        </div>
      </div>

      <footer className="grid h-16 grid-cols-4 border-t border-border px-2">
        <MobileNav icon={Compass} label="浏览" />
        <MobileNav icon={ClawBrandIcon} label="AI Claw" active />
        <MobileNav icon={LayoutGrid} label="功能" />
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
