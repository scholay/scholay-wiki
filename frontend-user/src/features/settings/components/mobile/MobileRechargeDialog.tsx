// 移动端「充值经费」弹层 —— 照 MobileMembershipDialog 的支付宝**手机网站支付**先例:
// 快捷金额 + 自定义金额 → 建充值单(useCreateRecharge)→ startAlipay(channel='wap')跳收银台 / 唤起支付宝 App,
// return_url / quit_url 都回 /m/me(付完 / 中途退出回「我的」,资产卡随 refetch 更新)。
// 微信内置浏览器无法唤起支付宝(行业限制)→ 提示「在浏览器打开」,不给假按钮。
import { useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
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
import { useCreateRecharge, usePlans, useStartAlipay } from '../../api/membership';

/** 快捷金额(元)。到账经费按后端 recharge_rate 动态换算展示(汇率可调,不写死)。 */
const QUICK_YUAN = [20, 50, 100, 200];

export interface MobileRechargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileRechargeDialog({ open, onOpenChange }: MobileRechargeDialogProps) {
  const plansQ = usePlans();
  const recharge = useCreateRecharge();
  const startAlipay = useStartAlipay();
  const [yuan, setYuan] = useState('20');
  const inWeChat = isWeChatBrowser();

  const plans = plansQ.data;
  const alipayOn = plans?.payment_methods?.alipay ?? false;
  const rate = plans?.recharge_rate ?? 100; // 0095:经费=分,¥1 = 100 经费(以后端为准)
  const minCents = plans?.min_recharge_cents ?? 1000;
  const cents = Math.round(Number(yuan) * 100);
  const credits = Number.isFinite(cents) ? Math.floor((cents / 100) * rate) : 0;
  const valid = Number.isFinite(cents) && cents >= minCents;
  const busy = recharge.isPending || startAlipay.isPending;

  // 建单 → 支付宝手机网站支付(channel=wap)→ 离开页面跳收银台;金额取后端订单 final_amount(权威)。
  const handlePay = async () => {
    try {
      const order = await recharge.mutateAsync(cents);
      const back = `${window.location.origin}/m/me`;
      const pay = await startAlipay.mutateAsync({
        order_no: order.order_no,
        amount: order.final_amount,
        subject: '科研经费充值',
        channel: 'wap',
        return_url: back,
        quit_url: back,
      });
      window.location.href = pay.payment_url;
    } catch (err) {
      toast.error(toApiError(err).message || '发起支付失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>充值经费</DialogTitle>
          <DialogDescription>
            按 ¥1 = {rate} 经费到账,经费不过期;可开启「用经费继续」在额度耗尽后按量续用。
          </DialogDescription>
        </DialogHeader>

        {inWeChat ? (
          <p className="text-12 leading-paragraph text-brand-red">
            检测到你在微信内打开,微信无法调起支付宝。请点右上角「···」→「在浏览器打开」后再充值,或用经费兑换码在资产卡「兑换码」处激活。
          </p>
        ) : !alipayOn ? (
          <p className="text-12 leading-paragraph text-muted-foreground">
            支付暂未开放。经费兑换码可在资产卡「兑换码」处激活,或在电脑端充值。
          </p>
        ) : (
          <>
            {/* 快捷金额 */}
            <div className="grid grid-cols-2 gap-2">
              {QUICK_YUAN.map((v) => {
                const active = Number(yuan) === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setYuan(String(v))}
                    className={cn(
                      'flex flex-col gap-1 rounded-8 border p-2.5 text-left transition-colors',
                      active ? 'border-brand-red bg-danger-soft' : 'border-border active:bg-surface-2'
                    )}
                  >
                    <span className={cn('text-14 font-medium', active ? 'text-brand-red' : 'text-foreground')}>
                      ¥{v}
                    </span>
                    <span className="text-12 text-faint">到账 {Math.floor(v * rate)} 经费</span>
                  </button>
                );
              })}
            </div>

            {/* 自定义金额 */}
            <div className="flex items-center gap-2 rounded-8 border border-border bg-surface-1 px-3">
              <Coins className="size-4 shrink-0 text-faint" />
              <Input
                value={yuan}
                onChange={(e) => setYuan(e.target.value.replace(/[^0-9.]/g, ''))}
                className="h-10 flex-1 border-0 bg-transparent px-0"
                inputMode="decimal"
                placeholder="输入其他金额"
              />
              <span className="shrink-0 text-12 text-faint">最低 {minCents / 100} 元</span>
            </div>

            <Button
              onClick={handlePay}
              disabled={!valid || busy}
              className="w-full bg-brand-red text-on-brand hover:bg-brand-red/90"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {valid ? `支付宝支付 ¥${(cents / 100).toFixed(2)} · 到账 ${credits} 经费` : '立即充值'}
            </Button>
            <p className="text-12 text-faint">付款将跳转支付宝完成,充值后自动回到本页。</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
