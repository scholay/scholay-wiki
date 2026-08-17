import { CheckCheck } from "lucide-react";

const NOTICES = [
  {
    title: "智能搜论文任务已完成",
    body: "已整理 18 篇候选论文，可以继续核对并加入暂存区。",
    time: "刚刚",
    linkText: "查看结果",
    unread: true,
  },
  {
    title: "文件夹分享已被接收",
    body: "对方已经打开你分享的文件夹。",
    time: "2 小时前",
    unread: false,
  },
] as const;

/**
 * 顶栏通知 Popover 的列表成功态 · 纯样式 fixture。
 * 来源：current shared/components/NotificationBell.tsx；mock NotificationInbox 仅用于核对原始层级。
 */
export function WikiEmbedNotificationInbox() {
  return (
    <div
      className="flex w-96 max-w-full flex-col overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="notification-inbox"
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border-soft px-3">
        <span className="text-14 font-medium text-foreground">通知</span>
        <span className="inline-flex h-7 items-center gap-1 rounded-8 px-2 text-12 text-muted-foreground">
          <CheckCheck className="size-3" strokeWidth={2.5} />
          全部已读
        </span>
      </header>

      <div className="flex shrink-0 items-center gap-1 border-b border-border-soft px-3">
        <span className="relative inline-flex h-8 items-center px-3 text-12 font-medium text-foreground">
          全部
          <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-pill bg-brand-red" />
        </span>
        <span className="inline-flex h-8 items-center px-3 text-12 font-medium text-muted-foreground">
          未读
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-12 font-medium tabular-nums text-on-brand">
            1
          </span>
        </span>
      </div>

      <ul>
        {NOTICES.map((notice) => (
          <li
            key={notice.title}
            className={`relative flex flex-col gap-1 border-b border-border-soft px-3 py-3 last:border-b-0 ${notice.unread ? "bg-danger-soft/40" : ""}`}
          >
            <div className="flex items-start gap-2 text-left">
              {notice.unread ? (
                <span
                  className="inline-block shrink-0 rounded-pill bg-brand-red"
                  style={{ width: 6, height: 6, marginTop: 6 }}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-14 font-medium text-foreground">
                  {notice.title}
                </p>
                <p
                  className="line-clamp-3 text-12 leading-paragraph text-subtle"
                  style={{ marginTop: 2 }}
                >
                  {notice.body}
                </p>
                <div
                  className="flex items-center gap-2 text-12 text-faint"
                  style={{ marginTop: 6 }}
                >
                  <span>{notice.time}</span>
                  {"linkText" in notice ? (
                    <span className="font-medium text-brand-red">
                      {notice.linkText} →
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-4 text-faint opacity-0">
              ×
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
