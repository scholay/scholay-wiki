import { Monitor, Smartphone, UserRound } from "lucide-react";

const FIELD_CLASS =
  "flex min-h-10 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint";

/**
 * 个人资料设置 · 纯样式 fixture。
 * 来源：ProfilePage 与 MobileProfilePage；两端提交字段并不相同。
 */
export function WikiEmbedProfileSettings() {
  return (
    <div
      className="w-[min(100%,48rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="profile-settings"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-muted-foreground">
          <UserRound className="size-5" />
        </span>
        <div>
          <p className="text-16 font-medium text-foreground">个人资料</p>
          <p className="mt-1 text-12 text-muted-foreground">
            桌面与移动共用资料接口，但可编辑字段和昵称上限不同。
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ProfileSurface
          icon={Monitor}
          title="桌面设置"
          path="/settings/profile"
          badge="3 项可编辑 · 昵称 40 字"
          fields={[
            ["昵称", "一位正在研究的学者"],
            ["简介", "关注学术检索、科研写作与开放科学。"],
            ["头像图片地址", "https://example.com/avatar.jpg"],
          ]}
        />
        <ProfileSurface
          icon={Smartphone}
          title="移动设置"
          path="/m/me/profile"
          badge="2 项可编辑 · 昵称 32 字"
          fields={[
            ["昵称", "一位正在研究的学者"],
            ["简介", "介绍一下你的研究方向…"],
          ]}
          note="邮箱、手机号和注册时间只读；移动端不提交头像 URL。"
        />
      </div>
    </div>
  );
}

function ProfileSurface({
  icon: Icon,
  title,
  path,
  badge,
  fields,
  note,
}: {
  icon: typeof Monitor;
  title: string;
  path: string;
  badge: string;
  fields: ReadonlyArray<readonly [string, string]>;
  note?: string;
}) {
  return (
    <section className="rounded-8 border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-subtle" />
          <div>
            <p className="text-14 font-medium text-foreground">{title}</p>
            <p className="mt-1 font-mono text-12 text-faint">{path}</p>
          </div>
        </div>
        <span className="rounded-pill bg-surface-2 px-2 py-1 text-12 text-subtle">
          {badge}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {fields.map(([label, value]) => (
          <div key={label}>
            <p className="mb-2 text-12 font-medium text-foreground">{label}</p>
            <div className={FIELD_CLASS}>{value}</div>
          </div>
        ))}
      </div>

      {note ? (
        <p className="mt-3 border-t border-border pt-3 text-12 leading-paragraph text-muted-foreground">
          {note}
        </p>
      ) : null}
    </section>
  );
}
