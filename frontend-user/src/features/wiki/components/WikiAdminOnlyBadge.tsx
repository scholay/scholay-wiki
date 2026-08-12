import { cn } from "@/shared/lib/utils";

export function WikiAdminOnlyBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-pill border border-brand-amber/25 bg-brand-amber-soft px-2 text-12 font-medium text-brand-amber",
        className,
      )}
    >
      仅管理员
    </span>
  );
}
