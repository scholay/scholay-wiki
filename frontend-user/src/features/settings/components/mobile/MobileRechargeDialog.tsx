// 移动端「充值经费」弹层 —— 照 MobileMembershipDialog 的先例:
// 快捷金额 + 自定义金额 → 建充值单(useCreateRecharge)→ 按所选方式付款:
//   · 支付宝:startAlipay(channel='wap')跳收银台 / 唤起支付宝 App,return_url / quit_url 都回 /m/me;
//   · 微信:把 order_no 交回父组件的 WechatPayDialog(手机浏览器 h5 直跳 / 微信内长按识别二维码)。
// 微信内置浏览器无法唤起支付宝(行业限制)→ 该环境下不把支付宝列为可选项,不给假按钮。
import { useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
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
import { normalizeMoneyDraft } from '@/shared/lib/numeric-input';
import { useCreateRecharge, usePlans, useStartAlipay } from '../../api/membership';

/** 快捷金额(元)。到账经费按后端 recharge_rate 动态换算展示(汇率可调,不写死)。 */
const QUICK_YUAN = [20, 50, 100, 500, 1000];

export interface MobileRechargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 微信支付:充值单已建好 → 父组件关本弹层并打开 WechatPayDialog(避免 Dialog 套 Dialog)。 */
  onWechatOrder: (orderNo: string, subject: string) => void;
}

export function MobileRechargeDialog({ open, onOpenChange, onWechatOrder }: MobileRechargeDialogProps) {
  const plansQ = usePlans();
  const recharge = useCreateRecharge();
  const startAlipay = useStartAlipay();
  const [yuan, setYuan] = useState('20');
  const [customSelected, setCustomSelected] = useState(false);
  // 支付方式:null = 用户没手选过 → 跟随派生默认值(可用项里的第一个)。
  const [methodPick, setMethodPick] = useState<'wechat' | 'alipay' | null>(null);
  const inWeChat = isWeChatBrowser();

  const plans = plansQ.data;
  const alipayOn = plans?.payment_methods?.alipay ?? false;
  const wechatOn = plans?.payment_methods?.wechat ?? false;
  // 🔴 微信内不列支付宝:微信禁止站内拉起支付宝,列出来点了必然失败。
  const methodOptions = [
    ...(wechatOn ? (['wechat'] as const) : []),
    ...(alipayOn && !inWeChat ? (['alipay'] as const) : []),
  ];
  const method = methodPick && methodOptions.includes(methodPick) ? methodPick : methodOptions[0];
  const rate = plans?.recharge_rate ?? 100; // 0095:经费=分,¥1 = 100 经费(以后端为准)
  const minCents = plans?.min_recharge_cents ?? 1000;
  const cents = Math.round(Number(yuan) * 100);
  const credits = Number.isFinite(cents) ? Math.floor((cents / 100) * rate) : 0;
  const valid = Number.isFinite(cents) && cents >= minCents;
  const busy = recharge.isPending || startAlipay.isPending;

  // 建单 →(微信:交回父组件开扫码弹窗 / 支付宝:手机网站支付 channel=wap 跳收银台)。
  // 金额一律取后端订单 final_amount(权威),前端从不把金额传给支付网关。
  const handlePay = async () => {
    if (!method) return;
    try {
      const order = await recharge.mutateAsync(cents);
      if (method === 'wechat') {
        onWechatOrder(order.order_no, '科研经费充值');
        return;
      }
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
            按 1 元 = {rate} 经费到账,充多少用多少;开启「用经费继续」后,额度用完还能接着干活。
          </DialogDescription>
        </DialogHeader>

        {!method ? (
          <p
            className={cn(
              'text-12 leading-paragraph',
              inWeChat && alipayOn ? 'text-brand-red' : 'text-muted-foreground',
            )}
          >
            {inWeChat && alipayOn
              ? '检测到你在微信内打开,微信无法调起支付宝(本站也还没开通微信支付)。请点右上角「···」→「在浏览器打开」后再充值,或用经费兑换码在资产卡「兑换码」处激活。'
              : '支付暂未开放。经费兑换码可在资产卡「兑换码」处激活,或在电脑端充值。'}
          </p>
        ) : (
          <>
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

            {/* 快捷金额 */}
            <div className="grid grid-cols-2 gap-2">
              {QUICK_YUAN.map((v) => {
                const active = !customSelected && Number(yuan) === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setCustomSelected(false);
                      setYuan(String(v));
                    }}
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
              <button
                type="button"
                onClick={() => {
                  setCustomSelected(true);
                  setYuan('');
                }}
                className={cn(
                  'flex flex-col gap-1 rounded-8 border p-2.5 text-left transition-colors',
                  customSelected ? 'border-brand-red bg-danger-soft' : 'border-border active:bg-surface-2',
                )}
              >
                <span className={cn('text-14 font-medium', customSelected ? 'text-brand-red' : 'text-foreground')}>
                  自定义金额
                </span>
                <span className="text-12 text-faint">输入充值金额</span>
              </button>
            </div>

            {/* 自定义金额 */}
            {customSelected && (
              <div className={cn(
                'flex items-center gap-2 rounded-8 border bg-surface-1 px-3',
                yuan && !valid ? 'border-brand-red' : 'border-border',
              )}>
                <Coins className="size-4 shrink-0 text-faint" />
                <Input
                  autoFocus
                  value={yuan}
                  onChange={(event) => {
                    const next = normalizeMoneyDraft(event.target.value);
                    if (next !== null) setYuan(next);
                  }}
                  className="h-10 flex-1 border-0 bg-transparent px-0"
                  inputMode="decimal"
                  placeholder={`最低充值 ${minCents / 100} 元`}
                />
                {yuan && !valid && (
                  <span className="shrink-0 text-12 text-brand-red">最低 {minCents / 100} 元</span>
                )}
              </div>
            )}

            <Button
              onClick={handlePay}
              disabled={!valid || busy}
              className="w-full bg-brand-red text-on-brand hover:bg-brand-red/90"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {valid
                ? `${method === 'wechat' ? '微信支付' : '支付宝支付'} ¥${(cents / 100).toFixed(2)} · 到账 ${credits} 经费`
                : '立即充值'}
            </Button>
            <p className="text-12 leading-paragraph text-faint">
              {method === 'wechat'
                ? inWeChat
                  ? '将生成微信支付二维码,长按识别即可付款,到账后本页自动更新。'
                  : '将打开微信完成付款,到账后回到本页自动更新。'
                : '付款将跳转支付宝完成,充值后自动回到本页。'}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
