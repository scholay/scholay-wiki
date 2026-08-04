// 统一的「用户单元」—— 全站 admin 列表/详情里展示用户都用它,口径一致:
//   · 始终显示 #ID + 名称(用户名 > 邮箱前缀 > 手机号 > "用户")
//   · 点击弹出富卡片(Popover):登录方式 + 关联账号(OAuth) + 会员(等级/到期) + 经费余额。
//     卡片数据**懒加载**(打开才拉 detail + vip,避免列表 N+1)。
//   · 无 user_id(公众号/系统/匿名)→ 显示匿名文案,不可点开。
import { useState } from 'react';
import { AlertTriangle, Mail, Smartphone, CheckCircle2, Link2, Loader2, Crown, Wallet } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
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
    return <span className="text-12 text-faint">{anonymousLabel}</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 items-center gap-1.5 text-left"
          title="查看用户概览"
        >
          <span className="truncate text-12 font-medium text-foreground transition-colors group-hover:text-brand-red">
            {displayName(props)}
          </span>
          <span className="shrink-0 rounded-4 bg-surface-2 px-1 font-mono text-12 text-faint">#{id}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 text-12">
        {/* 头部:名称 + #ID + 会员角标 */}
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-12 font-medium text-foreground">{displayName(props)}</span>
            <span className="shrink-0 rounded-4 bg-surface-2 px-1 font-mono text-12 text-faint">#{id}</span>
          </div>
          <TierBadge tier={vip.data?.tier} loading={vip.isLoading} error={vip.isError} />
        </div>

        <div className="flex flex-col gap-3 px-3 py-3">
          {/* 登录方式 + 关联账号。失败时回落到行数据(email/phone)并明确标注是"降级显示",
              否则会让人以为这个号真的只有邮箱、没绑任何第三方。 */}
          <Block title="登录方式">
            {detail.isLoading ? (
              <LoadingRow text="加载登录方式…" />
            ) : detail.isError ? (
              <>
                <ErrorRow error={detail.error} onRetry={() => void detail.refetch()} />
                <FallbackMethods email={props.email} phone={props.phone} />
              </>
            ) : detail.data ? (
              <LoginMethods d={detail.data} />
            ) : (
              <FallbackMethods email={props.email} phone={props.phone} />
            )}
          </Block>

          {/* 会员 + 经费余额 —— 失败绝不显示「暂无会员信息」(等于把 Max 用户说成没会员) */}
          <Block title="会员 / 经费">
            {vip.isLoading ? (
              <LoadingRow text="加载会员信息…" />
            ) : vip.isError ? (
              <ErrorRow error={vip.error} onRetry={() => void vip.refetch()} />
            ) : vip.data ? (
              <VipSummary v={vip.data} />
            ) : (
              <span className="text-12 text-faint">暂无会员信息</span>
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
      <h5 className="text-12 font-medium text-faint">{title}</h5>
      {children}
    </section>
  );
}

function LoadingRow({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-12 text-faint">
      <Loader2 className="size-3 animate-spin" /> {text}
    </span>
  );
}

/** 卡片内的紧凑失败态 —— 保留后端原因 + 一个重试链接(卡片窄,不用按钮)。 */
function ErrorRow({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <span className="flex items-start gap-1.5 text-12 text-brand-red">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
      <span className="min-w-0">
        {toApiError(error).message || '加载失败'}
        <button
          type="button"
          onClick={onRetry}
          className="ml-1.5 rounded-4 text-faint underline underline-offset-2 transition-colors hover:text-foreground"
        >
          重试
        </button>
      </span>
    </span>
  );
}

function TierBadge({ tier, loading, error }: { tier?: string; loading?: boolean; error?: boolean }) {
  if (loading) return <Loader2 className="size-3 shrink-0 animate-spin text-faint" />;
  // 取不到就显示"取不到" —— 回落成 Free 徽章会把 Max 用户说成免费用户
  if (error)
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-12 text-faint" title="会员状态加载失败">
        <AlertTriangle className="size-3 text-brand-red" />—
      </span>
    );
  const t = tier ?? 'free';
  const isPro = t === 'pro' || t === 'max';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-12 font-medium',
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
    <span className="flex items-center gap-1.5 text-12 text-subtle">
      <Icon className="size-3 shrink-0 text-faint" />
      <span className="break-all">{value}</span>
      {verified && <CheckCircle2 className="size-3 shrink-0 text-brand-green" />}
    </span>
  );
}

function LoginMethods({ d }: { d: UserLoginMethods }) {
  const providers = d.auth_providers ?? [];
  const hasAny = d.email || d.phone || providers.length > 0;
  if (!hasAny) return <span className="text-12 text-faint">暂无登录方式信息</span>;
  return (
    <>
      {d.email && <MethodRow icon={Mail} value={d.email} verified={d.email_verified} />}
      {d.phone && <MethodRow icon={Smartphone} value={d.phone} verified={d.phone_verified} />}
      {providers.length > 0 && (
        <span className="flex flex-wrap items-center gap-1 text-12 text-faint">
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
  if (!email && !phone) return <span className="text-12 text-faint">暂无登录方式信息</span>;
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
      <span className="flex items-center justify-between text-12">
        <span className="text-faint">会员</span>
        <span className={cn('font-medium', isPro ? 'text-brand-amber' : 'text-subtle')}>
          {TIER_LABEL[v.tier]}
          {isPro && (v.expires_at ? ` · 至 ${v.expires_at.slice(0, 10)}` : ' · 永久')}
        </span>
      </span>
      <span className="flex items-center justify-between text-12">
        <span className="flex items-center gap-1 text-faint">
          <Wallet className="size-3" />
          科研经费
        </span>
        <span className="tabular-nums text-subtle">
          {v.credit.total.toFixed(2)}
          <span className="ml-1 text-faint">(≈{v.credit.points.toLocaleString()} 算力点)</span>
        </span>
      </span>
    </div>
  );
}

// 仅显示名称 + #ID(不带展开),给空间紧凑或无需展开的位置用。
export function UserInline({ id, name, email, phone }: UserCellProps) {
  if (id == null) return <span className="text-12 text-faint">公众号 / 匿名</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5')}>
      <span className="truncate text-12 font-medium text-foreground">{displayName({ id, name, email, phone })}</span>
      <span className="shrink-0 rounded-4 bg-surface-2 px-1 font-mono text-12 text-faint">#{id}</span>
    </span>
  );
}
