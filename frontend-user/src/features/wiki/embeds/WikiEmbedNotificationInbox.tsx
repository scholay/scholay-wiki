import { CheckCheck } from "lucide-react";

const NOTICES = [
  {
    title: "智能搜索任务已完成",
    body: "已整理 18 篇候选论文，可以继续核对并加入暂存区。",
    time: "刚刚",
    unread: true,
  },
  {
    title: "文献集分享已被接收",
    body: "对方已经打开你分享的文献集。",
    time: "2 小时前",
    unread: false,
  },
] as const;

/** 站内通知列表 · 纯样式 fixture。来源：product-mock NotificationInbox。 */
export function WikiEmbedNotificationInbox() {
  return (
    <div
      className="w-[min(100%,28rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="notification-inbox"
    >
      <div className="flex h-10 items-center border-b border-border px-3">
        <span className="text-14 font-medium text-foreground">通知</span>
      </div>
      <div className="flex h-10 items-center gap-1 border-b border-border px-3">
        <span className="inline-flex h-full items-center border-b-2 border-brand-red px-3 text-12 font-medium text-foreground">
          全部
        </span>
        <span className="inline-flex h-full items-center gap-1 px-3 text-12 text-muted-foreground">
          未读
          <span className="rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-dark">
            1
          </span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-12 text-muted-foreground">
          <CheckCheck className="size-3" />
          全部已读
        </span>
      </div>
      <div>
        {NOTICES.map((notice) => (
          <div
            key={notice.title}
            className={`flex gap-2 border-b border-border px-4 py-3 last:border-b-0 ${notice.unread ? "bg-danger-soft/40" : ""}`}
          >
            <span
              className={`mt-2 size-2 shrink-0 rounded-pill ${notice.unread ? "bg-brand-red" : "bg-transparent"}`}
            />
            <div className="min-w-0">
              <p className="text-14 font-medium text-foreground">
                {notice.title}
              </p>
              <p className="mt-1 text-12 leading-paragraph text-subtle">
                {notice.body}
              </p>
              <p className="mt-1 text-12 text-faint">{notice.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
