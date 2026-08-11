// 全局额度弹层宿主(挂在 QuotaNotifierGate 内,懒加载)。
//
// 🔴 2026-08-12:原来的「AI 额度已用完」大弹窗(长文案 + 兑换码输入 + 邀请有礼行 +
//    重置/升级/payg 四个 footer 按钮)已**整体删除**。额度耗尽的提示与恢复动作
//    现在只有两个形态,信息更短、动作更直接:
//      · 对话位(claw / smart-search / prism)→ 输入框上方的 QuotaComposerStrip
//        (按用户状态出单一主按钮 + 额度恢复后自动重发);
//      · 非对话位(矩阵分析 / 翻译 / 审稿等)→ 带状态按钮的耗尽 toast(quota-toast)。
//    兑换码、经费流水等低频路径回到会员页(/settings/membership),不再塞进拦截弹窗。
//
// 本文件保留的是那两个形态**按下按钮后**需要的重弹层,它们与已删弹窗无关、仍是唯一实现:
//   · MembershipActionDialog —— 「升级会员」(PC 就地选套餐 + 支付;移动 UA 走 /m/me?upgrade=1)。
//     ⚠️ 2026-08-12 起用的是**与设置页同一个**弹窗与同一份选项推导
//     (shared/lib/membership-options),不再是那个让用户自由组合「档位 × 周期」的旧
//     SubscribeDialog —— 自由组合会产出后端拒收或与展示价不符的组合(pro 月付选 Max
//     看到年付价、实扣补差价),而合法组合本来就由当前会员状态强约束。
//   · WechatPayDialog —— 上面选微信支付后的扫码弹层
//   · Reset/PaygConfirmDialog —— 非对话场景耗尽 toast 的「立即恢复 / 用经费继续」二次确认
//     (对话位的同名确认由 QuotaComposerStrip 自己挂;两处共用 quota-recovery 的同一实现)
// 二者常驻挂载 + open 受控(Radix 铁律:绝不在 open 时卸载,否则 body pointer 锁泄漏)。
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { notifyQuotaRecovered } from '@/shared/lib/quota-events';
import {
  QUOTA_OVERVIEW_QUERY_KEY,
  type QuotaOverview,
} from '@/shared/lib/quota-overview';
import { useQuotaStore } from '@/stores/quota.store';
import { subscribePayMethods, type SubQuote } from './subscribe-dialog';
import { MembershipActionDialog } from './membership-action-dialog';
import { upgradeOptions } from '@/shared/lib/membership-options';
import { WechatPayDialog } from './wechat-pay-dialog';
import type { BillingCycle, MembershipPlanData } from './membership-plan-card';
import {
  PaygConfirmDialog,
  ResetConfirmDialog,
  usePaygMutation,
  useResetQuotaMutation,
} from './quota-recovery';

// formatResetAt 真源已下沉 shared/lib/quota-display(常载路径不该 import 本重模块);
// 这里 re-export 仅为兼容既有 import(SubmitQuotaHint 等)。
export { formatResetAt } from '@/shared/lib/quota-display';

// mirrors backend /billing/plans(vip/billing_handler.go PublicPlans)的**弹窗消费子集**;
// 全量 interface 在 features/settings/api/membership.ts —— shared 不可反向 import features,
// 故这里手写子集(queryKey 与 usePlans 同键,缓存共享,不多打请求)。
interface PublicPlans {
  popular_plan: string;
  test_payment: boolean;
  payment_methods: { alipay: boolean; wechat: boolean };
  plans: MembershipPlanData[];
}

/** 支付宝收银台回程锚点(跨文件契约:App.tsx 启动时读到则 navigate 回来并清除)。 */
const PAY_RETURN_KEY = 'scholay:pay-return-path';

/** 订阅报价(SubscribeDialog 用;模块级函数 = 稳定引用,防 effect 重跑)。 */
const quoteSubscription = async (tier: 'pro' | 'max', cycle: BillingCycle): Promise<SubQuote> =>
  (await http.get<{ data: SubQuote }>('/user/billing/subscribe/quote', { params: { tier, cycle } })).data.data;

