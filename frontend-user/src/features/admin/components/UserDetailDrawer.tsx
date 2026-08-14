import {
  Activity,
  AlertTriangle,
  Chrome,
  Clock,
  Cpu,
  Crown,
  Github,
  IdCard,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { resetInfo } from '@/shared/lib/quota-display';
import { CopyableId } from './CopyableId';
import { LAST_ACTIVE_LEGACY_HINT, TimeCell } from './TimeCell';
import { UserUsageOverviewPanel } from './UserUsageOverviewPanel';
import { UserBillingSections } from './UserBillingPanels';
import {
  useUserDetail,
  useUserVipStatus,
  type AdminUser,
  type UserVipStatus,
} from '../api/users';
import { formatPoints } from '../api/token-usage';
import {
  useHasPermission,
  PERM,
  roleLabel,
  roleBadgeVariant,
} from '../permissions';

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
};

const PROVIDER_LABEL: Record<string, string> = {
  email: '邮箱',
  password: '邮箱',
  phone: '手机号',
  github: 'GitHub',
  google: 'Google',
  wechat: '微信',
  orcid: 'ORCID',
  apple: 'Apple',
  microsoft: 'Microsoft',
  discourse: '论坛',
};

/** 用户详情抽屉：只做展示，不挂载任何用户写操作。 */
export type UserDetailTarget = Pick<AdminUser, 'id'> &
  Partial<Omit<AdminUser, 'id'>>;

/** 列表行若已经带齐 AdminUser，可先展示快照；只有 user_id 的页面则等待详情接口补全。 */
function hasCompleteUserSnapshot(user: UserDetailTarget): user is AdminUser {
  return (
    typeof user.role === 'string' &&
    typeof user.status === 'number' &&
    typeof user.email_verified === 'boolean' &&
    typeof user.phone_verified === 'boolean' &&
    typeof user.created_at === 'string' &&
    typeof user.updated_at === 'string'
  );
}

