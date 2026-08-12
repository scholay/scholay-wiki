import {
  AlignLeft,
  Bookmark,
  ChevronUp,
  Compass,
  LayoutGrid,
  Quote,
  Search,
  Share2,
  SlidersHorizontal,
  User,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";
import { JournalCover } from "@/shared/components/JournalCover";

/** FeedPage + PaperFeedCard 的首屏冻结态。 */
export function WikiEmbedMobileFeed() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-surface-card"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-feed"
    >
      <FeedHeader active="论文" />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-1">
        <article
          className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background py-4 pr-16"
          style={{ paddingLeft: 20 }}
        >
          <div className="flex shrink-0 items-center gap-3">
            <JournalCover
              id={2020}
              name="NeurIPS"
              size="tile"
              className="h-12 w-12 rounded-8"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-14 font-medium text-foreground">
                NeurIPS
              </p>
              <p className="mt-1 truncate text-12 text-faint">2020 发表</p>
            </div>
          </div>

          <div className="mt-4 shrink-0">
            <h2 className="line-clamp-3 text-24 font-medium leading-display-tight text-foreground">
              Denoising Diffusion Probabilistic Models
            </h2>
            <p className="mt-2 truncate text-14 text-muted-foreground">
              Jonathan Ho, Ajay Jain 等 3 位作者
            </p>
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
            <Pill className="bg-brand-green text-on-brand">开放获取</Pill>
            <Pill className="bg-foreground text-on-brand">2020</Pill>
            <Pill className="bg-surface-2 text-muted-foreground">
              Machine Learning
            </Pill>
          </div>

          <div className="mt-4 grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-16 border border-border bg-border">
            <Metric label="被引" value="18.4k" highlight />
            <Metric label="参考文献" value="32" />
            <Metric label="高影响引用" value="1.2k" />
            <Metric label="发表年份" value="2020" />
          </div>

          <div className="mt-4 min-h-0 shrink">
            <p className="flex items-center gap-2 text-12 font-medium text-faint">
              <AlignLeft className="size-3" />
              摘要
            </p>
            <p className="mt-2 line-clamp-[7] text-12 leading-paragraph text-muted-foreground">
              We present high quality image synthesis results using diffusion
              probabilistic models, a class of latent variable models inspired
              by considerations from nonequilibrium thermodynamics.
            </p>
          </div>

          <div
            className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-4"
            style={{ right: 10 }}
          >
            <Rail label="作者" tone="green">
              <span className="text-16 font-medium text-on-brand">J</span>
            </Rail>
            <Rail label="收藏">
              <Bookmark className="size-5" />
            </Rail>
            <Rail label="分享">
              <Share2 className="size-5" />
            </Rail>
            <Rail label="引用">
              <Quote className="size-5" />
            </Rail>
          </div>
        </article>

        <div className="pointer-events-none absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-pill bg-surface-card/80 px-3 py-1">
          <ChevronUp className="size-4 text-muted-foreground" />
          <span className="whitespace-nowrap text-12 text-muted-foreground">
            上滑 · 下一篇论文
          </span>
        </div>
        <div className="absolute inset-x-4 bottom-0 flex items-center rounded-t-16 border border-b-0 border-border bg-surface-1/90 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-14 font-medium text-foreground">
              Attention Is All You Need
            </p>
            <p className="truncate text-12 text-faint">NeurIPS · 2017</p>
          </div>
        </div>
      </div>

      <MobileNav active="浏览" />
    </div>
  );
}

function FeedHeader({ active }: { active: "论文" | "期刊" | "情报" }) {
  return (
    <header
      className="flex shrink-0 items-center justify-between bg-background px-4"
      style={{ height: 50 }}
    >
      <SlidersHorizontal className="size-5 text-muted-foreground" />
      <nav className="flex items-center gap-6">
        {["论文", "期刊", "情报"].map((label) => (
          <span key={label} className="flex flex-col items-center gap-1">
            <span
              className={
                active === label
                  ? "text-16 font-medium text-foreground"
                  : "text-14 text-faint"
              }
            >
              {label}
            </span>
            <span
              className={
                active === label
                  ? "h-0.5 w-5 rounded-pill bg-brand-red"
                  : "h-0.5 w-2"
              }
            />
          </span>
        ))}
      </nav>
      <Search className="size-5 text-muted-foreground" />
    </header>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-pill py-1 text-12 font-medium ${className}`}
      style={{ paddingInline: 10 }}
    >
      {children}
    </span>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="bg-surface-1 px-3"
      style={{ minHeight: 62, paddingBlock: 10 }}
    >
      <p className="text-12 text-faint">{label}</p>
      <p
        className={`mt-1 text-16 font-medium ${highlight ? "text-brand-green" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Rail({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "green";
  children: React.ReactNode;
}) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className={
          tone === "green"
            ? "flex size-12 items-center justify-center rounded-pill bg-brand-green"
            : "flex size-12 items-center justify-center rounded-pill border border-border-strong bg-surface-card text-subtle"
        }
      >
        {children}
      </span>
      <span className="text-12 text-faint">{label}</span>
    </span>
  );
}

function MobileNav({ active }: { active: string }) {
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
          className={`relative flex flex-col items-center justify-center gap-1 ${active === label ? "text-foreground" : "text-faint"}`}
        >
          {active === label ? (
            <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
          ) : null}
          <Icon className="size-5" />
          <span className={`text-12 ${active === label ? "font-medium" : ""}`}>
            {label}
          </span>
        </span>
      ))}
    </footer>
  );
}
