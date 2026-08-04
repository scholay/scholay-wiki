import { AlertTriangle, Crown, Loader2, Lock, Mail, Phone, ShieldCheck, Clock, Github, Chrome } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/shared/ui/sheet';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { resetInfo } from '@/shared/lib/quota-display';
import { CopyableId } from './CopyableId';
import { TimeCell } from './TimeCell';
import { UserTokenUsagePanel } from './UserTokenUsagePanel';
import { UserGrantPanel } from './UserGrantPanel';
import { UserBillingSections } from './UserBillingPanels';
import {
  useUserDetail,
  useUserVipStatus,
  type AdminUser,
  type UserVipStatus,
} from '../api/users';
import { MICRO_YUAN_PER_POINT } from '../api/token-usage';
import { useHasPermission, PERM, roleLabel, roleBadgeVariant } from '../permissions';

// 会员等级展示名全站统一:Free / Pro / Max(不用「专业版 / 旗舰版」)。
const TIER_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' };

/**
 * 计费周期标识 —— **三态,不是二选一**。
 *
 * 后端 `UserVipStatus.cycle` 是可选字段(0079:免费/过期时省略),而管理员在 UserGrantPanel 里
 * 手工发放会员时,周期标识的默认值是 `keep`(压根不发 cycle 字段)。此前这里写的是
 * `cycle === 'yearly' ? '年费会员' : '月度会员'`,于是**所有手工发放的会员都被言之凿凿地
 * 说成"月度会员"** —— 而它实际上根本没有周期标识。缺失就要显示成缺失。
 */
function CYCLE_LABEL(cycle?: 'monthly' | 'yearly'): string {
  if (cycle === 'yearly') return '年费会员';
  if (cycle === 'monthly') return '月度会员';
  return '会员(无周期标识 · 手工发放)';
}

/** 区块级失败态 —— 保留后端的具体原因,给重试;绝不让失败静默退化成某个"看起来正常"的值。 */
function InlineError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const msg = toApiError(error).message || '加载失败';
  return (
    <div className="flex items-start gap-1.5 rounded-8 border border-border bg-danger-soft px-2.5 py-2 text-12">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-brand-red" />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <span className="text-brand-red">加载失败:{msg}</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-4 text-faint underline underline-offset-2 transition-colors hover:text-foreground"
        >
          重试
        </button>
      </div>
    </div>
  );
}

/** 第三方登录方式的图标(无品牌图标的回落到通用)。 */
function ProviderIcon({ provider }: { provider: string }) {
  const p = provider.toLowerCase();
  if (p.includes('github')) return <Github className="size-3.5" />;
  if (p.includes('google')) return <Chrome className="size-3.5" />;
  return <ShieldCheck className="size-3.5" />;
}

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
  discourse: '论坛', // 与 UserCell 的富卡片保持一致 —— 同一页上两个入口不能给同一来源起两个名字
};

// 微信徽章按注册来源细分(小程序 vs 网页扫码;两者都记 provider='wechat')。
function wechatChannelLabel(registerSource?: string): string {
  if (registerSource === 'wechat_miniprogram') return '微信小程序';
  if (registerSource === 'wechat') return '微信扫码';
  return '微信';
}

/**
 * 用户详情抽屉 —— 管理 / 运营视角:
 *   - 基础资料(行数据,免再拉)
 *   - 登录方式(账号 / 第三方绑定)
 *   - 会员状态 + 本周期(7 天)统一 token 额度(窗口起止 / 当日消耗)
 *   - 直接授予 / 续期 / 取消会员
 * 账号操作(冻结 / 角色 / 删除)仍在列表行的下拉,这里聚焦「看清这个人 + 管会员」。
 */
