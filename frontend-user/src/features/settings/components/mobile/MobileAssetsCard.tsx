import { useState } from 'react';
import { Crown, Gem, RotateCcw, Ticket, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { RedeemConfirmDialog } from '../redeem-confirm-dialog';
import { MobileMembershipDialog } from './MobileMembershipDialog';
import {
  useBillingOverview,
  useResetQuota,
  type Tier,
} from '../../api/membership';
import { resetInfo } from '../../lib/quota-display';

const TIER_LABEL: Record<Tier, string> = { free: 'Free', pro: 'Pro', max: 'Max' };
const TIER_BADGE_CLS: Record<Tier, string> = {
  free: 'bg-surface-2 text-muted-foreground',
  pro: 'bg-brand-green text-on-brand',
  max: 'bg-brand-amber text-on-brand',
};

/**
 * 移动端会员/账户资产卡 —— PC AccountAssetsCard 的纵向重排:
 * 等级铭牌+到期 / 本周期额度进度条 / 经费余额(临时+永久) / 重置 / 兑换码。
 * 数据与 mutation 全部复用 settings 的 membership hooks。
 * 升级/充值走支付网关,移动端暂不开,提示去电脑端操作。
 */
export function MobileAssetsCard() {
  const overviewQ = useBillingOverview();
  const resetMut = useResetQuota();

  const [resetOpen, setResetOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);

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
  const ri = resetInfo(token); // 7 天窗口重置信息(相对 + 绝对)

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
        <button
          type="button"
          onClick={() => setMembershipOpen(true)}
          className="ml-auto rounded-pill bg-foreground px-3 py-1 text-12 font-medium text-on-brand active:opacity-80"
        >
          {tier === 'max' ? '续期' : '升级会员'}
        </button>
      </div>

      {/* 本周期额度 */}
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-14 font-medium text-foreground">本周期额度</span>
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
        <Wallet className="size-4 text-brand-amber" />
        <span className="text-14 text-foreground">
          经费 <span className="font-medium">{credit.total.toLocaleString('en-US')}</span>
        </span>
        <span className="ml-auto text-12 text-faint">
          临时 {credit.temp.toLocaleString('en-US')} · 永久{' '}
          {credit.perm.toLocaleString('en-US')}
        </span>
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
          className="min-w-0 flex-1 bg-transparent text-12 text-foreground outline-none placeholder:text-faint"
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
        title="重置本周期额度"
        description={
          credit.total >= data.reset_cost
            ? `将消耗 ${data.reset_cost.toLocaleString('en-US')} 经费立即恢复本周期额度,确认重置?`
            : `重置需要 ${data.reset_cost.toLocaleString('en-US')} 经费,当前余额不足(${credit.total.toLocaleString('en-US')}),请先兑换或在电脑端充值`
        }
        confirmText="确认重置"
        onConfirm={async () => {
          if (credit.total < data.reset_cost) {
            toast.error('经费不足,无法重置');
            return;
          }
          try {
            await resetMut.mutateAsync();
            toast.success('本周期额度已重置');
          } catch (e) {
            toast.error((e as Error).message || '重置失败');
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
      />

      <RedeemConfirmDialog
        code={redeemCode.trim()}
        open={redeemOpen}
        onOpenChange={setRedeemOpen}
        onRedeemed={() => setRedeemCode('')}
      />
    </section>
  );
}
