import {
  AlignLeft,
  Bookmark,
  Compass,
  LayoutGrid,
  Quote,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  User,
} from "lucide-react";

/**
 * 移动 Feed · 纯样式 fixture。
 * 对齐 product-mock FeedTopTabs + PaperFeedCard + MobileBottomNav。
 */
export function WikiEmbedMobileFeed() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden rounded-20 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="mobile-feed"
    >
      <header className="flex h-12 items-center justify-between px-4">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        <nav className="flex items-center gap-6" data-wiki-spot="Feed 频道">
          {[
            ["论文", true],
            ["期刊", false],
            ["情报", false],
          ].map(([label, active]) => (
            <span
              key={String(label)}
              className="flex flex-col items-center gap-1"
            >
              <span
                className={
                  active
                    ? "text-16 font-medium text-foreground"
                    : "text-14 text-faint"
                }
              >
                {label}
              </span>
              <span
                className={
                  active ? "h-1 w-5 rounded-pill bg-brand-red" : "h-1 w-2"
                }
              />
            </span>
          ))}
        </nav>
        <Search className="size-4 text-muted-foreground" />
      </header>

      <article className="relative border-y border-border px-4 py-4 pr-16">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-8 bg-brand-amber-soft font-display text-12 font-medium text-brand-amber">
            NIPS
          </span>
          <div className="min-w-0">
            <p className="truncate text-14 font-medium text-foreground">
              NeurIPS
            </p>
            <p className="mt-1 text-12 text-faint">2020 发表</p>
          </div>
        </div>

        <h2 className="mt-4 text-24 font-medium leading-display-tight text-foreground">
          Denoising Diffusion Probabilistic Models
        </h2>
        <p className="mt-2 truncate text-14 text-muted-foreground">
          Jonathan Ho, Ajay Jain 等 3 位作者
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-pill bg-brand-green px-3 py-1 text-12 font-medium text-on-dark">
            开放获取
          </span>
          <span className="rounded-pill bg-foreground px-3 py-1 text-12 text-on-dark">
            2020
          </span>
          <span className="rounded-pill bg-surface-2 px-3 py-1 text-12 text-subtle">
            Machine Learning
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-8 border border-border bg-border">
          <Metric label="被引" value="18.4k" highlight />
          <Metric label="参考文献" value="32" />
          <Metric label="高影响引用" value="1.2k" />
          <Metric label="发表年份" value="2020" />
        </div>

        <div className="mt-4">
          <p className="flex items-center gap-2 text-12 font-medium text-faint">
            <AlignLeft className="size-3" />
            摘要
          </p>
          <p className="mt-2 line-clamp-4 text-14 leading-paragraph text-muted-foreground">
            We present high quality image synthesis results using diffusion
            probabilistic models, a class of latent variable models inspired by
            considerations from nonequilibrium thermodynamics.
          </p>
        </div>

        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4">
          <Rail icon={User} label="作者" tone="green" />
          <Rail icon={Bookmark} label="收藏" />
          <Rail icon={Share2} label="分享" />
          <Rail icon={Quote} label="引用" />
        </div>
      </article>

      <footer className="grid grid-cols-4 px-3 py-2">
        <BottomItem icon={Compass} label="浏览" active />
        <BottomItem icon={Sparkles} label="AI Claw" />
        <BottomItem icon={LayoutGrid} label="功能" />
        <BottomItem icon={User} label="我的" />
      </footer>
    </div>
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
    <div className="bg-surface-1 p-3">
      <p className="text-12 text-faint">{label}</p>
      <p
        className={
          highlight
            ? "mt-1 text-18 font-medium text-brand-green"
            : "mt-1 text-18 font-medium text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Rail({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof User;
  label: string;
  tone?: "green";
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={
          tone === "green"
            ? "flex size-10 items-center justify-center rounded-pill bg-brand-green text-on-dark"
            : "flex size-10 items-center justify-center rounded-pill border border-border-strong bg-surface-card text-subtle"
        }
      >
        <Icon className="size-4" />
      </span>
      <span className="text-12 text-faint">{label}</span>
    </div>
  );
}

function BottomItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Compass;
  label: string;
  active?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <Icon
        className={active ? "size-4 text-brand-red" : "size-4 text-faint"}
      />
      <span
        className={
          active ? "text-12 font-medium text-brand-red" : "text-12 text-faint"
        }
      >
        {label}
      </span>
    </div>
  );
}
