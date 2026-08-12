import { LockKeyhole, Mail, ShieldCheck, Smartphone } from "lucide-react";

const FIELD_CLASS =
  "flex h-10 min-w-0 flex-1 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-faint";

/**
 * 账户安全设置 · 纯样式 fixture。
 * 来源：product-mock settings/pages/SecurityPage.tsx；演示换绑时的旧凭据 + 新凭据双重验证。
 */
export function WikiEmbedAccountSecurity() {
  return (
    <div
      className="w-[min(100%,44rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="account-security"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-16 font-medium text-foreground">账户安全</p>
          <p className="mt-1 text-12 text-faint">
            示例账户 · 换绑不会直接解除旧联系方式
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-brand-green-soft px-2 py-1 text-12 font-medium text-brand-green">
          <ShieldCheck className="size-3" /> 旧、新联系方式双重校验
        </span>
      </div>

      <section className="mt-6 border-t border-border pt-6">
        <div className="mb-3 flex items-center gap-2">
          <LockKeyhole className="size-4 text-subtle" />
          <div>
            <p className="text-14 font-medium text-foreground">修改密码</p>
            <p className="text-12 text-faint">至少 8 位，建议混合字母与数字</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {["当前密码", "新密码（至少 8 位）", "再次输入新密码"].map(
            (label) => (
              <div key={label} className={FIELD_CLASS}>
                {label}
              </div>
            ),
          )}
        </div>
        <span className="mt-3 inline-flex h-9 items-center rounded-8 bg-foreground px-4 text-12 font-medium text-on-dark">
          修改密码
        </span>
      </section>

      <div className="mt-6 grid gap-4 border-t border-border pt-6 md:grid-cols-2">
        <ContactRebind
          icon={Mail}
          title="换绑邮箱"
          current="l***@example.edu"
          next="new@example.edu"
        />
        <ContactRebind
          icon={Smartphone}
          title="换绑手机号"
          current="138****1024"
          next="新手机号"
        />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-8 border border-border bg-surface-1 px-3 py-3 text-12 leading-paragraph text-muted-foreground">
        <Smartphone className="mt-1 size-4 shrink-0 text-subtle" />
        <p>
          移动端只读显示邮箱、手机号及验证状态，也可修改密码；换绑邮箱或手机号必须回到桌面端完成双重验证码流程。
        </p>
      </div>
    </div>
  );
}

function ContactRebind({
  icon: Icon,
  title,
  current,
  next,
}: {
  icon: typeof Mail;
  title: string;
  current: string;
  next: string;
}) {
  return (
    <section className="rounded-8 border border-border bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-subtle" />
        <p className="text-14 font-medium text-foreground">{title}</p>
      </div>
      <p className="mt-1 text-12 text-faint">
        当前：<span className="font-mono text-subtle">{current}</span>
      </p>
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <div className={FIELD_CLASS}>旧联系方式验证码</div>
          <span className="inline-flex h-10 shrink-0 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
            发送验证码
          </span>
        </div>
        <div className={FIELD_CLASS}>{next}</div>
        <div className="flex gap-2">
          <div className={FIELD_CLASS}>新联系方式验证码</div>
          <span className="inline-flex h-10 shrink-0 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
            发送验证码
          </span>
        </div>
      </div>
    </section>
  );
}
