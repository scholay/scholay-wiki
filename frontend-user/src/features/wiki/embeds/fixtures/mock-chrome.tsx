import { ChevronDown, Search, Sparkles } from "lucide-react";

/**
 * product-mock SmartSearchToggle 的静态外观(无下拉、无切换)。
 * Token: text-2xs→12 · rounded-sm→4 · font-semibold→medium
 */
export function MockModeToggle({
  label,
  tone,
}: {
  label: string;
  tone: "engine" | "smart";
}) {
  const Icon = tone === "smart" ? Sparkles : Search;
  return (
    <div
      data-tour="home-mode-switch"
      className="inline-flex shrink-0 items-center border-r border-border pr-2.5 select-none"
    >
      <span
        className={
          tone === "smart"
            ? "inline-flex h-7 items-center gap-1 rounded-4 px-2 text-12 font-medium text-brand-red"
            : "inline-flex h-7 items-center gap-1 rounded-4 px-2 text-12 font-medium text-foreground"
        }
      >
        <Icon className="size-3 shrink-0" strokeWidth={2.25} />
        <span className="truncate">{label}</span>
        <ChevronDown
          className="size-3 shrink-0 opacity-50"
          strokeWidth={2.25}
          aria-hidden
        />
      </span>
    </div>
  );
}
