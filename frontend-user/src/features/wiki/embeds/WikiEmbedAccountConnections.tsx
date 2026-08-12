import { CheckCircle2, Mail, Plus, Smartphone } from "lucide-react";
import { ProviderLogo, type Provider } from "@/shared/components/ProviderLogo";

const CONNECTIONS: Array<{
  provider: "email" | "phone" | Provider;
  label: string;
  detail: string;
  bound: boolean;
  date?: string;
}> = [
  {
    provider: "email",
    label: "邮箱",
    detail: "researcher@example.edu",
    bound: true,
    date: "2026-03-18",
  },
  {
    provider: "phone",
    label: "手机号",
    detail: "未绑定",
    bound: false,
  },
  {
    provider: "github",
    label: "GitHub",
    detail: "scholay-researcher",
    bound: true,
    date: "2026-05-06",
  },
  {
    provider: "google",
    label: "Google",
    detail: "researcher@example.edu",
    bound: true,
    date: "2026-06-21",
  },
];

/** ConnectionsPage 已加载状态；Google 行采用“既有绑定”而非未接通的新绑定入口。 */
export function WikiEmbedAccountConnections() {
  return (
    <div
      className="flex w-[min(100%,48rem)] flex-col gap-6"
      aria-hidden
      data-wiki-fixture="account-connections"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-16 font-medium text-foreground">已连接的账号</h2>
        <p className="text-12 leading-paragraph text-muted-foreground">
          管理你登录这个账号的方式。为了安全，至少要保留 1
          种，避免下次登不进来。目前共有
          <span className="mx-1 font-medium text-foreground">3</span>
          种登录方式。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {CONNECTIONS.map((connection) => (
          <div
            key={connection.provider}
            className="flex items-center gap-4 rounded-16 border border-border bg-surface-card p-4"
          >
            <span
              className={`inline-flex size-10 shrink-0 items-center justify-center rounded-8 ${
                connection.bound ? "bg-prism-badge-bg" : "bg-surface-1"
              }`}
            >
              <ConnectionIcon
                provider={connection.provider}
                bound={connection.bound}
              />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-14 font-medium text-foreground">
                  {connection.label}
                </span>
                {connection.bound ? (
                  <CheckCircle2
                    className="size-4 text-brand-green"
                    strokeWidth={2.5}
                  />
                ) : null}
              </div>
              <p className="truncate text-12 text-muted-foreground">
                {connection.detail}
                {connection.date ? (
                  <span className="ml-2 text-faint">
                    · 绑定于 {connection.date}
                  </span>
                ) : null}
              </p>
            </div>

            {connection.bound ? (
              <span className="inline-flex h-9 shrink-0 items-center rounded-8 border border-border px-3 text-12 text-subtle">
                解绑
              </span>
            ) : (
              <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
                <Plus className="size-3" />
                绑定
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionIcon({
  provider,
  bound,
}: {
  provider: "email" | "phone" | Provider;
  bound: boolean;
}) {
  const className = `size-4 ${
    bound ? "text-foreground" : "text-muted-foreground"
  }`;

  if (provider === "email") return <Mail className={className} />;
  if (provider === "phone") return <Smartphone className={className} />;
  return <ProviderLogo provider={provider} className={className} />;
}
