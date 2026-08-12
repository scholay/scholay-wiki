import { Clock3, History, Pencil, SquarePen, Trash2 } from "lucide-react";

const SESSIONS = [
  { title: "扩散模型综述", time: "08-12 14:30", active: true },
  { title: "MRI 数据集比较", time: "08-11 19:05", active: false },
  { title: "修改回复信提纲", time: "08-09 10:42", active: false },
] as const;

/** Claw 会话历史、管理动作与长历史入口 · 纯样式 fixture。 */
export function WikiEmbedClawSessionHistory() {
  return (
    <div
      className="w-[min(100%,42rem)] rounded-12 border border-border bg-surface-card p-4"
      aria-hidden
      data-wiki-fixture="claw-session-history"
    >
      <div className="relative flex h-10 items-center rounded-12 border border-border bg-surface-card px-2 shadow-raised">
        <span className="inline-flex h-7 items-center gap-2 rounded-8 bg-surface-1 px-2 text-12 text-subtle">
          <History className="size-3.5" />
          <span className="font-medium tabular-nums text-foreground">3</span>
        </span>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-20 text-12 font-medium text-foreground sm:px-28">
          <span className="truncate">扩散模型综述</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden size-7 items-center justify-center rounded-8 text-subtle sm:inline-flex">
            <Pencil className="size-3.5" />
          </span>
          <span className="hidden size-7 items-center justify-center rounded-8 text-subtle sm:inline-flex">
            <Trash2 className="size-3.5" />
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-foreground px-2 text-12 text-on-dark">
            <SquarePen className="size-3.5" />
            新对话
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[16rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-8 border border-border bg-popover shadow-overlay">
          <header className="flex h-10 items-center border-b border-border-soft px-3 text-12 font-medium text-foreground">
            会话历史
          </header>
          <ul className="py-1">
            {SESSIONS.map((session) => (
              <li
                key={session.title}
                className={
                  session.active
                    ? "flex items-center gap-2 bg-surface-1 px-3 py-2"
                    : "flex items-center gap-2 px-3 py-2"
                }
              >
                <span className="min-w-0 flex-1 truncate text-12 font-medium text-foreground">
                  {session.title}
                </span>
                <span className="shrink-0 text-12 text-faint">
                  {session.time}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-8 border border-border-soft bg-surface-1 p-3">
          <div className="flex justify-center">
            <span className="rounded-pill border border-border bg-surface-card px-3 py-1 text-12 text-subtle">
              加载更早
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="ml-auto rounded-12 bg-foreground px-3 py-2 text-12 text-on-dark">
              继续比较外部验证结果。
            </div>
            <div className="rounded-12 border border-border bg-surface-card px-3 py-2 text-12 leading-paragraph text-subtle">
              已加载当前窗口内最近 60 轮；更早历史按批次继续展开。
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1 text-12 text-faint">
            <Clock3 className="size-3.5" />
            切换会话会同步地址与当前模型
          </p>
        </section>
      </div>
    </div>
  );
}
