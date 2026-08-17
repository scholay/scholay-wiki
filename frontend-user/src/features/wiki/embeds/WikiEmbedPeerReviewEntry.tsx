const REVIEW_ENTRIES = [
  { label: "期刊论文", comingSoon: false },
  { label: "学位论文", comingSoon: false },
  { label: "会议论文", comingSoon: true },
  { label: "其他", comingSoon: false },
] as const;

/** 智能审稿一级 Hub 的四个入口；会议论文是唯一禁用占位项。 */
export function WikiEmbedPeerReviewEntry() {
  return (
    <div
      className="grid w-[min(100%,56rem)] grid-cols-1 gap-4 bg-background px-6 py-10 sm:grid-cols-2"
      aria-hidden
      data-wiki-fixture="peer-review-entry"
    >
      {REVIEW_ENTRIES.map(({ label, comingSoon }) => (
        <section
          key={label}
          className={`flex h-36 w-full flex-col items-center justify-center gap-2 rounded-16 border border-border bg-surface-card px-6 text-center ${
            comingSoon ? "opacity-70" : ""
          }`}
          aria-disabled={comingSoon || undefined}
        >
          <span className="text-16 font-medium text-foreground">{label}</span>
          {comingSoon ? (
            <span className="text-12 text-faint">敬请期待</span>
          ) : null}
        </section>
      ))}
    </div>
  );
}
