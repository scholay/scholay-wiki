import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Filter,
  MoreHorizontal,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

/**
 * Preserve the compact geometry from the sibling mock while inheriting the
 * Wiki canvas palette so these surfaces follow the active color scheme.
 */
export const ADMIN_MOCK_THEME = {
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
} as CSSProperties;

export function AdminMockPage({
  fixture,
  title,
  description,
  actions,
  tabs,
  children,
}: {
  fixture: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="w-full max-w-5xl overflow-hidden rounded-12 border border-border bg-surface-1"
      style={ADMIN_MOCK_THEME}
      aria-hidden
      data-wiki-fixture={fixture}
    >
      <header className="border-b border-border-hairline bg-background px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-28 font-medium text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-20 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              {actions}
            </div>
          ) : null}
        </div>
        {tabs ? <div className="mt-3">{tabs}</div> : null}
      </header>
      <div className="p-3 sm:p-4 lg:p-6">{children}</div>
    </div>
  );
}

export function AdminMockTabs({
  items,
  active,
}: {
  items: readonly string[];
  active: string;
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-8 bg-surface-2 p-1">
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            "inline-flex h-6 items-center rounded-4 px-3 text-14 font-medium",
            item === active
              ? "bg-background text-foreground shadow-raised"
              : "text-muted-foreground",
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function AdminMockButton({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "outline" | "ghost";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-8 px-3 text-14 font-medium",
        tone === "primary" && "bg-foreground text-on-dark",
        tone === "outline" &&
          "border border-border bg-background text-foreground",
        tone === "ghost" && "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function AdminMockBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-4 border px-2 text-12 font-medium",
        tone === "neutral" && "border-border text-muted-foreground",
        tone === "green" && "border-brand-green text-brand-green",
        tone === "amber" && "border-brand-amber text-brand-amber",
        tone === "red" && "border-brand-red text-brand-red",
      )}
    >
      {children}
    </span>
  );
}

export type AdminTone = "neutral" | "green" | "amber" | "red" | "blue";

export interface AdminMetric {
  label: string;
  value: string;
  note: string;
  tone?: AdminTone;
}

export interface AdminRow {
  title: string;
  detail: string;
  meta: string;
  status: string;
  tone?: AdminTone;
  secondaryStatus?: string;
  secondaryTone?: AdminTone;
}

export interface AdminField {
  label: string;
  value: string;
  kind?: "value" | "secret" | "enabled" | "disabled" | "readonly";
}

export interface AdminSettingsSection {
  title: string;
  description: string;
  fields: AdminField[];
}

export interface AdminBar {
  label: string;
  value: string;
  width:
    | "full"
    | "five-sixths"
    | "four-fifths"
    | "three-fourths"
    | "two-thirds"
    | "half"
    | "third";
  tone?: AdminTone;
}

const STATUS_TONE: Record<AdminTone, string> = {
  neutral: "bg-surface-2 text-subtle",
  green: "bg-success-soft text-brand-green",
  amber: "bg-warning-soft text-brand-amber",
  red: "bg-danger-soft text-brand-red",
  blue: "bg-cat-blue-soft text-cat-blue",
};

const METRIC_TONE: Record<AdminTone, string> = {
  neutral: "text-foreground",
  green: "text-brand-green",
  amber: "text-brand-amber",
  red: "text-brand-red",
  blue: "text-cat-blue",
};

const BAR_TONE: Record<AdminTone, string> = {
  neutral: "bg-foreground",
  green: "bg-brand-green",
  amber: "bg-brand-amber",
  red: "bg-brand-red",
  blue: "bg-cat-blue",
};

const BAR_WIDTH: Record<AdminBar["width"], string> = {
  full: "w-full",
  "five-sixths": "w-5/6",
  "four-fifths": "w-4/5",
  "three-fourths": "w-3/4",
  "two-thirds": "w-2/3",
  half: "w-1/2",
  third: "w-1/3",
};

