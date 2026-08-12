import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AlertTriangle, Check, ChevronRight, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type DetailTone = "neutral" | "green" | "amber" | "red" | "blue";

export interface DetailMetric {
  label: string;
  value: string;
  note?: string;
  tone?: DetailTone;
}

export interface DetailField {
  label: string;
  value: string;
  hint?: string;
  kind?: "text" | "secret" | "select" | "toggle" | "textarea" | "readonly";
  tone?: DetailTone;
}

export interface DetailRow {
  id: string;
  cells: readonly ReactNode[];
}

export interface DetailBar {
  label: string;
  value: string;
  width:
    | "full"
    | "five-sixths"
    | "four-fifths"
    | "three-fourths"
    | "two-thirds"
    | "three-fifths"
    | "half"
    | "two-fifths"
    | "third"
    | "quarter";
  tone?: DetailTone;
}

const TONE_CLASS: Record<DetailTone, string> = {
  neutral: "bg-surface-2 text-subtle",
  green: "bg-success-soft text-brand-green",
  amber: "bg-warning-soft text-brand-amber",
  red: "bg-danger-soft text-brand-red",
  blue: "bg-cat-blue-soft text-cat-blue",
};

const TEXT_TONE_CLASS: Record<DetailTone, string> = {
  neutral: "text-foreground",
  green: "text-brand-green",
  amber: "text-brand-amber",
  red: "text-brand-red",
  blue: "text-cat-blue",
};

const BAR_TONE_CLASS: Record<DetailTone, string> = {
  neutral: "bg-foreground",
  green: "bg-brand-green",
  amber: "bg-brand-amber",
  red: "bg-brand-red",
  blue: "bg-cat-blue",
};

const BAR_WIDTH_CLASS: Record<DetailBar["width"], string> = {
  full: "w-full",
  "five-sixths": "w-5/6",
  "four-fifths": "w-4/5",
  "three-fourths": "w-3/4",
  "two-thirds": "w-2/3",
  "three-fifths": "w-3/5",
  half: "w-1/2",
  "two-fifths": "w-2/5",
  third: "w-1/3",
  quarter: "w-1/4",
};

export function AdminDetailFrame({
  fixture,
  icon: Icon,
  title,
  description,
  eyebrow = "后台管理",
  action,
  children,
}: {
  fixture: string;
  icon: LucideIcon;
  title: string;
  description: string;
  eyebrow?: string;
  action?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="w-full max-w-5xl overflow-hidden rounded-12 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture={fixture}
    >
      <header className="border-b border-border bg-surface-card px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-subtle">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-12 font-medium text-brand-red">{eyebrow}</p>
              <h2 className="mt-1 text-18 font-medium text-foreground">
                {title}
              </h2>
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
      </header>
      <div className="space-y-4 p-4 sm:p-6">{children}</div>
    </div>
  );
}

export function DetailSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-8 border border-border bg-surface-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div>
          <h3 className="text-14 font-medium text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1 text-12 leading-paragraph text-faint">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <span className="inline-flex h-7 shrink-0 items-center rounded-8 border border-border px-2.5 text-12 text-subtle">
            {action}
          </span>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function DetailTabs({
  tabs,
  active,
}: {
  tabs: readonly string[];
  active: string;
}) {
  return (
    <div className="flex gap-1 overflow-hidden border-b border-border">
      {tabs.map((tab) => (
        <span
          key={tab}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2.5 text-12",
            tab === active
              ? "border-brand-red font-medium text-brand-red"
              : "border-transparent text-faint",
          )}
        >
          {tab}
        </span>
      ))}
    </div>
  );
}

