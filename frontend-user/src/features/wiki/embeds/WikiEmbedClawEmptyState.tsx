import type { CSSProperties } from "react";
import {
  ArrowUp,
  BookOpen,
  ChartSpline,
  FileText,
  Newspaper,
  Plus,
  Presentation,
  Puzzle,
  Sigma,
} from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";

/**
 * The sibling mock predates the current app palette and type/radius scales.
 * Scope its original tokens to this frozen product surface so the same utility
 * roles render with the mock's actual white/gray palette and 4/6/8/12/16 radii.
 */
const MOCK_THEME = {
  "--wiki-mock-background": "0 0% 100%",
  "--wiki-mock-surface-1": "0 0% 98%",
  "--wiki-mock-surface-2": "0 0% 96.1%",
  "--wiki-mock-surface-3": "0 0% 97.3%",
  "--wiki-mock-foreground": "0 0% 6.7%",
  "--wiki-mock-subtle": "0 0% 26.7%",
  "--wiki-mock-muted": "0 0% 40%",
  "--wiki-mock-faint": "0 0% 60%",
  "--wiki-mock-border-soft": "0 0% 93.3%",
  "--wiki-mock-border": "0 0% 91.4%",
  "--wiki-mock-border-strong": "0 0% 84.7%",
  "--wiki-mock-red": "0 71% 47%",
  "--wiki-mock-green": "120 49% 32%",
  "--wiki-mock-amber": "41 84% 47%",
  "--wiki-mock-danger-soft": "0 100% 98%",
  "--wiki-mock-warning-soft": "41 47% 90%",
  "--wiki-mock-shadow": "0 0 0",
  "--wiki-mock-space-2": "0.125rem",
  "--wiki-mock-space-6": "0.375rem",
  "--wiki-mock-space-10": "0.625rem",
  "--wiki-mock-space-14": "0.875rem",
  "--wiki-mock-space-20": "1.25rem",
  "--background": "hsl(var(--wiki-mock-background))",
  "--surface-card": "hsl(var(--wiki-mock-background))",
  "--surface-1": "hsl(var(--wiki-mock-surface-1))",
  "--surface-2": "hsl(var(--wiki-mock-surface-2))",
  "--surface-3": "hsl(var(--wiki-mock-surface-3))",
  "--foreground": "hsl(var(--wiki-mock-foreground))",
  "--subtle-foreground": "hsl(var(--wiki-mock-subtle))",
  "--muted-foreground": "hsl(var(--wiki-mock-muted))",
  "--faint-foreground": "hsl(var(--wiki-mock-faint))",
  "--border-hairline": "hsl(var(--wiki-mock-border-soft))",
  "--border": "hsl(var(--wiki-mock-border))",
  "--border-strong": "hsl(var(--wiki-mock-border-strong))",
  "--brand-red": "hsl(var(--wiki-mock-red))",
  "--brand-green": "hsl(var(--wiki-mock-green))",
  "--brand-amber": "hsl(var(--wiki-mock-amber))",
  "--brand-red-soft": "hsl(var(--wiki-mock-danger-soft))",
  "--brand-green-soft":
    "color-mix(in srgb, hsl(var(--wiki-mock-green)) 10%, hsl(var(--wiki-mock-background)))",
  "--brand-amber-soft": "hsl(var(--wiki-mock-warning-soft))",
  "--on-brand": "hsl(var(--wiki-mock-background))",
  "--radius-4": "0.25rem",
  "--radius-8": "0.375rem",
  "--radius-12": "0.5rem",
  "--radius-16": "0.75rem",
  "--radius-20": "1rem",
  "--text-12": "0.625rem",
  "--text-14": "0.6875rem",
  "--text-16": "0.75rem",
  "--text-18": "0.8125rem",
  "--text-20": "0.875rem",
  "--text-24": "1rem",
  "--text-28": "1.25rem",
  "--text-32": "1.5rem",
  "--font-weight-medium": "700",
  "--shadow-raised": "0 1px 2px 0 rgb(var(--wiki-mock-shadow) / 0.05)",
} as CSSProperties;

const SUGGESTIONS = [
  { label: "找一篇综述", icon: BookOpen },
  { label: "读 PDF 写摘要", icon: FileText },
  { label: "查期刊动态", icon: Newspaper },
] as const;

