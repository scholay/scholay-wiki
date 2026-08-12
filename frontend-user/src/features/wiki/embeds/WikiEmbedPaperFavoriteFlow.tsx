import {
  BookmarkCheck,
  Check,
  ChevronRight,
  Library,
  Plus,
  X,
} from "lucide-react";

const FOLDERS = [
  { name: "默认文件夹", count: 28, selected: true, tone: "bg-cat-2" },
  { name: "扩散模型", count: 12, selected: false, tone: "bg-cat-4" },
  { name: "待精读", count: 7, selected: false, tone: "bg-cat-6" },
] as const;

/**
 * 桌面端“收藏到文件夹”选择弹窗 · 纯样式 fixture。
 * 来源：current library/components/CollectFolderPicker.tsx；不再拼接取消收藏的互斥 Popover。
 */
export function WikiEmbedPaperFavoriteFlow() {
  return (
    <div
      className="w-[28rem] max-w-full overflow-hidden rounded-16 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="paper-favorite-flow"
    >
      <div className="flex max-h-[70dvh] flex-col">
        <div
          className="flex shrink-0 items-start justify-between gap-2 border-b border-border"
          style={{
            paddingTop: 2,
            paddingRight: 20,
            paddingBottom: 14,
            paddingLeft: 20,
          }}
        >
          <div className="flex flex-col" style={{ gap: 2 }}>
            <h2 className="text-16 font-medium text-foreground">
              收藏到文件夹
            </h2>
            <p className="text-12 text-muted-foreground">
              把《Attention Is All You Need》保存到一个文件夹
            </p>
          </div>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-muted-foreground">
            <X className="size-4" />
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          <div className="flex w-full items-center gap-3 rounded-12 border border-border-button bg-surface-card p-3 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-8 border border-border bg-surface-1">
              <Plus className="size-5 text-brand-green" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
              <span className="text-14 font-medium text-foreground">
                新建文件夹
              </span>
              <span className="text-12 text-faint">创建一个新的论文分组</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" />
          </div>

          {FOLDERS.map((folder) => (
            <div
              key={folder.name}
              className={`flex w-full items-center gap-3 rounded-12 border bg-surface-card text-left ${folder.selected ? "border-brand-green" : "border-border"}`}
              style={{ padding: 10 }}
            >
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-8 bg-surface-1">
                <Library
                  className={`size-5 ${folder.selected ? "text-brand-green" : "text-muted-foreground"}`}
                />
                <span
                  className={`absolute left-0 top-0 w-full rounded-t-4 ${folder.tone}`}
                  style={{ height: 6 }}
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                <span className="truncate text-14 font-medium text-foreground">
                  {folder.name}
                  {folder.selected ? (
                    <span
                      className="text-12 font-normal text-faint"
                      style={{ marginLeft: 6 }}
                    >
                      默认
                    </span>
                  ) : null}
                </span>
                <span className="text-12 text-muted-foreground">
                  {folder.count} 篇论文
                </span>
              </span>
              <span
                className={`flex shrink-0 items-center justify-center rounded-pill border ${folder.selected ? "border-brand-green bg-brand-green text-on-brand" : "border-border-button"}`}
                style={{ width: 22, height: 22, borderWidth: 1.5 }}
              >
                {folder.selected ? <Check className="size-3.5" /> : null}
              </span>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-border px-4 pb-4 pt-3">
          <span className="flex h-12 w-full items-center justify-center gap-2 rounded-8 bg-brand-red text-14 font-medium text-on-brand">
            <BookmarkCheck className="size-4" />
            完成收藏
          </span>
        </div>
      </div>
    </div>
  );
}