export function UserDetailDrawer({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = user?.id;
  // 会员/经费/财务下钻属 users.manage —— 运营(仅 users.view)只看基础资料 + 登录方式。
  const canManageUsers = useHasPermission(PERM.usersManage);
  const detail = useUserDetail(open ? id : undefined);
  // /users/:id/vip 后端归 users.manage,运营会 403 → 直接不发请求(enabled 门槛带上权限)。
  const vip = useUserVipStatus(open && canManageUsers ? id : undefined);

  const displayName =
    user?.username || user?.email?.split('@')[0] || user?.phone || `User #${user?.id}`;
  const tier = vip.data?.tier ?? 'free';
  const isPro = tier === 'pro' || tier === 'max'; // 是否付费会员

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {user && (
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {displayName}
            <Badge variant={roleBadgeVariant(user.role)}>{roleLabel(user.role)}</Badge>
            {user.status === 2 && <Badge variant="destructive">已冻结</Badge>}
          </SheetTitle>
          {/* 走 CopyableId(内部 copyToClipboard + 按真实结果 toast)——
              线上后台是明文 HTTP,`navigator.clipboard` 是 undefined,旧写法的 `?.` 让复制静默失败但绿 toast 照弹。 */}
          <SheetDescription className="flex items-center gap-2">
            用户 ID
            <CopyableId value={user.id} prefix="#" label="用户 ID" />
          </SheetDescription>
        </SheetHeader>

        {/* 只让中间区域滚动 —— SheetHeader / SheetFooter 始终固定可见(授予/取消会员不会滚出视野) */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-3">
          {/* 基础资料 */}
          <Section title="基础资料">
            <InfoRow icon={<Mail className="size-3.5" />} label="邮箱">
              {user.email ? (
                <span className="flex items-center gap-1.5">
                  {user.email}
                  {user.email_verified ? (
                    <Badge variant="outline" className="border-brand-green text-brand-green">已验证</Badge>
                  ) : (
                    <Badge variant="muted">未验证</Badge>
                  )}
                </span>
              ) : (
                '—'
              )}
            </InfoRow>
            <InfoRow icon={<Phone className="size-3.5" />} label="手机号">
              {user.phone || '—'}
            </InfoRow>
            <InfoRow icon={<Clock className="size-3.5" />} label="注册时间">
              <TimeCell value={user.created_at} className="text-12" />
            </InfoRow>
            <InfoRow icon={<Clock className="size-3.5" />} label="最后活跃">
              <TimeCell value={user.last_active_at} className="text-12" />
            </InfoRow>
            <InfoRow icon={<Clock className="size-3.5" />} label="最后登录">
              <TimeCell value={user.last_login_at} className="text-12" />
              {user.last_login_ip ? <span className="ml-2 text-faint">{user.last_login_ip}</span> : null}
            </InfoRow>
            {/* 冻结档案 —— 后端冻结**强制要求填原因**并落 users.frozen_at / frozen_reason,
                但改造前全 admin 目录零渲染点:系统里存着"为什么封、什么时候封",
                用户申诉时运维只能去 MySQL select。这两行就是那条链路的出口。 */}
            {user.status === 2 && (
              <>
                <InfoRow icon={<Lock className="size-3.5" />} label="冻结时间">
                  <TimeCell value={user.frozen_at} className="text-12" />
                </InfoRow>
                <InfoRow icon={<Lock className="size-3.5" />} label="冻结原因">
                  {user.frozen_reason ? (
                    <span className="text-brand-red">{user.frozen_reason}</span>
                  ) : (
                    <span className="text-faint">未记录(可能是旧数据 / 直接改库冻结的)</span>
                  )}
                </InfoRow>
              </>
            )}
            {user.admin_notes && (
              <InfoRow icon={<ShieldCheck className="size-3.5" />} label="管理备注">
                {user.admin_notes}
              </InfoRow>
            )}
          </Section>

          {/* 登录方式 */}
          <Section title="登录方式">
            {detail.isError ? (
              <InlineError error={detail.error} onRetry={detail.refetch} />
            ) : detail.isLoading ? (
              <Loader2 className="size-4 animate-spin text-faint" />
            ) : detail.data?.auth_providers?.length ? (
              <div className="flex flex-wrap gap-2">
                {detail.data.auth_providers.map((p) => (
                  <span
                    key={p.provider}
                    className="inline-flex items-center gap-1.5 rounded-8 border border-border bg-surface-1 px-2 py-1 text-12 text-subtle"
                  >
                    <ProviderIcon provider={p.provider} />
                    {p.provider.toLowerCase() === 'wechat'
                      ? wechatChannelLabel(detail.data?.register_source)
                      : (PROVIDER_LABEL[p.provider.toLowerCase()] || p.provider)}
                    <span className="text-12 text-faint">{p.created_at?.slice(0, 10)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-12 text-faint">仅账号密码登录</span>
            )}
          </Section>

          {/* 会员 / Token / 财务下钻 —— 属 users.manage,运营(仅 users.view)看不到 */}
          {canManageUsers && (
          <>
          {/* 会员 */}
          <Section
            title="会员"
            right={
              vip.isError ? (
                // 取不到就显示"取不到",不显示 Free —— 见下方 InlineError 的理由
                <span className="inline-flex items-center gap-1 text-12 font-medium text-faint" title="会员状态加载失败">
                  <AlertTriangle className="size-3.5 text-brand-red" />—
                </span>
              ) : (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-12 font-medium',
                    isPro ? 'text-brand-amber' : 'text-faint'
                  )}
                >
                  {/* 年费会员徽标(0079)—— 后台同样显式区分年费 / 月度 */}
                  {isPro && vip.data?.cycle === 'yearly' && (
                    <span className="rounded-pill bg-brand-amber/10 px-1.5 py-0.5 text-12 font-medium text-brand-amber">年费</span>
                  )}
                  <Crown className="size-3.5" />
                  {TIER_LABEL[tier]}
                </span>
              )
            }
          >
            {vip.isError ? (
              // 失败时**绝不能**落到下面的「Free」—— 那是把 Max 用户显示成免费用户,
              // 会直接导致"他没买过会员"的错误结论(与列表页的 effectiveTier 也自相矛盾)。
              <InlineError error={vip.error} onRetry={vip.refetch} />
            ) : vip.isLoading ? (
              <Loader2 className="size-4 animate-spin text-faint" />
            ) : (
              <>
                <p className="text-12 text-muted-foreground">
                  {isPro
                    ? `${CYCLE_LABEL(vip.data?.cycle)}${
                        vip.data?.expires_at ? ` · 有效期至 ${vip.data.expires_at.slice(0, 10)}` : ' · 永久有效'
                      }`
                    : 'Free'}
                </p>
                {vip.data && (
                  <div className="mt-3 flex flex-col gap-3">
                    <TokenQuotaBar vip={vip.data} />
                    <div className="flex items-center justify-between text-12">
                      <span className="text-faint">科研经费</span>
                      <span className="tabular-nums text-subtle">
                        {/* 0090 经费只剩一种;0094 是小数 → 固定两位。同屏给出可兑算力(兑换率可调)。 */}
                        {vip.data.credit.total.toFixed(2)}(≈{vip.data.credit.points.toLocaleString()} 算力点)
                      </span>
                    </div>
                    {/* 计费干预可见性(纯展示):重置次数(0090 重置改扣次数)+ 用经费继续(payg 兜底,须用户自己开)。 */}
                    <div className="flex items-center justify-between text-12">
                      <span className="text-faint">重置次数</span>
                      <span className="tabular-nums text-subtle">
                        {vip.data.reset_pass_next_expiry
                          ? `${vip.data.reset_passes} 次将于 ${vip.data.reset_pass_next_expiry.slice(0, 10)} 前有效`
                          : `${vip.data.reset_passes} 次`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-12">
                      <span className="text-faint">用经费继续(按量付费)</span>
                      {vip.data.credit.credit_autopay ? (
                        <Badge variant="outline" className="border-brand-green text-brand-green">已开启</Badge>
                      ) : (
                        <Badge variant="muted">未开启</Badge>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </Section>

          {/* 算力用量(历史天/模型拆分)—— 本周期额度条之外的历史明细视角,与额度条同单位 */}
          <Section title="算力用量">
            <UserTokenUsagePanel userId={user.id} />
          </Section>

          {/* 财务下钻:订单 / 经费流水(充值·消费) / 经费兑换 —— 与用户设置页对齐,懒加载 */}
          <UserBillingSections userId={user.id} open={open} />
          </>
          )}
        </div>

        {/* 发放会员 / 调整经费 —— 仅 users.manage(运营看不到) */}
        {canManageUsers && (
          <SheetFooter>
            {/* key={user.id} 强制换用户时重挂:抽屉是复用的,不重挂的话金额 / 天数 / 备注
                会带着**上一个用户**的数值进到下一次调账 —— 写钱的表单不能有这种残留。 */}
            <UserGrantPanel key={user.id} user={user} vip={vip.data} displayName={displayName} />
          </SheetFooter>
        )}
      </SheetContent>
      )}
    </Sheet>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-12 font-medium text-faint">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1 text-12">
      <span className="mt-0.5 text-faint">{icon}</span>
      <span className="w-16 shrink-0 text-faint">{label}</span>
      <span className="flex-1 text-subtle">{children}</span>
    </div>
  );
}

/** 本周期(7 天锚定窗口)统一 token 额度条(已不分功能)。ceiling<0 视为不限。
 *  与用户端「账户资产」同口径:露出窗口重置时刻(首次使用开锚,重置/升级换锚)+ 当日真实消耗。 */
function TokenQuotaBar({ vip }: { vip: UserVipStatus }) {
  const t = vip.token;
  const exhausted = !t.unlimited && t.used >= t.ceiling;
  const ri = resetInfo(t);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-12">
        <span className="text-subtle">本周期 AI 额度(算力点)</span>
        <span className={cn('tabular-nums', exhausted ? 'text-brand-red' : 'text-faint')}>
          {/* P5 成本制:used/ceiling 单位=微元真实成本,÷ MICRO_YUAN_PER_POINT = 算力点(1 点 = ¥0.001 成本)。 */}
          {t.unlimited
            ? '不限'
            : `${Math.round(t.used / MICRO_YUAN_PER_POINT).toLocaleString()} / ${Math.round(t.ceiling / MICRO_YUAN_PER_POINT).toLocaleString()}`}
        </span>
      </div>
      {!t.unlimited && (
        <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
          <div
            className={cn('h-full rounded-pill transition-all', exhausted ? 'bg-brand-red' : 'bg-brand-green')}
            style={{ width: `${t.percent}%` }}
          />
        </div>
      )}
      {!t.unlimited && (
        <div className="flex items-center justify-between text-12 text-faint" title={ri.hint}>
          <span>{ri.notStarted ? '满额 · 用后计时' : ri.rel}</span>
          <span className="tabular-nums">当日消耗 {Math.round(t.consumed_today / MICRO_YUAN_PER_POINT).toLocaleString()} 算力点</span>
        </div>
      )}
    </div>
  );
}