export function DetailMetricStrip({
  metrics,
}: {
  metrics: readonly DetailMetric[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-8 border border-border bg-surface-card p-3"
        >
          <p className="text-12 text-faint">{metric.label}</p>
          <p
            className={cn(
              "mt-2 text-20 font-medium tabular-nums",
              TEXT_TONE_CLASS[metric.tone ?? "neutral"],
            )}
          >
            {metric.value}
          </p>
          {metric.note ? (
            <p className="mt-1 text-12 text-subtle">{metric.note}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function DetailBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: DetailTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill px-2 py-1 text-12",
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

export function DetailNotice({
  children,
  tone = "amber",
}: {
  children: ReactNode;
  tone?: DetailTone;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-8 border px-3 py-2 text-12 leading-paragraph",
        tone === "red"
          ? "border-brand-red/30 bg-danger-soft text-subtle"
          : tone === "green"
            ? "border-brand-green/30 bg-success-soft text-subtle"
            : "border-brand-amber/30 bg-warning-soft text-subtle",
      )}
    >
      {tone === "green" ? (
        <Check className="mt-1 size-3 shrink-0 text-brand-green" />
      ) : (
        <AlertTriangle
          className={cn(
            "mt-1 size-3 shrink-0",
            tone === "red" ? "text-brand-red" : "text-brand-amber",
          )}
        />
      )}
      <span>{children}</span>
    </div>
  );
}

export function DetailFields({
  fields,
  columns = 2,
}: {
  fields: readonly DetailField[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {fields.map((field) => (
        <div
          key={field.label}
          className={cn(field.kind === "textarea" && "sm:col-span-2")}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-12 text-faint">{field.label}</p>
            {field.hint ? (
              <span className="text-12 text-faint">{field.hint}</span>
            ) : null}
          </div>
          {field.kind === "toggle" ? (
            <div className="mt-1 flex h-9 items-center justify-between rounded-8 border border-border bg-surface-1 px-3 text-12 text-subtle">
              <span>{field.value}</span>
              <span className="flex h-5 w-9 items-center justify-end rounded-pill bg-brand-green p-1">
                <span className="size-4 rounded-pill bg-surface-card" />
              </span>
            </div>
          ) : (
            <div
              className={cn(
                "mt-1 flex rounded-8 border border-border px-3 text-12 leading-paragraph",
                field.kind === "textarea"
                  ? "min-h-20 items-start py-2"
                  : "h-9 items-center",
                field.kind === "readonly"
                  ? "bg-surface-2 text-faint"
                  : "bg-surface-1 text-subtle",
                field.kind === "select" && "justify-between",
                field.tone && TEXT_TONE_CLASS[field.tone],
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {field.kind === "secret" ? "••••••••••••••••" : field.value}
              </span>
              {field.kind === "select" ? (
                <ChevronRight className="size-3 rotate-90 text-faint" />
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function DetailTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly DetailRow[];
}) {
  return (
    <div className="overflow-hidden rounded-8 border border-border">
      <div
        className="hidden gap-3 border-b border-border bg-surface-1 px-3 py-2 text-12 text-faint sm:grid"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
        }}
      >
        {columns.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid gap-2 border-b border-border-soft px-3 py-3 text-12 last:border-b-0 sm:gap-3"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
          }}
        >
          {row.cells.map((cell, index) => (
            <div
              key={`${row.id}-${columns[index]}`}
              className="min-w-0 text-subtle"
            >
              <span className="mr-2 text-faint sm:hidden">
                {columns[index]}
              </span>
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function DetailBars({ bars }: { bars: readonly DetailBar[] }) {
  return (
    <div className="space-y-3">
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
                BAR_WIDTH_CLASS[bar.width],
                BAR_TONE_CLASS[bar.tone ?? "neutral"],
              )}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailDialog({
  title,
  description,
  children,
  primary = "确认",
  secondary = "取消",
  destructive = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  primary?: string;
  secondary?: string;
  destructive?: boolean;
}) {
  return (
    <div className="rounded-8 bg-surface-2 p-3 sm:p-6">
      <div className="mx-auto max-w-xl overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-16 font-medium text-foreground">{title}</h3>
            {description ? (
              <p className="mt-1 text-12 leading-paragraph text-faint">
                {description}
              </p>
            ) : null}
          </div>
          <X className="size-4 shrink-0 text-faint" />
        </div>
        <div className="space-y-4 p-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <span className="inline-flex h-8 items-center rounded-8 border border-border px-3 text-12 text-subtle">
            {secondary}
          </span>
          <span
            className={cn(
              "inline-flex h-8 items-center rounded-8 px-3 text-12 font-medium text-on-dark",
              destructive ? "bg-brand-red" : "bg-foreground",
            )}
          >
            {primary}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DetailDrawer({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-112 justify-end overflow-hidden rounded-8 bg-surface-2 p-2 sm:p-3">
      <aside className="w-full max-w-2xl overflow-hidden rounded-8 border border-border bg-surface-card shadow-overlay">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-16 font-medium text-foreground">{title}</h3>
            <p className="mt-1 text-12 text-faint">{meta}</p>
          </div>
          <X className="size-4 shrink-0 text-faint" />
        </div>
        <div className="space-y-4 p-4">{children}</div>
      </aside>
    </div>
  );
}

export function DetailSteps({
  items,
}: {
  items: readonly {
    label: string;
    detail: string;
    status: string;
    tone?: DetailTone;
  }[];
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={item.label}
          className="flex items-start gap-3 rounded-8 border border-border-soft bg-surface-1 p-3"
        >
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-12 tabular-nums text-subtle">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-12 font-medium text-foreground">{item.label}</p>
            <p className="mt-1 text-12 leading-paragraph text-faint">
              {item.detail}
            </p>
          </div>
          <DetailBadge tone={item.tone}>{item.status}</DetailBadge>
        </div>
      ))}
    </div>
  );
}

export function DetailEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-8 border border-dashed border-border p-6 text-center">
      <span className="inline-flex size-8 items-center justify-center rounded-pill bg-surface-2 text-faint">
        <ChevronRight className="size-3" />
      </span>
      <p className="mt-2 text-14 font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-12 leading-paragraph text-faint">
        {description}
      </p>
    </div>
  );
}