function AdminFixtureHeader({
  icon: Icon,
  title,
  description,
  action,
  tabs,
  activeTab,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: string;
  tabs?: readonly string[];
  activeTab?: string;
}) {
  return (
    <header className="border-b border-border bg-surface-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-subtle">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-18 font-medium text-foreground">{title}</h2>
            <p className="mt-1 text-12 leading-paragraph text-subtle">
              {description}
            </p>
          </div>
        </div>
        {action ? (
          <span className="inline-flex h-8 shrink-0 items-center justify-center self-start rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark sm:self-center">
            {action}
          </span>
        ) : null}
      </div>

      {tabs?.length ? (
        <div className="flex gap-1 overflow-hidden px-4 sm:px-6">
          {tabs.map((tab) => (
            <span
              key={tab}
              className={cn(
                "shrink-0 border-b-2 px-3 pb-3 text-12",
                tab === activeTab
                  ? "border-brand-red font-medium text-brand-red"
                  : "border-transparent text-faint",
              )}
            >
              {tab}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}

function AdminMetricGrid({ metrics }: { metrics: readonly AdminMetric[] }) {
  if (!metrics.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <section
          key={metric.label}
          className="rounded-8 border border-border bg-surface-card p-3"
        >
          <p className="text-12 text-faint">{metric.label}</p>
          <p
            className={cn(
              "mt-2 text-20 font-medium tabular-nums",
              METRIC_TONE[metric.tone ?? "neutral"],
            )}
          >
            {metric.value}
          </p>
          <p className="mt-1 text-12 text-subtle">{metric.note}</p>
        </section>
      ))}
    </div>
  );
}

export function AdminTableFixture({
  fixture,
  icon,
  title,
  description,
  action,
  tabs,
  activeTab,
  metrics = [],
  filters = ["全部状态", "最近 30 天"],
  searchPlaceholder = "搜索名称、ID 或关键词",
  rows,
  notice,
  detailTitle,
  detailLines = [],
}: {
  fixture: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action?: string;
  tabs?: readonly string[];
  activeTab?: string;
  metrics?: readonly AdminMetric[];
  filters?: readonly string[];
  searchPlaceholder?: string;
  rows: readonly AdminRow[];
  notice?: string;
  detailTitle?: string;
  detailLines?: readonly string[];
}) {
  return (
    <div
      className="w-full max-w-5xl overflow-hidden rounded-12 border border-border bg-surface-1"
      style={ADMIN_MOCK_THEME}
      aria-hidden
      data-wiki-fixture={fixture}
    >
      <AdminFixtureHeader
        icon={icon}
        title={title}
        description={description}
        action={action}
        tabs={tabs}
        activeTab={activeTab}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <AdminMetricGrid metrics={metrics} />

        {notice ? (
          <div className="flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-warning-soft px-3 py-2 text-12 leading-paragraph text-subtle">
            <AlertTriangle className="mt-1 size-3 shrink-0 text-brand-amber" />
            <span>{notice}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 min-w-40 flex-1 items-center gap-2 rounded-8 border border-border bg-surface-card px-3 text-12 text-faint">
            <Search className="size-3" />
            {searchPlaceholder}
          </div>
          {filters.map((filter) => (
            <span
              key={filter}
              className="inline-flex h-8 items-center gap-1 rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle"
            >
              <Filter className="size-3" />
              {filter}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1 overflow-hidden rounded-8 border border-border bg-surface-card">
            <div className="hidden items-center gap-3 border-b border-border bg-surface-1 px-3 py-2 text-12 text-faint sm:flex">
              <span className="min-w-0 flex-1">记录</span>
              <span className="w-28 shrink-0">时间 / 范围</span>
              <span className="w-24 shrink-0">状态</span>
              <span className="size-5 shrink-0" />
            </div>
            {rows.map((row) => (
              <div
                key={`${row.title}-${row.meta}`}
                className="flex items-start gap-3 border-b border-border-soft px-3 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-14 font-medium text-foreground">
                    {row.title}
                  </p>
                  <p className="mt-1 line-clamp-1 text-12 text-faint">
                    {row.detail}
                  </p>
                  <p className="mt-1 text-12 text-subtle sm:hidden">
                    {row.meta}
                  </p>
                </div>
                <span className="hidden w-28 shrink-0 pt-1 text-12 text-subtle sm:block">
                  {row.meta}
                </span>
                <div className="flex w-24 shrink-0 flex-col items-center gap-1">
                  <span
                    className={cn(
                      "inline-flex h-6 w-20 items-center justify-center rounded-pill px-2 text-12",
                      STATUS_TONE[row.tone ?? "neutral"],
                    )}
                  >
                    {row.status}
                  </span>
                  {row.secondaryStatus ? (
                    <span
                      className={cn(
                        "inline-flex h-6 w-20 items-center justify-center rounded-pill px-2 text-12",
                        STATUS_TONE[row.secondaryTone ?? "neutral"],
                      )}
                    >
                      {row.secondaryStatus}
                    </span>
                  ) : null}
                </div>
                <MoreHorizontal className="mt-1 size-5 shrink-0 text-faint" />
              </div>
            ))}
          </div>

          {detailTitle ? (
            <aside className="w-full shrink-0 rounded-8 border border-border bg-surface-card p-4 lg:w-64">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-green" />
                <h3 className="text-14 font-medium text-foreground">
                  {detailTitle}
                </h3>
              </div>
              <div className="mt-3 space-y-2">
                {detailLines.map((line) => (
                  <div
                    key={line}
                    className="flex items-start gap-2 rounded-8 bg-surface-1 px-3 py-2 text-12 leading-paragraph text-subtle"
                  >
                    <ChevronRight className="mt-1 size-3 shrink-0 text-faint" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AdminSettingsFixture({
  fixture,
  icon,
  title,
  description,
  tabs,
  activeTab,
  sections,
  notice,
  action = "保存更改",
}: {
  fixture: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tabs?: readonly string[];
  activeTab?: string;
  sections: readonly AdminSettingsSection[];
  notice?: string;
  action?: string;
}) {
  return (
    <div
      className="w-full max-w-5xl overflow-hidden rounded-12 border border-border bg-surface-1"
      style={ADMIN_MOCK_THEME}
      aria-hidden
      data-wiki-fixture={fixture}
    >
      <AdminFixtureHeader
        icon={icon}
        title={title}
        description={description}
        action={action}
        tabs={tabs}
        activeTab={activeTab}
      />

      <div className="space-y-4 p-4 sm:p-6">
        {notice ? (
          <div className="flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-warning-soft px-3 py-2 text-12 leading-paragraph text-subtle">
            <AlertTriangle className="mt-1 size-3 shrink-0 text-brand-amber" />
            <span>{notice}</span>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-8 border border-border bg-surface-card p-4"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border-soft pb-3">
                <div>
                  <h3 className="text-14 font-medium text-foreground">
                    {section.title}
                  </h3>
                  <p className="mt-1 text-12 leading-paragraph text-faint">
                    {section.description}
                  </p>
                </div>
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-faint">
                  <ChevronRight className="size-3" />
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <div key={field.label} className="min-w-0">
                    <p className="text-12 text-faint">{field.label}</p>
                    {field.kind === "enabled" || field.kind === "disabled" ? (
                      <div className="mt-1 flex h-8 items-center justify-between rounded-8 border border-border bg-surface-1 px-3 text-12 text-subtle">
                        <span>
                          {field.kind === "enabled" ? "已启用" : "已关闭"}
                        </span>
                        <span
                          className={cn(
                            "size-2 rounded-pill",
                            field.kind === "enabled"
                              ? "bg-brand-green"
                              : "bg-border-strong",
                          )}
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "mt-1 flex h-8 items-center rounded-8 border border-border px-3 text-12",
                          field.kind === "readonly"
                            ? "bg-surface-2 text-faint"
                            : "bg-surface-1 text-subtle",
                        )}
                      >
                        <span className="truncate">
                          {field.kind === "secret"
                            ? "••••••••••••"
                            : field.value}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminAnalyticsFixture({
  fixture,
  icon,
  title,
  description,
  metrics,
  tabs,
  activeTab,
  bars,
  activity,
  notice,
}: {
  fixture: string;
  icon: LucideIcon;
  title: string;
  description: string;
  metrics: readonly AdminMetric[];
  tabs: readonly string[];
  activeTab: string;
  bars: readonly AdminBar[];
  activity: readonly AdminRow[];
  notice?: string;
}) {
  return (
    <div
      className="w-full max-w-5xl overflow-hidden rounded-12 border border-border bg-surface-1"
      style={ADMIN_MOCK_THEME}
      aria-hidden
      data-wiki-fixture={fixture}
    >
      <AdminFixtureHeader
        icon={icon}
        title={title}
        description={description}
        action="导出数据"
        tabs={tabs}
        activeTab={activeTab}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <AdminMetricGrid metrics={metrics} />

        {notice ? (
          <div className="flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-warning-soft px-3 py-2 text-12 leading-paragraph text-subtle">
            <AlertTriangle className="mt-1 size-3 shrink-0 text-brand-amber" />
            <span>{notice}</span>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-8 border border-border bg-surface-card p-4 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-14 font-medium text-foreground">维度分布</h3>
              <span className="inline-flex items-center gap-1 text-12 text-faint">
                <Clock3 className="size-3" />
                最近 30 天
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {bars.map((bar) => (
                <div key={bar.label}>
                  <div className="flex items-center justify-between gap-3 text-12">
                    <span className="truncate text-subtle">{bar.label}</span>
                    <span className="shrink-0 tabular-nums text-faint">
                      {bar.value}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-pill bg-surface-2">
                    <div
                      className={cn(
                        "h-full rounded-pill",
                        BAR_WIDTH[bar.width],
                        BAR_TONE[bar.tone ?? "neutral"],
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-8 border border-border bg-surface-card p-4">
            <h3 className="text-14 font-medium text-foreground">最近记录</h3>
            <div className="mt-3 space-y-2">
              {activity.map((row) => (
                <div
                  key={`${row.title}-${row.meta}`}
                  className="rounded-8 bg-surface-1 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-12 font-medium text-foreground">
                      {row.title}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-pill px-2 py-1 text-12",
                        STATUS_TONE[row.tone ?? "neutral"],
                      )}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p className="mt-1 text-12 text-faint">{row.meta}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function AdminPermissionNotice() {
  return (
    <div className="flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-warning-soft px-3 py-2 text-12 leading-paragraph text-subtle">
      <CheckCircle2 className="mt-1 size-3 shrink-0 text-brand-green" />
      前端按角色隐藏入口，最终授权仍由后端权限校验决定。
    </div>
  );
}