const TEMPLATE_CARDS = [
  {
    key: "ppt",
    title: "制作PPT",
    subtitle: "一句话描述主题 → 多页可交互演示稿",
    icon: Presentation,
    chip: "bg-brand-amber/10 text-brand-amber",
  },
  {
    key: "scidraw",
    title: "科研绘图",
    subtitle: "一句话描述 → 论文级图表 / 示意图",
    icon: ChartSpline,
    chip: "bg-brand-green/10 text-brand-green",
  },
  {
    key: "statlab",
    title: "数据分析",
    subtitle: "传数据 → 自动选对检验 → 三线表与结果段",
    icon: Sigma,
    chip: "bg-brand-red/10 text-brand-red",
  },
] as const;

/**
 * Claw 桌面新会话空态的静态截面。
 *
 * 结构与尺寸直接对应 ClawHero + ChatComposer + TemplateCards：42rem 内容宽、
 * 16px composer 圆角，以及按当前三张 active 模板动态计算的扇形。
 */
export function WikiEmbedClawEmptyState() {
  const cardCount = TEMPLATE_CARDS.length;
  const center = (cardCount - 1) / 2;
  const cardWidth = cardCount <= 2 ? 15 : cardCount === 3 ? 13.5 : 12;
  const overlap = cardCount <= 2 ? 2.4 : 3;
  const spread = cardCount <= 2 ? 5 : 6.5;
  const arc = 9;

  return (
    <div
      className="flex w-[42rem] max-w-full flex-col items-center bg-background py-8"
      style={MOCK_THEME}
      aria-hidden
      data-wiki-fixture="claw-empty-state"
    >
      <h2 className="m-0">
        <BrandLogo size="xl" />
      </h2>

      <div className="mt-6 flex w-full flex-col gap-[var(--wiki-mock-space-6)]">
        <div className="relative flex flex-col gap-[var(--wiki-mock-space-6)] rounded-20 border border-border-strong bg-background p-2 shadow-raised">
          <div className="min-h-10 px-1 py-[var(--wiki-mock-space-2)] text-18 leading-paragraph text-faint">
            问问智能助手 · Enter 发送 / Shift+Enter 换行 ·
            可直接粘贴/拖入图片文件
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-flex size-9 items-center justify-center rounded-12 text-muted-foreground">
              <Plus className="size-4" />
            </span>
            <span className="inline-flex size-9 items-center justify-center rounded-12 text-muted-foreground">
              <Puzzle className="size-4" />
            </span>
            <span className="flex-1" />
            <span className="text-14 text-muted-foreground">GPT-5</span>
            <span className="inline-flex size-9 items-center justify-center rounded-12 bg-surface-2 text-faint">
              <ArrowUp className="size-4" />
            </span>
          </div>
        </div>
      </div>

      <div className="mt-[var(--wiki-mock-space-20)] w-full overflow-hidden px-2 pb-3 pt-6">
        <div className="flex items-end justify-center">
          {TEMPLATE_CARDS.map(
            ({ key, title, subtitle, icon: Icon, chip }, index) => (
              <article
                key={key}
                className="relative flex shrink-0 flex-col overflow-hidden rounded-16 border border-border bg-background text-left shadow-raised"
                style={{
                  width: `${cardWidth}rem`,
                  marginLeft: index === 0 ? "0" : `-${overlap}rem`,
                  transform: `translateY(${Math.abs(index - center) * arc}px) rotate(${(index - center) * spread}deg)`,
                  transformOrigin: "bottom center",
                  zIndex: index + 1,
                }}
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-2">
                  <TemplateIllustration cardKey={key} />
                </div>
                <div className="flex items-center gap-2 px-3 py-[var(--wiki-mock-space-10)]">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-8 ${chip}`}
                  >
                    <Icon className="size-[var(--wiki-mock-space-14)]" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-20 font-medium text-foreground">
                      {title}
                    </div>
                    <div className="truncate text-12 text-muted-foreground">
                      {subtitle}
                    </div>
                  </div>
                </div>
              </article>
            ),
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(({ label, icon: Icon }) => (
          <span
            key={label}
            className="inline-flex items-center gap-[var(--wiki-mock-space-6)] rounded-pill border border-border bg-background px-3 py-[var(--wiki-mock-space-6)] text-16 text-muted-foreground shadow-raised"
          >
            <Icon className="size-[var(--wiki-mock-space-14)] text-faint" />
            {label}
          </span>
        ))}
      </div>

      <span className="sr-only">
        制作 PPT、科研绘图和数据分析三种可用模板。
      </span>
    </div>
  );
}

function violinPath(cx: number, mu: number, sd: number, maxWidth: number) {
  const sampleCount = 72;
  const lowerBound = mu - 2.6 * sd;
  const upperBound = mu + 2.6 * sd;
  const right: string[] = [];
  const left: string[] = [];

  for (let index = 0; index <= sampleCount; index += 1) {
    const y = lowerBound + ((upperBound - lowerBound) * index) / sampleCount;
    const z = (y - mu) / sd;
    const width = maxWidth * Math.exp(-0.5 * z * z);
    right.push(`${(cx + width).toFixed(2)} ${y.toFixed(2)}`);
    left.push(`${(cx - width).toFixed(2)} ${y.toFixed(2)}`);
  }

  left.reverse();
  return `M ${right.concat(left).join(" L ")} Z`;
}

function TemplateIllustration({ cardKey }: { cardKey: string }) {
  if (cardKey === "ppt") {
    return (
      <div className="absolute inset-0 overflow-hidden bg-foreground">
        <div className="absolute left-1/2 top-1/2 h-[66%] w-[72%] -translate-x-[58%] -translate-y-1/2 rounded-12 border border-on-dark/5 bg-on-dark/5" />
        <div className="absolute left-1/2 top-1/2 h-[72%] w-[78%] -translate-x-[54%] -translate-y-1/2 rounded-12 border border-on-dark/10 bg-on-dark/5" />
        <div className="absolute left-1/2 top-1/2 flex h-[78%] w-[82%] -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-12 border border-on-dark/20 bg-on-dark/10 p-3">
          <span className="h-1 w-6 rounded-pill bg-brand-green" />
          <span className="h-2 w-[70%] rounded-4 bg-on-dark/85" />
          <span className="mt-1 h-1 w-[84%] rounded-4 bg-on-dark/30" />
          <span className="h-1 w-[60%] rounded-4 bg-on-dark/30" />
          <span className="mt-auto flex h-6 items-end gap-1">
            {[42, 66, 50, 92, 62].map((height, index) => (
              <span
                key={height}
                className={
                  index === 3
                    ? "w-full rounded-4 bg-brand-green"
                    : "w-full rounded-4 bg-on-dark/20"
                }
                style={{ height: `${height}%` }}
              />
            ))}
          </span>
        </div>
        <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="size-1 rounded-pill bg-on-dark/50" />
          ))}
        </span>
      </div>
    );
  }

  if (cardKey === "scidraw") {
    const points = [34, 22, 27, 11, 18];
    const comparison = [40, 37, 33, 29, 25];
    return (
      <div className="absolute inset-0 bg-background px-1 py-2">
        {[25, 50, 75].map((top) => (
          <span
            key={top}
            className="absolute left-0 right-0 h-px bg-border"
            style={{ top: `${top}%` }}
          />
        ))}
        <div className="absolute inset-x-1 bottom-2 top-2">
          {points.map((value, index) => {
            if (index === points.length - 1) return null;
            const next = points[index + 1];
            const left = index * 25;
            const dx = 25;
            const dy = next - value;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <span
                key={`main-${left}`}
                className="absolute h-[var(--wiki-mock-space-2)] origin-left rounded-pill bg-brand-green"
                style={{
                  left: `${left}%`,
                  top: `${value}%`,
                  width: `${length}%`,
                  transform: `rotate(${angle}deg)`,
                }}
              />
            );
          })}
          {comparison.map((value, index) => {
            if (index === comparison.length - 1) return null;
            const next = comparison[index + 1];
            const left = index * 25;
            const dx = 25;
            const dy = next - value;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <span
                key={`comparison-${left}`}
                className="absolute h-px origin-left border-t border-dashed border-faint"
                style={{
                  left: `${left}%`,
                  top: `${value}%`,
                  width: `${length}%`,
                  transform: `rotate(${angle}deg)`,
                }}
              />
            );
          })}
          {points.map((value, index) => (
            <span
              key={`point-${value}`}
              className="absolute size-[var(--wiki-mock-space-6)] -translate-x-1/2 -translate-y-1/2 rounded-pill border border-background bg-brand-green"
              style={{ left: `${index * 25}%`, top: `${value}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (cardKey === "statlab") {
    const baseline = 74;
    const boxWidth = 10;
    const groups = [
      {
        key: "control",
        cx: 46,
        mu: 58,
        sd: 5.7,
        maxWidth: 21,
        q3: 54,
        q1: 62,
        median: 58,
        whiskerLow: 48,
        whiskerHigh: 68,
        accent: false,
      },
      {
        key: "experiment",
        cx: 114,
        mu: 40,
        sd: 5.7,
        maxWidth: 23,
        q3: 36,
        q1: 44,
        median: 40,
        whiskerLow: 30,
        whiskerHigh: 50,
        accent: true,
      },
    ] as const;

    return (
      <div className="absolute inset-0 bg-gradient-to-b from-surface-1 to-background">
        <svg
          viewBox="0 0 160 90"
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          <defs>
            <linearGradient
              id="wiki-claw-stat-accent"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="currentColor"
                stopOpacity="0.36"
                className="text-brand-red"
              />
              <stop
                offset="100%"
                stopColor="currentColor"
                stopOpacity="0.08"
                className="text-brand-red"
              />
            </linearGradient>
            <linearGradient id="wiki-claw-stat-ink" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="currentColor"
                stopOpacity="0.13"
                className="text-foreground"
              />
              <stop
                offset="100%"
                stopColor="currentColor"
                stopOpacity="0.03"
                className="text-foreground"
              />
            </linearGradient>
          </defs>

          {[34, 48, 62].map((gridY) => (
            <line
              key={gridY}
              x1="0"
              y1={gridY}
              x2="160"
              y2={gridY}
              className="stroke-current text-border"
              strokeWidth="0.7"
            />
          ))}
          <line
            x1="0"
            y1={baseline}
            x2="160"
            y2={baseline}
            className="stroke-current text-border-strong"
            strokeWidth="1.1"
          />

          {groups.map((group) => {
            const tone = group.accent ? "text-brand-red" : "text-subtle";
            return (
              <g key={group.key}>
                <path
                  d={violinPath(group.cx, group.mu, group.sd, group.maxWidth)}
                  fill={`url(#wiki-claw-stat-${group.accent ? "accent" : "ink"})`}
                  className={`stroke-current ${tone}`}
                  strokeWidth="1.2"
                  strokeOpacity={group.accent ? 0.9 : 0.45}
                  strokeLinejoin="round"
                />
                <line
                  x1={group.cx}
                  y1={group.whiskerLow}
                  x2={group.cx}
                  y2={group.whiskerHigh}
                  className={`stroke-current ${tone}`}
                  strokeWidth="1.1"
                  opacity={group.accent ? 0.85 : 0.45}
                />
                <rect
                  x={group.cx - boxWidth / 2}
                  y={group.q3}
                  width={boxWidth}
                  height={group.q1 - group.q3}
                  rx="2"
                  className={`fill-current ${tone}`}
                  opacity={group.accent ? 0.92 : 0.5}
                />
                <circle
                  cx={group.cx}
                  cy={group.median}
                  r="2.2"
                  className="fill-current text-surface-card"
                />
                <rect
                  x={group.cx - 12}
                  y="79"
                  width="24"
                  height="3.2"
                  rx="1.6"
                  className={`fill-current ${group.accent ? "text-brand-red" : "text-foreground"}`}
                  opacity={group.accent ? 0.72 : 0.26}
                />
              </g>
            );
          })}

          <path
            d="M 46 21 L 46 10.5 L 114 10.5 L 114 21"
            fill="none"
            className="stroke-current text-brand-red"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.8"
          />
          <g>
            <rect
              x="58"
              y="3"
              width="44"
              height="15"
              rx="7.5"
              className="fill-current text-brand-red-soft"
            />
            <rect
              x="58"
              y="3"
              width="44"
              height="15"
              rx="7.5"
              fill="none"
              className="stroke-current text-brand-red"
              strokeWidth="1"
              opacity="0.45"
            />
            <text
              x="80"
              y="13.6"
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              className="fill-current text-brand-red"
            >
              P&lt;.001
            </text>
          </g>
        </svg>
      </div>
    );
  }

  return null;
}
