// 移动端「开通会员」弹层 —— 把原本死胡同的「升级会员」按钮(只弹 toast「去电脑端」)换成可操作的开通入口:
//   ① 兑换码开通(就地,不跳转,唯一不依赖支付网关的方式);
//   ② 支付宝**手机网站支付**(alipay.trade.wap.pay)选套餐 → 下单 → 跳收银台 / 唤起支付宝 App;
//   ③ 微信支付 —— 下单后把 order_no 交回父组件的 WechatPayDialog(手机浏览器走 h5 直跳,
//      微信内走「长按识别二维码」)。
// 微信内置浏览器无法唤起支付宝(行业限制)→ 该环境下**不把支付宝列为可选项**,不给假按钮。
//
// 兑换确认复用 MobileAssetsCard 已有的 RedeemConfirmDialog(本弹层只收码 + onRedeem 交回父组件,
// 父组件关本弹层 + 开确认弹层),避免 Dialog 套 Dialog —— 微信支付走同一套 handoff。
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CreditCard, Crown, Gem, Loader2, Ticket } from 'lucide-react';
import { PayMethodLogo } from '@/shared/components/PayMethodLogo';
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
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { isWeChatBrowser } from '@/shared/lib/device';
import {
  BillingCycleToggle,
  maxYearlySavingsPct,
  planYearlyEnabled,
  resolveDefaultCycle,
  monthlyEquivalentCents,
  yuanText,
  type SubQuote,
} from '@/shared/components';
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
  /** 微信支付:订阅单已建好 → 父组件关本弹层并打开 WechatPayDialog(同 onRedeem 的 handoff 形状)。 */
  onWechatOrder: (orderNo: string, subject: string) => void;
}

