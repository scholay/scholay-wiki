import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Crown, Gem, Plus, RotateCcw, Ticket, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { notifyBillingChanged } from '@/shared/lib/quota-events';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { WechatPayDialog } from '@/shared/components/wechat-pay-dialog';
import { Button } from '@/shared/ui';
import { Switch } from '@/shared/ui/switch';
import { RedeemConfirmDialog } from '../redeem-confirm-dialog';
import { MobileMembershipDialog } from './MobileMembershipDialog';
import { MobileRechargeDialog } from './MobileRechargeDialog';
import {
  useBillingOverview,
  useResetQuota,
  useSetCreditAutopay,
  type Tier,
} from '../../api/membership';
import { monthDay, resetInfo } from '../../lib/quota-display';

const TIER_LABEL: Record<Tier, string> = { free: 'Free', pro: 'Pro', max: 'Max' };
const TIER_BADGE_CLS: Record<Tier, string> = {
  free: 'bg-surface-2 text-muted-foreground',
  pro: 'bg-brand-green text-on-brand',
  max: 'bg-brand-amber text-foreground',
};

/**
 * 移动端会员/账户资产卡 —— PC AccountAssetsCard 的纵向重排:
 * 等级铭牌+到期 / 本周期额度进度条 / 经费余额 + 充值 / 「用经费继续」开关 / 重置 / 兑换码。
 * 数据与 mutation 全部复用 settings 的 membership hooks。
 * 升级 = MobileMembershipDialog(兑换码 + 支付宝 wap);充值 = MobileRechargeDialog(支付宝 wap)。
 *
 * membershipSignal:>0 的递增计数,每次变化自动打开「开通会员」弹层 ——
 * 供 /m/me?upgrade=1(QuotaNotifier 移动分流的落点)承接用;用计数而非布尔,
 * 用户关掉弹层后再次触发仍能重新打开。
 */
