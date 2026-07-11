// 统一的「用户单元」—— 全站 admin 列表/详情里展示用户都用它,口径一致:
//   · 始终显示 #ID + 名称(用户名 > 邮箱前缀 > 手机号 > "用户")
//   · 点击弹出富卡片(Popover):登录方式 + 关联账号(OAuth) + 会员(等级/到期) + 经费余额。
//     卡片数据**懒加载**(打开才拉 detail + vip,避免列表 N+1)。
//   · 无 user_id(公众号/系统/匿名)→ 显示匿名文案,不可点开。
import { useState } from 'react';
import { Mail, Smartphone, CheckCircle2, Link2, Loader2, Crown, Wallet } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover';
import { useUserDetail, useUserVipStatus, type UserLoginMethods, type UserVipStatus } from '../api/users';

const PROVIDER_LABEL: Record<string, string> = {
  github: 'GitHub',
  google: 'Google',
  wechat: '微信',
  apple: 'Apple',
  orcid: 'ORCID',
  microsoft: 'Microsoft',
  discourse: '论坛',
};

// 微信徽章按注册来源细分:小程序与网页扫码都记 provider='wechat',靠 register_source 区分。
function wechatChannelLabel(registerSource?: string): string {
  if (registerSource === 'wechat_miniprogram') return '微信小程序';
  if (registerSource === 'wechat') return '微信扫码';
  return '微信';
}

// 会员等级展示名全站统一:Free / Pro / Max。
const TIER_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' };

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
  const { id, anonymousLabel = '公众号 / 匿名' } = props;
  const [open, setOpen] = useState(false);
  // 仅打开时拉详情(懒加载,避免列表 N+1)
  const detail = useUserDetail(open && id ? id : undefined);
  const vip = useUserVipStatus(open && id ? id : undefined);

  if (id == null) {
    return <span className="text-2xs text-faint">{anonymousLabel}</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 items-center gap-1.5 text-left"
          title="查看用户概览"
        >
          <span className="truncate text-xs font-medium text-foreground transition-colors group-hover:text-brand-red">
            {displayName(props)}
          </span>
          <span className="shrink-0 rounded-sm bg-surface-2 px-1 font-mono text-2xs text-faint">#{id}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 text-xs">
        {/* 头部:名称 + #ID + 会员角标 */}
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{displayName(props)}</span>
            <span className="shrink-0 rounded-sm bg-surface-2 px-1 font-mono text-2xs text-faint">#{id}</span>
          </div>
          <TierBadge tier={vip.data?.tier} loading={vip.isLoading} />
        </div>

        <div className="flex flex-col gap-3 px-3 py-3">
          {/* 登录方式 + 关联账号 */}
          <Block title="登录方式">
            {detail.isLoading ? (
              <LoadingRow text="加载登录方式…" />
            ) : detail.data ? (
              <LoginMethods d={detail.data} />
            ) : (
              <FallbackMethods email={props.email} phone={props.phone} />
            )}
          </Block>

          {/* 会员 + 经费余额 */}
          <Block title="会员 / 经费">
            {vip.isLoading ? (
              <LoadingRow text="加载会员信息…" />
            ) : vip.data ? (
              <VipSummary v={vip.data} />
            ) : (
              <span className="text-2xs text-faint">暂无会员信息</span>
            )}
          </Block>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h5 className="text-2xs font-bold tracking-[0.12em] text-faint">{title}</h5>
      {children}
    </section>
  );
}

function LoadingRow({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-faint">
      <Loader2 className="size-3 animate-spin" /> {text}
    </span>
  );
}

function TierBadge({ tier, loading }: { tier?: string; loading?: boolean }) {
  if (loading) return <Loader2 className="size-3 shrink-0 animate-spin text-faint" />;
  const t = tier ?? 'free';
  const isPro = t === 'pro' || t === 'max';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-2xs font-bold',
        isPro ? 'bg-prism-badge-bg text-prism-badge-fg' : 'bg-surface-2 text-faint',
      )}
    >
      <Crown className="size-3" />
      {TIER_LABEL[t] ?? t}
    </span>
  );
}

function MethodRow({ icon: Icon, value, verified }: { icon: typeof Mail; value: string; verified?: boolean }) {
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
              {p.provider.toLowerCase() === 'wechat'
                ? wechatChannelLabel(d.register_source)
                : (PROVIDER_LABEL[p.provider.toLowerCase()] ?? p.provider)}
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

function VipSummary({ v }: { v: UserVipStatus }) {
  const isPro = v.tier === 'pro' || v.tier === 'max';
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-2xs">
        <span className="text-faint">会员</span>
        <span className={cn('font-medium', isPro ? 'text-brand-amber' : 'text-subtle')}>
          {TIER_LABEL[v.tier]}
          {isPro && (v.expires_at ? ` · 至 ${v.expires_at.slice(0, 10)}` : ' · 永久')}
        </span>
      </span>
      <span className="flex items-center justify-between text-2xs">
        <span className="flex items-center gap-1 text-faint">
          <Wallet className="size-3" />
          科研经费
        </span>
        <span className="tabular-nums text-subtle">
          {v.credit.total}
          <span className="ml-1 text-faint">(永久 {v.credit.perm} · 临时 {v.credit.temp})</span>
        </span>
      </span>
    </div>
  );
}

// 仅显示名称 + #ID(不带展开),给空间紧凑或无需展开的位置用。
export function UserInline({ id, name, email, phone }: UserCellProps) {
  if (id == null) return <span className="text-2xs text-faint">公众号 / 匿名</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5')}>
      <span className="truncate text-xs font-medium text-foreground">{displayName({ id, name, email, phone })}</span>
      <span className="shrink-0 rounded-sm bg-surface-2 px-1 font-mono text-2xs text-faint">#{id}</span>
    </span>
  );
}
