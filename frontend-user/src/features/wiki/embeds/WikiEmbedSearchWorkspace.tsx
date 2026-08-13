/**
 * 桌面搜索工作区 · 占位井。
 * 三栏对应词条所述的搜索器、暂存区和矩阵分析；后续再填产品截面。
 */
const PANES = ["搜索器", "暂存区", "矩阵分析"] as const;

export function WikiEmbedSearchWorkspace() {
  return (
    <div
      className="flex h-56 w-[min(100%,48rem)] overflow-hidden rounded-12 border border-dashed border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="search-workspace"
    >
      {PANES.map((pane, index) => (
        <div
          key={pane}
          className={
            index > 0
              ? "flex min-w-0 flex-1 flex-col items-center justify-center border-l border-dashed border-border"
              : "flex min-w-0 flex-1 flex-col items-center justify-center"
          }
        >
          <span className="text-12 text-faint">{pane}</span>
        </div>
      ))}
    </div>
  );
}
