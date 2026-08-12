import { Check, Folder, FolderPlus, Star, Trash2 } from "lucide-react";

const FOLDERS = [
  { name: "默认文件夹", count: 28, active: true },
  { name: "扩散模型", count: 12, active: false },
  { name: "待精读", count: 7, active: false },
] as const;

/** 收藏到文件夹与取消收藏确认 · 纯样式 fixture。 */
export function WikiEmbedPaperFavoriteFlow() {
  return (
    <div
      className="grid w-[min(100%,44rem)] gap-4 md:grid-cols-[1.2fr_1fr]"
      aria-hidden
      data-wiki-fixture="paper-favorite-flow"
    >
      <section className="rounded-12 border border-border bg-surface-card p-4">
        <div className="flex items-center gap-2">
          <Star className="size-4 text-brand-red" />
          <p className="text-16 font-medium text-foreground">收藏到文件夹</p>
        </div>
        <p className="mt-1 text-12 text-muted-foreground">
          选择一个文件夹；没有选择时使用默认文件夹
        </p>
        <div className="mt-4 space-y-2">
          {FOLDERS.map((folder) => (
            <div
              key={folder.name}
              className={
                folder.active
                  ? "flex items-center gap-2 rounded-8 border border-brand-red/40 bg-brand-red-soft px-3 py-2"
                  : "flex items-center gap-2 rounded-8 border border-border px-3 py-2"
              }
            >
              <Folder className="size-3 text-faint" />
              <span className="min-w-0 flex-1 truncate text-12 text-foreground">
                {folder.name}
              </span>
              <span className="text-12 tabular-nums text-faint">
                {folder.count}
              </span>
              {folder.active ? (
                <Check className="size-3 text-brand-red" />
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 text-12 text-subtle">
            <FolderPlus className="size-3" />
            新建文件夹
          </span>
          <span className="inline-flex h-8 items-center rounded-8 bg-brand-red px-3 text-12 font-medium text-on-dark">
            确认收藏
          </span>
        </div>
      </section>

      <section className="self-start rounded-12 border border-border bg-surface-card p-4">
        <div className="flex items-center gap-2">
          <Trash2 className="size-4 text-brand-red" />
          <p className="text-16 font-medium text-foreground">取消收藏？</p>
        </div>
        <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
          这会删除你的私有文库记录；已上传
          PDF、编辑过的元数据与处理状态也可能一并丢失。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <span className="inline-flex h-8 items-center rounded-8 border border-border px-3 text-12 text-subtle">
            保留
          </span>
          <span className="inline-flex h-8 items-center rounded-8 bg-brand-red px-3 text-12 font-medium text-on-dark">
            删除记录
          </span>
        </div>
      </section>
    </div>
  );
}
