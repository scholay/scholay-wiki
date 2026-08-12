const FIELD_CLASS =
  "flex h-10 min-w-0 flex-1 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint";

/** SecurityPage 的桌面换绑态：修改密码、邮箱与手机号按真实页面顺序纵向排列。 */
export function WikiEmbedAccountSecurity() {
  return (
    <div
      className="flex w-[min(100%,42rem)] flex-col gap-8"
      aria-hidden
      data-wiki-fixture="account-security"
    >
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-16 font-medium text-foreground">修改密码</h2>
          <p className="mt-1 text-12 text-muted-foreground">
            为了账号安全，建议使用 8 位以上、字母数字混合的密码。
          </p>
        </div>
        <Field label="当前密码" />
        <Field label="新密码（至少 8 位）" />
        <Field label="再次输入新密码" />
        <div>
          <span className="inline-flex h-9 items-center rounded-8 bg-foreground px-4 text-12 font-medium text-on-dark">
            修改密码
          </span>
        </div>
      </section>

      <div className="border-t border-border-soft" />

      <ContactSection
        title="换绑邮箱"
        current="l***@example.edu"
        oldCode="输入发送到当前邮箱的 6 位验证码"
        next="新邮箱"
        newCode="输入发送到新邮箱的 6 位验证码"
        action="换绑邮箱"
      />

      <div className="border-t border-border-soft" />

      <ContactSection
        title="换绑手机号"
        current="138****1024"
        oldCode="输入发送到当前手机的 6 位验证码"
        next="新手机号"
        newCode="输入发送到新手机的 6 位验证码"
        action="换绑手机号"
      />
    </div>
  );
}

function Field({ label }: { label: string }) {
  return <div className={FIELD_CLASS}>{label}</div>;
}

function ContactSection({
  title,
  current,
  oldCode,
  next,
  newCode,
  action,
}: {
  title: string;
  current: string;
  oldCode: string;
  next: string;
  newCode: string;
  action: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-16 font-medium text-foreground">{title}</h2>
        <p className="mt-1 text-12 text-muted-foreground">
          当前：<span className="ml-1 font-mono">{current}</span>
        </p>
      </div>

      <CodeRow label={oldCode} />
      <Field label={next} />
      <CodeRow label={newCode} />

      <div>
        <span className="inline-flex h-9 items-center rounded-8 bg-foreground px-4 text-12 font-medium text-on-dark">
          {action}
        </span>
      </div>
    </section>
  );
}

function CodeRow({ label }: { label: string }) {
  return (
    <div className="flex gap-2">
      <Field label={label} />
      <span className="inline-flex h-10 shrink-0 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
        发送验证码
      </span>
    </div>
  );
}
