// 统一的「用户单元」—— 全站 admin 列表/详情里展示用户都用它,口径一致:
//   · 始终显示 #ID + 名称(用户名 > 邮箱前缀 > 手机号 > "用户")
//   · 登录方式(邮箱/手机号 + 验证态、OAuth 绑定)默认折叠,点击展开才**懒加载**拉详情
//   · 无 user_id(公众号/系统/匿名)→ 显示匿名文案,不可展开
import { useState } from 'react';
import { ChevronDown, ChevronRight, Mail, Smartphone, CheckCircle2, Link2, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useUserDetail, type UserLoginMethods } from '../api/users';

const PROVIDER_LABEL: Record<string, string> = {
  github: 'GitHub',
  google: 'Google',
  wechat: '微信',
  apple: 'Apple',
  orcid: 'ORCID',
  microsoft: 'Microsoft',
  discourse: '论坛',
};

export interface UserCellProps {
  id?: number | null;
  name?: string | null; // username
  email?: string | null;
  phone?: string | null;
  /** 无 user_id 时的文案(公众号 / 系统 / 匿名)。 */
  anonymousLabel?: string;
}

function displayName({ name, email, phone }: UserCellProps): string {
  if (name) return name;
  if (email) return email.split('@')[0];
  if (phone) return phone;
  return '用户';
}

export function UserCell(props: UserCellProps) {
  const { id, email, phone, anonymousLabel = '公众号 / 匿名' } = props;
  const [open, setOpen] = useState(false);
  // 仅展开时拉详情(懒加载,避免列表 N+1)
  const detail = useUserDetail(open && id ? id : undefined);

  if (id == null) {
    return <span className="text-2xs text-faint">{anonymousLabel}</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1.5 text-left"
        title="展开登录方式"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-faint" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-faint" />
        )}
        <span className="truncate text-xs font-medium text-foreground transition-colors group-hover:text-brand-red">
          {displayName(props)}
        </span>
        <span className="shrink-0 rounded-sm bg-surface-2 px-1 font-mono text-2xs text-faint">#{id}</span>
      </button>

      {open && (
        <div className="ml-4 flex flex-col gap-1.5 rounded-md border border-border-soft bg-surface-1 p-2">
          {detail.isLoading ? (
            <span className="flex items-center gap-1.5 text-2xs text-faint">
              <Loader2 className="size-3 animate-spin" /> 加载登录方式…
            </span>
          ) : detail.data ? (
            <LoginMethods d={detail.data} />
          ) : (
            // 详情拉取失败 → 用行内已有的 email/phone 兜底
            <FallbackMethods email={email} phone={phone} />
          )}
        </div>
      )}
    </div>
  );
}

function MethodRow({
  icon: Icon,
  value,
  verified,
}: {
  icon: typeof Mail;
  value: string;
  verified?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-subtle">
      <Icon className="size-3 shrink-0 text-faint" />
      <span className="break-all">{value}</span>
      {verified && <CheckCircle2 className="size-3 shrink-0 text-brand-green" />}
    </span>
  );
}

function LoginMethods({ d }: { d: UserLoginMethods }) {
  const providers = d.auth_providers ?? [];
  const hasAny = d.email || d.phone || providers.length > 0;
  if (!hasAny) return <span className="text-2xs text-faint">暂无登录方式信息</span>;
  return (
    <>
      {d.email && <MethodRow icon={Mail} value={d.email} verified={d.email_verified} />}
      {d.phone && <MethodRow icon={Smartphone} value={d.phone} verified={d.phone_verified} />}
      {providers.length > 0 && (
        <span className="flex flex-wrap items-center gap-1 text-2xs text-faint">
          <Link2 className="size-3 shrink-0" />
          {providers.map((p) => (
            <span key={p.provider} className="rounded-pill bg-surface-2 px-1.5 py-0.5 text-subtle">
              {PROVIDER_LABEL[p.provider.toLowerCase()] ?? p.provider}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

function FallbackMethods({ email, phone }: { email?: string | null; phone?: string | null }) {
  if (!email && !phone) return <span className="text-2xs text-faint">暂无登录方式信息</span>;
  return (
    <>
      {email && <MethodRow icon={Mail} value={email} />}
      {phone && <MethodRow icon={Smartphone} value={phone} />}
    </>
  );
}

// 仅显示名称 + #ID(不带展开),给空间紧凑或无需展开登录方式的位置用。
export function UserInline({ id, name, email, phone }: UserCellProps) {
  if (id == null) return <span className="text-2xs text-faint">公众号 / 匿名</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5')}>
      <span className="truncate text-xs font-medium text-foreground">{displayName({ id, name, email, phone })}</span>
      <span className="shrink-0 rounded-sm bg-surface-2 px-1 font-mono text-2xs text-faint">#{id}</span>
    </span>
  );
}