export function MobileAssetsCard({ membershipSignal = 0 }: { membershipSignal?: number }) {
  const qc = useQueryClient();
  const overviewQ = useBillingOverview();
  const resetMut = useResetQuota();
  const autopayMut = useSetCreditAutopay();

  const [resetOpen, setResetOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  // 微信支付 handoff:开通/充值弹层建单成功后把单号交上来,由这里统一开扫码弹窗
  // (两个来源共用一个弹窗实例,避免 Dialog 套 Dialog)。
  const [wxOrder, setWxOrder] = useState<{ orderNo: string; subject: string } | null>(null);
  const openWechat = (orderNo: string, subject: string) => {
    setMembershipOpen(false);
    setRechargeOpen(false);
    setWxOrder({ orderNo, subject });
  };

  // ?upgrade=1 承接:signal 递增 → 打开开通会员弹层(数据未回时先置 open,弹层随 data 渲染)。
  useEffect(() => {
    if (membershipSignal > 0) setMembershipOpen(true);
  }, [membershipSignal]);

  const data = overviewQ.data;
  if (overviewQ.isLoading) {
    return (
      <div className="h-44 animate-pulse rounded-16 border border-border bg-surface-1" />
    );
  }
  if (!data) return null;

  const tier = data.tier;
  const TierIcon = tier === 'max' ? Crown : tier === 'pro' ? Gem : null;
  const { token, credit } = data;
  // 与 PC AccountAssetsCard 同口径:展示**剩余**百分比,进度条宽度 = 剩余(未开窗=满额)
  const remaining = token.unlimited || !token.window_started_at ? 100 : Math.max(0, 100 - token.percent);
  const exhausted = !token.unlimited && remaining <= 0;
  const ri = resetInfo(token); // 额度恢复信息(相对 + 绝对)

  return (
    <section className="overflow-hidden rounded-16 border border-border bg-surface-card">
      {/* 等级行 */}
      <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
        <span
          className={cn(
            'flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-12 font-medium',
            TIER_BADGE_CLS[tier]
          )}
        >
          {TierIcon && <TierIcon className="size-3" />}
          {TIER_LABEL[tier]}
        </span>
        {/* 年费会员徽标(0079)—— 与月度会员显式区分 */}
        {data.cycle === 'yearly' && tier !== 'free' && (
          <span className="rounded-pill bg-brand-amber/10 px-2 py-0.5 text-12 font-medium text-brand-amber">年费</span>
        )}
        {data.expires_at && (
          <span className="text-12 text-faint">
            {new Date(data.expires_at).toLocaleDateString('zh-CN')} 到期
          </span>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => setMembershipOpen(true)}
          className="ml-auto px-3"
        >
          {tier === 'max' ? '续期' : '升级会员'}
        </Button>
      </div>

      {/* AI 额度 */}
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-14 font-medium text-foreground">AI 额度</span>
          <span className="text-12 text-muted-foreground">
            {token.unlimited
              ? '不限'
              : `剩余 ${Math.round(remaining)}%${exhausted ? ' · 已耗尽' : ''}`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-pill bg-surface-2">
          <div
            className={cn(
              'h-full rounded-pill transition-all',
              // 同 PC 三档色:耗尽红 / 剩余 ≤20% 琥珀 / 充足绿
              exhausted
                ? 'bg-brand-red'
                : remaining <= 20
                  ? 'bg-brand-amber'
                  : 'bg-brand-green'
            )}
            /* 动态进度宽度 — 运行时计算,只能内联 */
            style={{ width: `${remaining}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          {/* 重置时间(业界做法:周期额度必露出重置时刻)—— 未开窗=满额·用后计时,窗口内=N 天后重置(日期) */}
          <span className={cn('min-w-0 flex-1 truncate text-12', exhausted ? 'text-brand-red' : 'text-faint')}>
            {token.unlimited
              ? '会员不限本项额度'
              : ri.notStarted
                ? `满额 · 首次使用起算 ${token.window_days} 天`
                : `${ri.rel} · ${ri.hint}`}
          </span>
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            disabled={resetMut.isPending}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-pill border px-2.5 py-1 text-12',
              exhausted
                ? 'border-brand-red text-brand-red'
                : 'border-border-button text-muted-foreground'
            )}
          >
            <RotateCcw className="size-3" />
            重置额度
          </button>
        </div>
      </div>

      {/* 经费 */}
      <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3">
        <Wallet className="size-4 shrink-0 text-brand-amber" />
        <div className="flex min-w-0 flex-col">
          <span className="text-14 text-foreground">
            经费 <span className="font-medium">{credit.total.toLocaleString('en-US')}</span>
          </span>
          {/* 2026-07-31 拍板:算力点不对用户展示(经费=分,数字即价值)。 */}
        </div>
        {/* 充值经费 —— 支付宝手机网站支付(MobileRechargeDialog),样式对齐上方「重置额度」pill */}
        <button
          type="button"
          onClick={() => setRechargeOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-pill border border-border-button px-2.5 py-1 text-12 text-foreground"
        >
          <Plus className="size-3" />
          充值
        </button>
        {/* 0090:经费不再分临时/永久,只有一种 —— 拆分行删掉。 */}
        <div className="ml-auto flex shrink-0 flex-col items-end text-12 text-faint">
          <span>剩余恢复次数 {data.reset_passes}</span>
          {/* 最近一批恢复次数的到期时刻(null = 无可用次数);批内计数后端不下发,N 用总次数。 */}
          {data.reset_passes > 0 && data.reset_pass_next_expiry && (
            <span>{data.reset_passes} 次将于 {monthDay(data.reset_pass_next_expiry)} 前有效</span>
          )}
        </div>
      </div>

      {/* 用经费继续(0094 按量付费)—— PC CreditAutopayCard 同口径:
          🔴 默认关、只能用户显式开(历史 auto_reset 因不知情扣费整个下线,同类风险),
          文案必须把「会自动扣经费」讲明白。 */}
      <div className="flex items-center gap-3 border-t border-border-soft px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-14 text-foreground">用经费继续</span>
          <span className="text-12 leading-paragraph text-faint">额度用完后,仅对超出部分按量扣除经费</span>
        </div>
        <Switch
          checked={credit.credit_autopay}
          disabled={autopayMut.isPending}
          onCheckedChange={(v) => {
            autopayMut.mutate(v, {
              onSuccess: () =>
                toast.success(v ? '已开启,额度用完后将自动使用经费' : '已关闭,额度用完后不会自动扣除经费'),
              onError: (e) => toast.error(toApiError(e).message || '保存失败'),
            });
          }}
        />
      </div>

      {/* 兑换码 */}
      <form
        className="flex items-center gap-2 border-t border-border-soft px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (redeemCode.trim()) setRedeemOpen(true);
        }}
      >
        <Ticket className="size-4 shrink-0 text-faint" />
        <input
          value={redeemCode}
          onChange={(e) => setRedeemCode(e.target.value)}
          placeholder="输入兑换码"
          className="min-w-0 flex-1 bg-transparent text-12 text-foreground placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={!redeemCode.trim()}
          className="rounded-pill border border-border-button px-3 py-1 text-12 text-foreground disabled:opacity-40"
        >
          兑换
        </button>
      </form>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="立即恢复额度"
        description={
          // 0090:按**恢复次数**判,不是经费余额。次数用完时不引导充值 —— 经费买不到恢复次数。
          // 用词与全站额度文案同律:说「恢复」不说「重置」,也不提周期机制。
          data.reset_passes > 0
            ? `使用 1 次恢复次数,额度将立即回到满额(当前剩余 ${data.reset_passes} 次)。`
            : '恢复次数已用完。额度到期会自动恢复至满额;如需更多额度,可升级会员。'
        }
        confirmText="确认恢复"
        onConfirm={async () => {
          if (data.reset_passes <= 0) {
            toast.error('恢复次数已用完');
            return;
          }
          try {
            await resetMut.mutateAsync();
            toast.success('额度已恢复至满额');
          } catch (e) {
            toast.error((e as Error).message || '恢复失败,请稍后重试');
          }
        }}
      />

      {/* 「升级会员/续期」按钮打开的开通弹层 —— 突出兑换码开通会员(替代原来的死胡同 toast)。
          兑换确认复用下方同一个 RedeemConfirmDialog:这里只把码交回来 + 关本弹层 + 开确认弹层。 */}
      <MobileMembershipDialog
        open={membershipOpen}
        onOpenChange={setMembershipOpen}
        tier={tier}
        onRedeem={(c) => {
          setRedeemCode(c);
          setMembershipOpen(false);
          setRedeemOpen(true);
        }}
        onWechatOrder={openWechat}
      />

      <RedeemConfirmDialog
        code={redeemCode.trim()}
        open={redeemOpen}
        onOpenChange={setRedeemOpen}
        onRedeemed={() => setRedeemCode('')}
      />

      {/* 充值经费(支付宝 wap 回跳 /m/me;微信走下面的扫码/h5 弹窗) */}
      <MobileRechargeDialog open={rechargeOpen} onOpenChange={setRechargeOpen} onWechatOrder={openWechat} />

      {/* 微信支付 —— 开通会员 / 充值经费 共用一个实例。
          移动浏览器里它会用 mode:'h5' 直接跳微信;微信内则显示可长按识别的二维码。 */}
      <WechatPayDialog
        orderNo={wxOrder?.orderNo ?? null}
        subject={wxOrder?.subject}
        onOpenChange={(o) => !o && setWxOrder(null)}
        onPaid={() => {
          toast.success('支付成功,权益已到账');
          notifyBillingChanged();
          qc.invalidateQueries({ queryKey: ['settings', 'billing'] });
        }}
      />
    </section>
  );
}
