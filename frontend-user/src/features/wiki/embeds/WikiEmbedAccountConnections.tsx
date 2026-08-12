import {
  CheckCircle2,
  CircleSlash2,
  Github,
  Mail,
  Plus,
  Smartphone,
} from "lucide-react";

const CONNECTIONS = [
  {
    label: "邮箱",
    detail: "researcher@example.edu",
    state: "bound",
    action: "解绑",
    Icon: Mail,
  },
  {
    label: "手机号",
    detail: "未绑定",
    state: "unbound",
    action: "绑定",
    Icon: Smartphone,
  },
  {
    label: "GitHub",
    detail: "已连接 · 示例账号",
    state: "bound",
    action: "解绑",
    Icon: Github,
  },
  {
    label: "Google",
    detail: "GIS 登录可配置；设置页新绑定链路未接通",
    state: "unavailable",
    action: "不可新绑",
    Icon: CircleSlash2,
  },
] as const;

/**
 * 已连接账号 · 纯样式 fixture。
 * Google 登录与新绑定不是同一条链路；移动端页面当前只展示连接状态。
 */
export function WikiEmbedAccountConnections() {
  return (
    <div
      className="w-[min(100%,42rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="account-connections"
    >
      <p className="text-16 font-medium text-foreground">已连接的账号</p>
      <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
        第三方行只在当前配置已启用或账号已绑定时显示；至少保留一种登录方式。
      </p>

      <div className="mt-4 space-y-2">
        {CONNECTIONS.map(({ label, detail, state, action, Icon }) => {
          const bound = state === "bound";
          const unavailable = state === "unavailable";
          return (
            <div
              key={label}
              className="flex items-center gap-3 rounded-8 border border-border bg-surface-card p-3"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-8 bg-surface-1 text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-14 font-medium text-foreground">
                    {label}
                  </span>
                  {bound ? (
                    <CheckCircle2 className="size-3 text-brand-green" />
                  ) : null}
                  {unavailable ? (
                    <span className="rounded-pill bg-surface-2 px-2 py-1 text-12 text-faint">
                      当前边界
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-12 text-faint">{detail}</p>
              </div>
              <span
                className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-8 border border-border px-3 text-12 ${
                  unavailable ? "text-faint" : "text-subtle"
                }`}
              >
                {state === "unbound" ? <Plus className="size-3" /> : null}
                {action}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-8 bg-surface-1 px-3 py-3 text-12 leading-paragraph text-muted-foreground">
        移动端只读展示绑定状态，且隐藏微信；绑定或解绑第三方账号请使用桌面端。Google
        若已有绑定仍可识别和解绑，但当前设置页不能发起新的 Google 绑定。
      </div>
    </div>
  );
}