export function MobileMembershipDialog({
  open,
  onOpenChange,
  tier,
  onRedeem,
  onWechatOrder,
}: MobileMembershipDialogProps) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [payingTier, setPayingTier] = useState<Tier | null>(null);
  // 🔴 年付优先(2026-08-02 改版):默认周期派生自 plans,不硬编码。
  // null = 用户还没手动选过 → 跟随派生值;数据到位后自动落到年付(任一档开放年付时)。
  const [cyclePick, setCyclePick] = useState<BillingCycle | null>(null);
  // 每个可购档在当前周期下的真实报价(action + 应付金额 + 后端锁定周期),按 tier 缓存。
  const [quotes, setQuotes] = useState<Record<string, SubQuote>>({});
  // 支付方式:null = 用户没手选过 → 跟随下面派生的默认值(可用项里的第一个)。
  const [methodPick, setMethodPick] = useState<'wechat' | 'alipay' | null>(null);
  const plansQ = usePlans();
  const createSub = useCreateSubscription();
  const startAlipay = useStartAlipay();
  const renew = tier === 'max';
  const inWeChat = isWeChatBrowser();

  const alipayOn = plansQ.data?.payment_methods?.alipay ?? false;
  const wechatOn = plansQ.data?.payment_methods?.wechat ?? false;
  // 🔴 微信内**不把支付宝列为可选项**:微信禁止站内拉起支付宝,列出来点了必然失败。
  // 微信支付在微信内反而是可用的(弹窗走「长按识别二维码」)。
  const methodOptions = [
    ...(wechatOn ? (['wechat'] as const) : []),
    ...(alipayOn && !inWeChat ? (['alipay'] as const) : []),
  ];
  const method = methodPick && methodOptions.includes(methodPick) ? methodPick : methodOptions[0];
  // 只展示当前档及以上(不支持降级);升级/续期/新购的真实金额与文案全部由 quote 驱动,
  // 杜绝「按钮标全年价、实际是月度补差 + subject 谎称年度会员」的货不对板(评审 pricing-math)。
  const payPlans = (plansQ.data?.plans ?? [])
    .filter((p) => p.tier !== 'free')
    .filter((p) => RANK[p.tier] >= RANK[tier]);
  // 年付入口(0079):任一档配置了年价才显示切换;单档未开放年付时按钮回落月价。
  const yearlyAvailable = payPlans.some(planYearlyEnabled);
  const savingsPct = maxYearlySavingsPct(plansQ.data?.plans ?? []);
  const cycle = cyclePick ?? resolveDefaultCycle(plansQ.data?.plans ?? []);

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

  // 选套餐 → 下单 →(微信:交回父组件开扫码弹窗 / 支付宝:手机网站支付 channel=wap 跳收银台)。
  // 金额与周期一律取 quote(后端权威):升级=当前周期补差;subject 按 action/周期如实拼,不谎称年度。
  const handlePay = async (planTier: Tier, q: SubQuote) => {
    if (!method) return;
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
      if (method === 'wechat') {
        // Dialog 套 Dialog 会打架 —— 照 onRedeem 的先例把单号交回父组件,由它关本弹层 + 开扫码弹窗。
        onWechatOrder(order.order_no, subject);
        setPayingTier(null);
        return;
      }
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
        <div className="rounded-12 border border-border p-4">
          <div className="mb-2 flex items-center gap-2 text-14 font-medium text-foreground">
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

        {/* 在线付款(选支付方式 + 选套餐直接付)*/}
        <div className="rounded-12 border border-border p-4">
          <div className="mb-2 flex items-center gap-2 text-14 font-medium text-foreground">
            <CreditCard className="size-4 text-muted-foreground" /> 在线付款开通
          </div>
          {!method || payPlans.length === 0 ? (
            <p
              className={cn(
                'text-12 leading-paragraph',
                inWeChat && alipayOn ? 'text-brand-red' : 'text-muted-foreground',
              )}
            >
              {inWeChat && alipayOn
                ? '检测到你在微信内打开,微信无法调起支付宝(本站也还没开通微信支付)。请点右上角「···」→「在浏览器打开」后再付款,或用上方兑换码 / 电脑端开通。'
                : '支付暂未开放,请用上方兑换码开通,或在电脑端付款。'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* 支付方式(两种都开通时才需要选;只有一种时下面的按钮文案已经写明是哪种) */}
              {methodOptions.length > 1 && (
                <div className="flex items-center gap-2">
                  {methodOptions.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethodPick(m)}
                      className={cn(
                        'flex min-h-8 flex-1 items-center justify-center gap-1 rounded-8 border text-12 transition-colors',
                        method === m
                          ? 'border-brand-red bg-danger-soft text-brand-red'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      {/* 品牌 logo 恒定本色,不跟随选中态 —— 见 PayMethodLogo 头注释。 */}
                      <PayMethodLogo method={m} className="size-3.5" />
                      {m === 'wechat' ? '微信支付' : '支付宝'}
                    </button>
                  ))}
                </div>
              )}
              {/* 每档一行定位语 —— 只给认知锚点,倍率动态取后端 multiplier(口径与 membership-plan-card
                  一致:Pro 相对 Free、Max 相对 Pro),完整权益对比链去 /pricing,弹层保持纯购买。 */}
              <div className="flex flex-col gap-1 pb-1">
                {payPlans.map((p) => (
                  <p key={p.tier} className="text-12 text-muted-foreground">
                    <span className="font-medium text-foreground">{p.tier === 'max' ? 'Max' : 'Pro'}</span>
                    {p.tier === 'max'
                      ? ` · 高频科研主力 · ${p.multiplier}× 于 Pro 额度`
                      : ` · 轻量检索与日常写作 · ${p.multiplier}× 于 Free 额度`}
                  </p>
                ))}
              </div>
              {/* 月付 / 年付 切换(0079)—— 年付带「省 N%」徽标 */}
              {yearlyAvailable && (
                <div className="flex justify-center pb-1">
                  <BillingCycleToggle value={cycle} onChange={setCyclePick} savingsPct={savingsPct} />
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
                    className="flex min-h-11 items-center justify-between rounded-8 border border-border px-3 py-2.5 text-left transition-colors active:bg-surface-2 disabled:opacity-50"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 text-14 font-medium text-foreground">
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
                    <span className="flex items-center gap-2">
                      <span className="flex flex-col items-end">
                        {/* 🔴 主数字恒为**月口径**(2026-08-02 改版,与 PC 卡片同口径):
                            年付显示折合月价,年总价降到副行。此前是「主数字 ¥590/年 + 脚注折合」——
                            9 家大厂取样里 0 家这么做,用户要自己除以 12 才能和月付比。
                            折合算法复用 shared 的 monthlyEquivalentCents(整数分 + floor,不虚高),
                            这里原来是一份逐字重复的浮点实现,两侧改口径就会漂移。 */}
                        {q ? (
                          <span className="text-14 font-medium text-foreground">
                            ¥{yuanText(yearly && !upgrade ? monthlyEquivalentCents(q.amount_cents) : q.amount_cents)}
                            {!upgrade && <span className="text-12 font-normal text-faint">/月</span>}
                          </span>
                        ) : (
                          <Loader2 className="size-4 animate-spin text-faint" />
                        )}
                        {q && yearly && !upgrade && (
                          <span className="text-12 text-faint">按年付 ¥{yuanText(q.amount_cents)}</span>
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
              <p className="text-12 leading-paragraph text-faint">
                {method === 'wechat'
                  ? inWeChat
                    ? '将生成微信支付二维码,长按识别即可付款,开通后本页自动更新。'
                    : '将打开微信完成付款,开通后回到本页自动更新。'
                  : '付款将跳转支付宝完成,开通后自动回到本页。'}
              </p>
            </div>
          )}
        </div>

        {/* 完整权益对比在 /pricing(移动 UA 可达:device.ts 无对等映射 = 留在原地的响应式页)。
            先关弹层再跳转,避免 Radix modal 在 open 态跨路由残留 body 锁。 */}
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            navigate('/pricing');
          }}
          className="mx-auto text-12 text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          查看完整权益对比 →
        </button>
      </DialogContent>
    </Dialog>
  );
}