export function QuotaNotifier({ data }: { data: QuotaOverview | undefined }) {
  const qc = useQueryClient();
  const subOpen = useQuotaStore((s) => s.subscribeOpen);
  const openSubscribe = useQuotaStore((s) => s.openSubscribe);
  const closeSubscribe = useQuotaStore((s) => s.closeSubscribe);
  const confirmResetOpen = useQuotaStore((s) => s.confirmResetOpen);
  const closeConfirmReset = useQuotaStore((s) => s.closeConfirmReset);
  const confirmPaygOpen = useQuotaStore((s) => s.confirmPaygOpen);
  const closeConfirmPayg = useQuotaStore((s) => s.closeConfirmPayg);
  const reset = useResetQuotaMutation(closeConfirmReset);
  const payg = usePaygMutation(closeConfirmPayg);

  // 微信支付:订单建好后交给 WechatPayDialog 扫码(null = 关着)。
  const [wechatOrder, setWechatOrder] = useState<{ orderNo: string; subject: string } | null>(null);

  // 套餐(免登录端点)—— 只在升级弹窗需要时才拉;与 features/settings usePlans 同 queryKey 共享缓存。
  const { data: plansData } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () => (await http.get<{ data: PublicPlans }>('/billing/plans')).data.data,
    staleTime: 60_000,
    enabled: subOpen,
  });

  /** 升级支付流(mirrors features/settings useSubscribeFlow;shared 不可反向 import)。 */
  const paySubscribe = async (tier: 'pro' | 'max', method: string, cycle: BillingCycle): Promise<boolean> => {
    const label = tier === 'pro' ? 'Pro' : 'Max';
    const cycleLabel = cycle === 'yearly' ? `${label} 年度会员` : label;
    try {
      const order = (
        await http.post<{ data: { order_no: string; final_amount: number } }>('/user/billing/subscribe', {
          plan: tier,
          cycle,
        })
      ).data.data;
      if (method === 'test') {
        await http.post('/user/billing/test-pay', { order_no: order.order_no });
        toast.success('已升级,额度已恢复');
        notifyQuotaRecovered(); // 有被拦消息时由额度条自动重发
        void qc.invalidateQueries({ queryKey: QUOTA_OVERVIEW_QUERY_KEY });
        closeSubscribe();
        return true;
      }
      if (method === 'wechat') {
        // 订单已建好 —— 把单号交给扫码弹窗(不跳走,扫完即恢复)。
        setWechatOrder({ orderNo: order.order_no, subject: `${cycleLabel}订阅` });
        return true;
      }
      // 支付宝收银台:跳走前记回程锚点(App.tsx 启动读 PAY_RETURN_KEY → navigate 回当前页并清除)。
      try {
        localStorage.setItem(PAY_RETURN_KEY, window.location.pathname + window.location.search);
      } catch {
        /* 隐私模式等写入失败:放弃回程,不阻断支付 */
      }
      const pay = (
        await http.post<{ data: { payment_url: string } }>('/user/payment/alipay/create', {
          order_no: order.order_no,
          amount: order.final_amount,
          subject: `${cycleLabel}订阅`,
        })
      ).data.data;
      window.location.href = pay.payment_url;
      return true;
    } catch (err) {
      toast.error(toApiError(err).message || '没能打开收银台,这一步还没有产生任何扣款,稍后再试即可');
      return false;
    }
  };

  return (
    <>
      {/* 升级会员(PC):套餐/报价/支付都在弹窗内完成。常驻挂载 + open 控制。
          选项集由当前会员状态推导(与设置页同一份真源):free 出四种组合,
          pro 月付出 Max月/Max年,pro 年付只出 Max年,max 无升级可言(弹窗自己显示空态)。 */}
      <MembershipActionDialog
        open={subOpen}
        onOpenChange={(o) => (o ? openSubscribe() : closeSubscribe())}
        mode={(data?.tier ?? 'free') === 'free' ? 'subscribe' : 'upgrade'}
        options={upgradeOptions(data?.tier ?? 'free', data?.cycle, plansData?.plans ?? [])}
        plans={plansData?.plans ?? []}
        popularTier={plansData?.popular_plan}
        quote={quoteSubscription}
        methods={subscribePayMethods(plansData?.payment_methods, plansData?.test_payment ?? false)}
        onPay={paySubscribe}
      />

      {/* 非对话场景(矩阵分析/翻译/审稿)的耗尽 toast 按钮 → 就地确认,不必跳去会员页。 */}
      <ResetConfirmDialog
        open={confirmResetOpen}
        onOpenChange={(o) => !o && closeConfirmReset()}
        passes={data?.reset_passes ?? 0}
        pending={reset.isPending}
        onConfirm={() => reset.mutate()}
        note="恢复后重新操作即可。"
      />
      <PaygConfirmDialog
        open={confirmPaygOpen}
        onOpenChange={(o) => !o && closeConfirmPayg()}
        pending={payg.isPending}
        onConfirm={() => payg.mutate()}
        note="开启后重新操作即可。"
      />

      {/* 微信扫码支付(常驻挂载 + orderNo 控制,同 Radix 铁律)。 */}
      <WechatPayDialog
        orderNo={wechatOrder?.orderNo ?? null}
        subject={wechatOrder?.subject}
        onOpenChange={(o) => !o && setWechatOrder(null)}
        onPaid={() => {
          toast.success('已升级,额度已恢复');
          notifyQuotaRecovered();
          void qc.invalidateQueries({ queryKey: QUOTA_OVERVIEW_QUERY_KEY });
          closeSubscribe();
        }}
      />
    </>
  );
}
