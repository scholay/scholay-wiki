// 移动端「开通会员」弹层 —— 把原本死胡同的「升级会员」按钮(只弹 toast「去电脑端」)换成可操作的开通入口:
//   ① 兑换码开通(就地,不跳转,唯一不依赖支付网关的方式);
//   ② 支付宝**手机网站支付**(alipay.trade.wap.pay)选套餐 → 下单 → 跳收银台 / 唤起支付宝 App。
// 微信内置浏览器无法唤起支付宝(行业限制)→ 检测到则提示「在浏览器打开」,不给假按钮。
//
// 兑换确认复用 MobileAssetsCard 已有的 RedeemConfirmDialog(本弹层只收码 + onRedeem 交回父组件,
// 父组件关本弹层 + 开确认弹层),避免 Dialog 套 Dialog。
import { useState } from 'react';
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
import {
  useCreateSubscription,
  usePlans,
  useStartAlipay,
  type Tier,
} from '../../api/membership';

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
  const plansQ = usePlans();
  const createSub = useCreateSubscription();
  const startAlipay = useStartAlipay();
  const renew = tier === 'max';
  const inWeChat = isWeChatBrowser();

  const alipayOn = plansQ.data?.payment_methods?.alipay ?? false;
  const payPlans = (plansQ.data?.plans ?? []).filter((p) => p.tier !== 'free');

  // 选套餐 → 下单 → 发起支付宝**手机网站支付**(channel=wap)→ 跳收银台 / 唤起 App。
  // 付完 / 退出都回 /m/me(billing 在那刷新显示;真正到账由支付宝异步通知履约)。
  const handlePay = async (planTier: Tier) => {
    if (inWeChat) {
      toast.info('请在浏览器中打开本页面后再用支付宝支付');
      return;
    }
    setPayingTier(planTier);
    try {
      const order = await createSub.mutateAsync(planTier);
      const back = `${window.location.origin}/m/me`;
      const pay = await startAlipay.mutateAsync({
        order_no: order.order_no,
        amount: order.final_amount,
        subject: `Scholay ${planTier === 'max' ? 'Max' : 'Pro'} 会员`,
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
          <DialogDescription>会员享更高每日 AI 额度与全部高级功能。</DialogDescription>
        </DialogHeader>

        {/* 兑换码开通(就地,不跳转)*/}
        <div className="rounded-lg border border-border p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
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
          <p className="mt-2 text-2xs text-faint">
            兑换码可来自活动赠送 / 机构发放 / 合作渠道,兑换后立即生效。
          </p>
        </div>

        {/* 支付宝手机网站支付(选套餐直接付)*/}
        <div className="rounded-lg border border-border p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CreditCard className="size-4 text-muted-foreground" /> 支付宝付款开通
          </div>
          {inWeChat ? (
            <p className="text-xs leading-relaxed text-brand-red">
              检测到你在微信内打开,微信无法调起支付宝。请点右上角「···」→「在浏览器打开」后再付款,或用上方兑换码 / 电脑端开通。
            </p>
          ) : !alipayOn || payPlans.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              支付暂未开放,请用上方兑换码开通,或在电脑端付款。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {payPlans.map((p) => (
                <button
                  key={p.tier}
                  type="button"
                  disabled={payingTier !== null}
                  onClick={() => handlePay(p.tier)}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-left transition-colors active:bg-surface-2 disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {p.tier === 'max' ? (
                      <Crown className="size-4 text-brand-red" />
                    ) : (
                      <Gem className="size-4 text-brand-green" />
                    )}
                    {p.tier === 'max' ? 'Max' : 'Pro'} 会员
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-foreground">
                      ¥{(p.price_cents / 100).toFixed(2)}
                    </span>
                    {payingTier === p.tier ? (
                      <Loader2 className="size-4 animate-spin text-faint" />
                    ) : (
                      <ChevronRight className="size-4 text-faint" />
                    )}
                  </span>
                </button>
              ))}
              <p className="text-2xs text-faint">付款将跳转支付宝完成,开通后自动回到本页。</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
