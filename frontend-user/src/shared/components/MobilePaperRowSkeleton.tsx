/**
 * MobilePaperRow 的骨架占位 —— 与真实行同布局(头像 + 多行文本),
 * 列表加载时铺几行,比居中转圈更贴近最终形态、感知更快。
 * 用 animate-pulse(CSS),prefers-reduced-motion 下由全局 @media 自动停掉。
 */
function Row() {
  return (
    <div className="flex gap-3 border-b border-border px-4 py-3.5">
      <div className="size-10 shrink-0 animate-pulse rounded-pill bg-surface-2" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
        <div className="mt-1 h-4 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}

export function MobilePaperRowSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Row key={i} />
      ))}
    </div>
  );
}
