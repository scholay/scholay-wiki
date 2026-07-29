// 移动端「开通会员」弹层 —— 把原本死胡同的「升级会员」按钮(只弹 toast「去电脑端」)换成可操作的开通入口:
//   ① 兑换码开通(就地,不跳转,唯一不依赖支付网关的方式);
//   ② 支付宝**手机网站支付**(alipay.trade.wap.pay)选套餐 → 下单 → 跳收银台 / 唤起支付宝 App。
// 微信内置浏览器无法唤起支付宝(行业限制)→ 检测到则提示「在浏览器打开」,不给假按钮。
//
// 兑换确认复用 MobileAssetsCard 已有的 RedeemConfirmDialog(本弹层只收码 + onRedeem 交回父组件,
// 父组件关本弹层 + 开确认弹层),避免 Dialog 套 Dialog。
import { useEffect, useState } from 'react';
import { ChevronRight, CreditCard, Crown, Gem, Loader2, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog';
import { toApiError } from '@/shared/lib/http';
import { isWeChatBrowser } from '@/shared/lib/device';
import { BillingCycleToggle, maxYearlySavingsPct, planYearlyEnabled, type SubQuote } from '@/shared/components';
import {
  quoteSubscription,
  useCreateSubscription,
  usePlans,
  useStartAlipay,
  type BillingCycle,
  type Tier,
} from '../../api/membership';

const RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };

export interface MobileMembershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前等级 —— max 显示「续期」,其余显示「开通」。 */
  tier: Tier;
  /** 用户提交兑换码 → 父组件关本弹层并打开兑换确认弹层(复用已有 RedeemConfirmDialog)。 */
  onRedeem: (code: string) => void;
}

