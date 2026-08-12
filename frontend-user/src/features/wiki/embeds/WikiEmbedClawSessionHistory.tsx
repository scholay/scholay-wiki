import { History, Pencil, SquarePen, Trash2 } from "lucide-react";

const SESSIONS = [
  { title: "扩散模型综述", time: "8-12 14:30", active: true },
  { title: "MRI 数据集比较", time: "8-11 19:05", active: false },
  { title: "修改回复信提纲", time: "8-09 10:42", active: false },
] as const;

/**
 * Claw 桌面会话历史 · 纯样式 fixture。
 * 冻结 product-mock AgentSessionStrip 的历史 Popover 打开态；列表、当前标题和
 * 重命名/删除/新对话控件属于同一时刻，不再拼接另一段长对话窗口。
 */
export function WikiEmbedClawSessionHistory() {
  return (
    <div
      className="relative w-[min(100%,42rem)] pb-56"
      aria-hidden
      data-wiki-fixture="claw-session-history"
    >
      <div className="relative flex h-10 items-center gap-1 rounded-12 border border-border bg-surface-card px-2 shadow-raised">
        <span className="inline-flex h-7 items-center gap-2 rounded-8 bg-surface-2 px-2 text-12 text-subtle">
          <History className="size-3.5" />
          <span className="font-medium tabular-nums text-foreground">3</span>
        </span>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-28">
          <span className="truncate text-center text-14 font-medium text-foreground">
            扩散模型综述
          </span>
        </span>
        <div className="relative z-raised ml-auto flex items-center gap-1">
          <span className="inline-flex size-7 items-center justify-center rounded-8 text-subtle">
            <Pencil className="size-3.5" />
          </span>
          <span className="inline-flex size-7 items-center justify-center rounded-8 text-subtle">
            <Trash2 className="size-3.5" />
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-foreground px-2 text-12 font-medium text-on-dark">
            <SquarePen className="size-3.5" />
            新对话
          </span>
        </div>
      </div>

      <section className="absolute left-0 top-12 w-[min(22.5rem,100%)] overflow-hidden rounded-8 border border-border bg-popover shadow-overlay">
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
              <span className="shrink-0 text-12 tabular-nums text-faint">
                {session.time}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
