import { Copy, Crown, Loader2, Mail, Phone, ShieldCheck, Clock, Github, Chrome } from 'lucide-react';
import { toast } from 'sonner';
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
import { UserTokenUsagePanel } from './UserTokenUsagePanel';
import { UserGrantPanel } from './UserGrantPanel';
import { UserBillingSections } from './UserBillingPanels';
import {
  useUserDetail,
  useUserVipStatus,
  type AdminUser,
  type UserVipStatus,
} from '../api/users';

// 会员等级展示名全站统一:Free / Pro / Max(不用「专业版 / 旗舰版」)。
const TIER_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' };

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
  discourse: 'Discourse',
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
 *   - 会员状态 + 今日各 AI 功能额度
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
  const detail = useUserDetail(open ? id : undefined);
  const vip = useUserVipStatus(open ? id : undefined);

  const displayName =
    user?.username || user?.email?.split('@')[0] || user?.phone || `User #${user?.id}`;
  const tier = vip.data?.tier ?? 'free';
  const isPro = tier === 'pro' || tier === 'max'; // 是否付费会员

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast.success(`已复制${label}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {user && (
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {displayName}
            <Badge variant={user.role === 'super_admin' ? 'destructive' : user.role === 'admin' ? 'default' : 'muted'}>
              {user.role === 'super_admin' ? '超级管理员' : user.role === 'admin' ? '管理员' : '用户'}
            </Badge>
            {user.status === 2 && <Badge variant="destructive">已冻结</Badge>}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            用户 ID #{user.id}
            <button
              type="button"
              onClick={() => copy(String(user.id), '用户 ID')}
              className="inline-flex items-center gap-1 text-faint transition-colors hover:text-foreground"
            >
              <Copy className="size-3" />
            </button>
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
              {user.created_at?.slice(0, 10) || '—'}
            </InfoRow>
            <InfoRow icon={<Clock className="size-3.5" />} label="最后活跃">
              {user.last_active_at ? user.last_active_at.slice(0, 16).replace('T', ' ') : '—'}
            </InfoRow>
            <InfoRow icon={<Clock className="size-3.5" />} label="最后登录">
              {user.last_login_at ? user.last_login_at.slice(0, 16).replace('T', ' ') : '—'}
              {user.last_login_ip ? <span className="ml-2 text-faint">{user.last_login_ip}</span> : null}
            </InfoRow>
          </Section>

          {/* 登录方式 */}
          <Section title="登录方式">
            {detail.isLoading ? (
              <Loader2 className="size-4 animate-spin text-faint" />
            ) : detail.data?.auth_providers?.length ? (
              <div className="flex flex-wrap gap-2">
                {detail.data.auth_providers.map((p) => (
                  <span
                    key={p.provider}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs text-subtle"
                  >
                    <ProviderIcon provider={p.provider} />
                    {p.provider.toLowerCase() === 'wechat'
                      ? wechatChannelLabel(detail.data?.register_source)
                      : (PROVIDER_LABEL[p.provider.toLowerCase()] || p.provider)}
                    <span className="text-2xs text-faint">{p.created_at?.slice(0, 10)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-faint">仅账号密码登录</span>
            )}
          </Section>

          {/* 会员 */}
          <Section
            title="会员"
            right={
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-bold',
                  isPro ? 'text-brand-amber' : 'text-faint'
                )}
              >
                <Crown className="size-3.5" />
                {TIER_LABEL[tier]}
              </span>
            }
          >
            {vip.isLoading ? (
              <Loader2 className="size-4 animate-spin text-faint" />
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {isPro
                    ? vip.data?.expires_at
                      ? `有效期至 ${vip.data.expires_at.slice(0, 10)}`
                      : '永久有效'
                    : 'Free'}
                </p>
                {vip.data && (
                  <div className="mt-3 flex flex-col gap-3">
                    <TokenQuotaBar vip={vip.data} />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-faint">科研经费</span>
                      <span className="tabular-nums text-subtle">
                        {vip.data.credit.total}(永久 {vip.data.credit.perm} · 临时 {vip.data.credit.temp})
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </Section>

          {/* Token 用量(历史天/模型拆分)—— 今日额度条之外的明细视角 */}
          <Section title="Token 用量">
            <UserTokenUsagePanel userId={user.id} />
          </Section>

          {/* 财务下钻:订单 / 经费流水(充值·消费) / 经费兑换 —— 与用户设置页对齐,懒加载 */}
          <UserBillingSections userId={user.id} open={open} />
        </div>

        {/* 发放会员 / 调整经费 */}
        <SheetFooter>
          <UserGrantPanel user={user} vip={vip.data} displayName={displayName} />
        </SheetFooter>
      </SheetContent>
      )}
    </Sheet>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-2xs font-bold tracking-[0.12em] text-faint">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm">
      <span className="mt-0.5 text-faint">{icon}</span>
      <span className="w-16 shrink-0 text-faint">{label}</span>
      <span className="flex-1 text-subtle">{children}</span>
    </div>
  );
}

/** 今日统一 token 额度条(已不分功能)。ceiling<0 视为不限。 */
function TokenQuotaBar({ vip }: { vip: UserVipStatus }) {
  const t = vip.token;
  const exhausted = !t.unlimited && t.used >= t.ceiling;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-subtle">今日 AI 额度(token)</span>
        <span className={cn('tabular-nums', exhausted ? 'text-brand-red' : 'text-faint')}>
          {t.unlimited ? '不限' : `${t.used.toLocaleString()} / ${t.ceiling.toLocaleString()}`}
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
    </div>
  );
}