export function UserDetailDrawer({
  user: target,
  open,
  onOpenChange,
}: {
  user: UserDetailTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = target?.id;
  const canManageUsers = useHasPermission(PERM.usersManage);
  const canViewAnalytics = useHasPermission(PERM.analyticsView);
  const detail = useUserDetail(open ? id : undefined);
  const vip = useUserVipStatus(open && canManageUsers ? id : undefined);
  const user =
    detail.data ?? (target && hasCompleteUserSnapshot(target) ? target : null);
  const identity = user ?? target;
  const displayName = identity
    ? identity.username ||
      identity.email?.split('@')[0] ||
      identity.phone ||
      `User #${identity.id}`
    : '用户';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        {identity && (
          <>
            <SheetHeader className="shrink-0">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10">
                  {identity.avatar_url && (
                    <AvatarImage src={identity.avatar_url} alt="" />
                  )}
                  <AvatarFallback>
                    {displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{displayName}</span>
                    {user && (
                      <Badge variant={roleBadgeVariant(user.role)}>
                        {roleLabel(user.role)}
                      </Badge>
                    )}
                    {user &&
                      (user.status === 2 ? (
                        <Badge variant="destructive">已冻结</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-brand-green text-brand-green"
                        >
                          正常
                        </Badge>
                      ))}
                  </SheetTitle>
                  <SheetDescription className="mt-1 flex items-center gap-2">
                    <span>只读详情</span>
                    <span>·</span>
                    <CopyableId
                      value={identity.id}
                      prefix="#"
                      label="用户 ID"
                    />
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div
              key={identity.id}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4"
            >
              {!user ? (
                <UserDetailLoadState query={detail} />
              ) : (
                <>
                  <DetailSection
                    icon={<IdCard className="size-4" />}
                    title="固定信息"
                    description="账号身份与注册资料"
                  >
                    <InfoGrid>
                      <InfoRow
                        label="用户名"
                        icon={<UserRound className="size-3.5" />}
                      >
                        {user.username || '—'}
                      </InfoRow>
                      <InfoRow
                        label="用户 ID"
                        icon={<IdCard className="size-3.5" />}
                      >
                        <CopyableId
                          value={user.id}
                          prefix="#"
                          label="用户 ID"
                        />
                      </InfoRow>
                      <InfoRow
                        label="邮箱"
                        icon={<Mail className="size-3.5" />}
                      >
                        {user.email || '—'}
                      </InfoRow>
                      <InfoRow
                        label="手机号"
                        icon={<Phone className="size-3.5" />}
                      >
                        {user.phone || '—'}
                      </InfoRow>
                      <InfoRow
                        label="注册时间"
                        icon={<Clock className="size-3.5" />}
                      >
                        <TimeCell value={user.created_at} className="text-12" />
                      </InfoRow>
                      <InfoRow
                        label="注册来源"
                        icon={<LogIn className="size-3.5" />}
                      >
                        {registerSourceLabel(
                          detail.data?.register_source ?? user.register_source,
                        )}
                      </InfoRow>
                      <InfoRow
                        label="资料更新"
                        icon={<Clock className="size-3.5" />}
                      >
                        <TimeCell value={user.updated_at} className="text-12" />
                      </InfoRow>
                      <InfoRow
                        label="个人简介"
                        icon={<UserRound className="size-3.5" />}
                      >
                        {user.bio || '—'}
                      </InfoRow>
                    </InfoGrid>
                  </DetailSection>

                  {canManageUsers && (
                    <DetailSection
                      icon={<WalletCards className="size-4" />}
                      title="账户与财务记录"
                      description="最近订单、经费流水与兑换记录"
                    >
                      <UserBillingSections userId={user.id} open={open} />
                    </DetailSection>
                  )}

                  <DetailSection
                    icon={<ShieldCheck className="size-4" />}
                    title="账号状态与登录"
                    description="验证状态、登录方式与风险档案"
                  >
                    <InfoGrid>
                      <InfoRow
                        label="账号角色"
                        icon={<ShieldCheck className="size-3.5" />}
                      >
                        <Badge variant={roleBadgeVariant(user.role)}>
                          {roleLabel(user.role)}
                        </Badge>
                      </InfoRow>
                      <InfoRow
                        label="账号状态"
                        icon={<Lock className="size-3.5" />}
                      >
                        {user.status === 2 ? (
                          <span className="text-brand-red">已冻结</span>
                        ) : (
                          <span className="text-brand-green">正常</span>
                        )}
                      </InfoRow>
                      <InfoRow
                        label="邮箱验证"
                        icon={<Mail className="size-3.5" />}
                      >
                        {user.email
                          ? user.email_verified
                            ? '已验证'
                            : '未验证'
                          : '未绑定'}
                      </InfoRow>
                      <InfoRow
                        label="手机验证"
                        icon={<Phone className="size-3.5" />}
                      >
                        {user.phone
                          ? user.phone_verified
                            ? '已验证'
                            : '未验证'
                          : '未绑定'}
                      </InfoRow>
                      <InfoRow
                        label="最后登录"
                        icon={<Clock className="size-3.5" />}
                      >
                        <TimeCell
                          value={user.last_login_at}
                          className="text-12"
                        />
                      </InfoRow>
                      <InfoRow
                        label="登录 IP"
                        icon={<LogIn className="size-3.5" />}
                      >
                        {user.last_login_ip || '—'}
                      </InfoRow>
                    </InfoGrid>

                    <div className="mt-3 border-t border-border-soft pt-3">
                      <h5 className="mb-2 text-12 font-medium text-faint">
                        登录方式
                      </h5>
                      {detail.isError ? (
                        <InlineError
                          error={detail.error}
                          onRetry={() => void detail.refetch()}
                        />
                      ) : detail.isLoading ? (
                        <Loader2 className="size-4 animate-spin text-faint" />
                      ) : detail.data?.auth_providers?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {detail.data.auth_providers.map((provider) => (
                            <span
                              key={`${provider.provider}-${provider.created_at}`}
                              className="inline-flex items-center gap-1.5 rounded-8 border border-border bg-surface-1 px-2 py-1 text-12 text-subtle"
                            >
                              <ProviderIcon provider={provider.provider} />
                              {provider.provider.toLowerCase() === 'wechat'
                                ? wechatChannelLabel(
                                    detail.data?.register_source,
                                  )
                                : PROVIDER_LABEL[
                                    provider.provider.toLowerCase()
                                  ] || provider.provider}
                              <span className="text-faint">
                                {provider.created_at?.slice(0, 10)}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-12 text-faint">
                          仅账号密码登录
                        </span>
                      )}
                    </div>

                    {user.status === 2 && (
                      <div className="mt-3 rounded-8 border border-border bg-danger-soft px-3 py-2">
                        <InfoRow
                          label="冻结时间"
                          icon={<Lock className="size-3.5" />}
                        >
                          <TimeCell
                            value={user.frozen_at}
                            className="text-12"
                          />
                        </InfoRow>
                        <InfoRow
                          label="冻结原因"
                          icon={<AlertTriangle className="size-3.5" />}
                        >
                          <span className="text-brand-red">
                            {user.frozen_reason ||
                              '未记录(可能是旧数据或直接改库)'}
                          </span>
                        </InfoRow>
                      </div>
                    )}
                    {user.admin_notes && (
                      <p className="mt-3 rounded-8 bg-surface-1 px-3 py-2 text-12 text-subtle">
                        <span className="mr-2 text-faint">管理备注</span>
                        {user.admin_notes}
                      </p>
                    )}
                  </DetailSection>

                  {canManageUsers && (
                    <DetailSection
                      icon={<WalletCards className="size-4" />}
                      title="会员与资产"
                      description="当前会员、本周期实际扣额与账户余额"
                      right={vip.data ? <TierMark vip={vip.data} /> : undefined}
                    >
                      {vip.isError ? (
                        <InlineError
                          error={vip.error}
                          onRetry={() => void vip.refetch()}
                        />
                      ) : vip.isLoading ? (
                        <Loader2 className="size-4 animate-spin text-faint" />
                      ) : vip.data ? (
                        <MembershipOverview vip={vip.data} />
                      ) : null}
                    </DetailSection>
                  )}

                  {canViewAnalytics && (
                    <DetailSection
                      icon={<Activity className="size-4" />}
                      title="使用状态"
                      description="最后活跃、功能轨迹与算力点消耗"
                    >
                      <div className="mb-3 flex items-center justify-between rounded-8 bg-surface-1 px-2.5 py-2 text-12">
                        <span
                          className="text-faint"
                          title={LAST_ACTIVE_LEGACY_HINT}
                        >
                          账号最后活跃
                        </span>
                        <TimeCell
                          value={user.last_active_at}
                          className="text-12 text-subtle"
                        />
                      </div>
                      <UserUsageOverviewPanel userId={user.id} enabled={open} />
                    </DetailSection>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function UserDetailLoadState({
  query,
}: {
  query: ReturnType<typeof useUserDetail>;
}) {
  if (query.isError) {
    return (
      <div className="rounded-16 border border-border bg-surface-card p-4">
        <InlineError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex min-h-40 items-center justify-center rounded-16 border border-border bg-surface-card">
      <span className="inline-flex items-center gap-2 text-12 text-faint">
        <Loader2 className="size-4 animate-spin" />
        正在加载用户详情…
      </span>
    </div>
  );
}

function DetailSection({
  icon,
  title,
  description,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // 这是可滚动 flex-col 里的直接子项，必须禁止 shrink。
    // 否则内容总高度超过抽屉时，flex 会先把卡片压到只剩标题，而不是让父容器滚动。
    <section className="shrink-0 overflow-hidden rounded-16 border border-border bg-surface-card">
      <div className="flex items-center justify-between gap-3 border-b border-border-soft bg-surface-1 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-faint">{icon}</span>
          <div>
            <h4 className="text-14 font-medium text-foreground">{title}</h4>
            <p className="text-12 text-faint">{description}</p>
          </div>
        </div>
        {right}
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">{children}</div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 py-1.5 text-12">
      <span className="mt-0.5 shrink-0 text-faint">{icon}</span>
      <span className="w-16 shrink-0 text-faint">{label}</span>
      <span className="min-w-0 flex-1 break-words text-subtle">{children}</span>
    </div>
  );
}

function MembershipOverview({ vip }: { vip: UserVipStatus }) {
  const paid = vip.tier === 'pro' || vip.tier === 'max';
  return (
    <div className="flex flex-col gap-3">
      <p className="text-12 text-subtle">
        {paid
          ? `${cycleLabel(vip.cycle)}${vip.expires_at ? ` · 有效期至 ${vip.expires_at.slice(0, 10)}` : ' · 永久有效'}`
          : 'Free'}
      </p>
      <TokenQuotaBar vip={vip} />
      <InfoGrid>
        <InfoRow label="科研经费" icon={<WalletCards className="size-3.5" />}>
          {vip.credit.total.toFixed(2)}(约 {vip.credit.points.toLocaleString()}{' '}
          算力点)
        </InfoRow>
        <InfoRow label="重置次数" icon={<Clock className="size-3.5" />}>
          {vip.reset_pass_next_expiry
            ? `${vip.reset_passes} 次 · ${vip.reset_pass_next_expiry.slice(0, 10)} 前有效`
            : `${vip.reset_passes} 次`}
        </InfoRow>
        <InfoRow label="按量付费" icon={<Cpu className="size-3.5" />}>
          {vip.credit.credit_autopay ? '已开启' : '未开启'}
        </InfoRow>
      </InfoGrid>
    </div>
  );
}

function TierMark({ vip }: { vip: UserVipStatus }) {
  const paid = vip.tier === 'pro' || vip.tier === 'max';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-12 font-medium',
        paid ? 'text-brand-amber' : 'text-faint',
      )}
    >
      {paid && vip.cycle === 'yearly' && (
        <span className="rounded-pill bg-brand-amber/10 px-1.5 py-0.5">
          年费
        </span>
      )}
      <Crown className="size-3.5" />
      {TIER_LABEL[vip.tier] ?? vip.tier}
    </span>
  );
}

function TokenQuotaBar({ vip }: { vip: UserVipStatus }) {
  const token = vip.token;
  const exhausted = !token.unlimited && token.used >= token.ceiling;
  const reset = resetInfo(token);
  const percent = Math.max(0, Math.min(100, token.percent));
  return (
    <div className="flex flex-col gap-1 rounded-12 border border-border bg-surface-1 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 text-12">
        <span className="text-subtle">本周期 AI 额度</span>
        <span
          className={cn(
            'tabular-nums',
            exhausted ? 'text-brand-red' : 'text-foreground',
          )}
        >
          {token.unlimited
            ? '不限'
            : `${formatPoints(token.used)} / ${formatPoints(token.ceiling)} 算力点`}
        </span>
      </div>
      {!token.unlimited && (
        <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
          <div
            className={cn(
              'h-full rounded-pill transition-all',
              exhausted ? 'bg-brand-red' : 'bg-brand-green',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {!token.unlimited && (
        <div
          className="flex flex-wrap items-center justify-between gap-1 text-12 text-faint"
          title={reset.hint}
        >
          <span>{reset.notStarted ? '满额 · 用后计时' : reset.rel}</span>
          <span className="tabular-nums">
            今日实际扣额 {formatPoints(token.consumed_today)} 算力点
          </span>
        </div>
      )}
    </div>
  );
}

function InlineError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-start gap-1.5 rounded-8 border border-border bg-danger-soft px-2.5 py-2 text-12">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-brand-red" />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <span className="text-brand-red">
          加载失败：{toApiError(error).message || '未知错误'}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-4 text-faint underline underline-offset-2 hover:text-foreground"
        >
          重试
        </button>
      </div>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  const value = provider.toLowerCase();
  if (value.includes('github')) return <Github className="size-3.5" />;
  if (value.includes('google')) return <Chrome className="size-3.5" />;
  return <ShieldCheck className="size-3.5" />;
}

function wechatChannelLabel(registerSource?: string): string {
  if (registerSource === 'wechat_miniprogram') return '微信小程序';
  if (registerSource === 'wechat') return '微信扫码';
  return '微信';
}

function registerSourceLabel(source?: string): string {
  const labels: Record<string, string> = {
    wechat: '微信扫码',
    wechat_miniprogram: '微信小程序',
    email: '邮箱',
    phone: '手机号',
  };
  return source ? (labels[source] ?? source) : '未记录';
}

function cycleLabel(cycle?: 'monthly' | 'yearly'): string {
  if (cycle === 'yearly') return '年费会员';
  if (cycle === 'monthly') return '月度会员';
  return '会员(无周期标识 · 手工发放)';
}