export function MobileMembershipDialog({
  open,
  onOpenChange,
  tier,
  onRedeem,
}: MobileMembershipDialogProps) {
  const [code, setCode] = useState('');
  const [payingTier, setPayingTier] = useState<Tier | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  // 每个可购档在当前周期下的真实报价(action + 应付金额 + 后端锁定周期),按 tier 缓存。
  const [quotes, setQuotes] = useState<Record<string, SubQuote>>({});
  const plansQ = usePlans();
  const createSub = useCreateSubscription();
  const startAlipay = useStartAlipay();
  const renew = tier === 'max';
  const inWeChat = isWeChatBrowser();

  const alipayOn = plansQ.data?.payment_methods?.alipay ?? false;
  // 只展示当前档及以上(不支持降级);升级/续期/新购的真实金额与文案全部由 quote 驱动,
  // 杜绝「按钮标全年价、实际是月度补差 + subject 谎称年度会员」的货不对板(评审 pricing-math)。
  const payPlans = (plansQ.data?.plans ?? [])
    .filter((p) => p.tier !== 'free')
    .filter((p) => RANK[p.tier] >= RANK[tier]);
  // 年付入口(0079):任一档配置了年价才显示切换;单档未开放年付时按钮回落月价。
  const yearlyAvailable = payPlans.some(planYearlyEnabled);
  const savingsPct = maxYearlySavingsPct(plansQ.data?.plans ?? []);

  // 拉每个可购档在所选周期下的报价(单档未开放年付则按月度询价)。
  useEffect(() => {
    if (!open || payPlans.length === 0) {
      setQuotes({});
      return;
    }
    let alive = true;
    const reqs = payPlans.map((p) => {
      const c: BillingCycle = cycle === 'yearly' && planYearlyEnabled(p) ? 'yearly' : 'monthly';
      return quoteSubscription(p.tier as 'pro' | 'max', c)
        .then((q) => [p.tier, q] as const)
        .catch(() => null);
    });
    Promise.all(reqs).then((rs) => {
      if (alive) setQuotes(Object.fromEntries(rs.filter(Boolean) as [string, SubQuote][]));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycle, tier, plansQ.data]);

  // 选套餐 → 下单 → 发起支付宝**手机网站支付**(channel=wap)→ 跳收银台 / 唤起 App。
  // 金额与周期一律取 quote(后端权威):升级=当前周期补差;subject 按 action/周期如实拼,不谎称年度。
  const handlePay = async (planTier: Tier, q: SubQuote) => {
    if (inWeChat) {
      toast.info('请在浏览器中打开本页面后再用支付宝支付');
      return;
    }
    setPayingTier(planTier);
    const label = planTier === 'max' ? 'Max' : 'Pro';
    const subject =
      q.action === 'upgrade'
        ? `Scholay ${label} 会员升级`
        : q.cycle === 'yearly'
          ? `Scholay ${label} 年度会员`
          : `Scholay ${label} 会员`;
    try {
      const order = await createSub.mutateAsync({ plan: planTier, cycle: q.cycle });
      const back = `${window.location.origin}/m/me`;
      const pay = await startAlipay.mutateAsync({
        order_no: order.order_no,
        amount: order.final_amount,
        subject,
        channel: 'wap',
        return_url: back,
        quit_url: back,
      });
      window.location.href = pay.payment_url; // 离开页面跳支付宝;失败/返回再回到 /m/me
    } catch (err) {
      toast.error(toApiError(err).message || '发起支付失败');
      setPayingTier(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{renew ? '续期会员' : '开通会员'}</DialogTitle>
          <DialogDescription>会员享更高 AI 额度与全部高级功能。</DialogDescription>
        </DialogHeader>

        {/* 兑换码开通(就地,不跳转)*/}
        <div className="rounded-12 border border-border p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-14 font-medium text-foreground">
            <Ticket className="size-4 text-brand-green" /> 用兑换码开通会员
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.trim();
              if (c) onRedeem(c);
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="输入会员兑换码"
              className="h-9 flex-1"
            />
            <Button type="submit" size="sm" disabled={!code.trim()}>
              兑换
            </Button>
          </form>
          <p className="mt-2 text-12 text-faint">
            兑换码可来自活动赠送 / 机构发放 / 合作渠道,兑换后立即生效。
          </p>
        </div>

        {/* 支付宝手机网站支付(选套餐直接付)*/}
        <div className="rounded-12 border border-border p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-14 font-medium text-foreground">
            <CreditCard className="size-4 text-muted-foreground" /> 支付宝付款开通
          </div>
          {inWeChat ? (
            <p className="text-12 leading-paragraph text-brand-red">
              检测到你在微信内打开,微信无法调起支付宝。请点右上角「···」→「在浏览器打开」后再付款,或用上方兑换码 / 电脑端开通。
            </p>
          ) : !alipayOn || payPlans.length === 0 ? (
            <p className="text-12 leading-paragraph text-muted-foreground">
              支付暂未开放,请用上方兑换码开通,或在电脑端付款。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* 月付 / 年付 切换(0079)—— 年付带「省 N%」徽标 */}
              {yearlyAvailable && (
                <div className="flex justify-center pb-1">
                  <BillingCycleToggle value={cycle} onChange={setCycle} savingsPct={savingsPct} />
                </div>
              )}
              {payPlans.map((p) => {
                const q = quotes[p.tier]; // 报价未回来前禁用该按钮(避免猜金额)
                const yearly = q?.cycle === 'yearly';
                const upgrade = q?.action === 'upgrade';
                // 档位副标题:升级=「升级 · 补差价」;续期/新购按周期显示年度/会员。
                const kindLabel = upgrade ? '升级补差' : yearly ? '年度会员' : '会员';
                return (
                  <button
                    key={p.tier}
                    type="button"
                    disabled={payingTier !== null || !q}
                    onClick={() => q && handlePay(p.tier, q)}
                    className="flex items-center justify-between rounded-8 border border-border px-3 py-2.5 text-left transition-colors active:bg-surface-2 disabled:opacity-50"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-14 font-medium text-foreground">
                        {p.tier === 'max' ? (
                          <Crown className="size-4 text-brand-red" />
                        ) : (
                          <Gem className="size-4 text-brand-green" />
                        )}
                        {p.tier === 'max' ? 'Max' : 'Pro'} {kindLabel}
                      </span>
                      {upgrade && q && (
                        <span className="text-12 text-faint">剩余 {q.remaining_days} 天补差 · 到期日不变</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="flex flex-col items-end">
                        {q ? (
                          <span className="text-14 font-medium text-foreground">
                            ¥{(q.amount_cents / 100).toFixed(2)}
                            {!upgrade && <span className="text-12 font-normal text-faint">{yearly ? '/年' : '/月'}</span>}
                          </span>
                        ) : (
                          <Loader2 className="size-4 animate-spin text-faint" />
                        )}
                        {q && yearly && !upgrade && (
                          <span className="text-12 text-faint">折合 ¥{(Math.floor((q.amount_cents / 100 / 12) * 10) / 10).toFixed(1)}/月</span>
                        )}
                      </span>
                      {payingTier === p.tier ? (
                        <Loader2 className="size-4 animate-spin text-faint" />
                      ) : (
                        <ChevronRight className="size-4 text-faint" />
                      )}
                    </span>
                  </button>
                );
              })}
              <p className="text-12 text-faint">
                付款将跳转支付宝完成,开通后自动回到本页。
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
