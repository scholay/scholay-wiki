// 公开套餐(价格/倍率/赠送)+ 订阅下单流程 —— 落地价格页用。对齐 backend billing_handler.PublicPlans。
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { notifyBillingChanged } from '@/shared/lib/quota-events';
import { type SubQuote, type BillingCycle } from '@/shared/components';

/** 订阅/续期/升级报价(不建单)。模块级函数=稳定引用,供购买弹窗。 */
export async function quoteSubscription(tier: 'pro' | 'max', cycle: BillingCycle): Promise<SubQuote> {
  return (await http.get<{ data: SubQuote }>('/user/billing/subscribe/quote', { params: { tier, cycle } })).data.data;
}

export interface PlanCard {
  tier: 'free' | 'pro' | 'max';
  price_cents: number;
  original_cents: number;
  multiplier: number;
  // 0090:订阅不再赠送经费,grant_credits / year_grant_credits 已从后端 PublicPlans 移除。
  year_price_cents: number; // 年度实付价(分);<=0 = 该档年付未开放(0079)
  year_original_cents: number; // 年度划线原价(分)
}
export interface Plans {
  // free_window_tokens / free_daily_tokens 已从这个**免登录**端点移除:基数 × multiplier
  // = 三档的绝对额度上限,任何访客都能算出来(见 backend billing_handler.go PublicPlans)。
  // 用户侧本来就零渲染,只有这两行 interface 声明存在过。要看基数去 /admin/billing/config。
  window_days: number;
  // reset_cost_credits 已从后端移除:0090 起重置扣「重置次数」不扣经费。
  recharge_rate: number;
  /** 1 经费可兑换的算力点(0094)。¥1 = recharge_rate × credit_to_points 算力点。 */
  credit_to_points: number;
  min_recharge_cents: number;
  popular_plan: string;
  enabled: boolean;
  test_payment: boolean;
  payment_methods: { alipay: boolean; wechat: boolean }; // admin 配置里启用的支付渠道
  plans: PlanCard[];
}

export function usePublicPlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () => (await http.get<{ data: Plans }>('/billing/plans')).data.data,
    staleTime: 60_000,
  });
}

/** 当前用户生效会员档(已登录才查;复用 ['settings','billing'] 总览缓存,返回完整对象保持一致)。 */
export function useCurrentTier(): 'free' | 'pro' | 'max' | undefined {
  return useCurrentMembership().tier;
}

/** 当前会员档 + 计费周期。周期用于把购买弹窗里的「续期」在跨周期时说成「转为年付」——
 *  月付会员选年付时,后端 renew 分支会把 vip_cycle 一并改写,CTA 得如实反映这件事。 */
export function useCurrentMembership(): { tier?: 'free' | 'pro' | 'max'; cycle?: 'monthly' | 'yearly' } {
  const { data } = useQuery({
    queryKey: ['settings', 'billing'],
    queryFn: async () =>
      (await http.get<{ data: { tier: string; cycle?: string } }>('/user/billing/overview')).data.data,
    enabled: !!getAuthToken(),
    staleTime: 30_000,
  });
  const t = data?.tier;
  const c = data?.cycle;
  return {
    tier: t === 'pro' || t === 'max' ? t : t === 'free' ? 'free' : undefined,
    cycle: c === 'yearly' || c === 'monthly' ? c : undefined,
  };
}

/** 价格页订阅:建单 + 按选定支付方式发起。测试支付→一键履约后进会员页;支付宝→跳收银台;
 *  微信→关弹窗、把已建订单交给 wechatOrder(调用方渲染 `<WechatPayDialog>` 扫码)。
 *  cycle=yearly 走年度订阅(订单/权益/文案由后端按周期履约)。
 *  返回 true=已完成(关弹窗),false=保持弹窗。登录闸门在调用方(点订阅时)先做。
 *
 *  ⚠️ 调用方**必须**接上 wechatOrder / closeWechat / onWechatPaid,否则微信分支会留下
 *  pending 孤儿订单(改造前的 bug 就是先建单再 toast「即将开放」)。 */
export function useLandingSubscribe() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [wechatOrder, setWechatOrder] = useState<{ orderNo: string; subject: string; label: string } | null>(null);
  const sub = useMutation({
    mutationFn: async (vars: { plan: 'pro' | 'max'; cycle: BillingCycle }) =>
      (await http.post<{ data: { order_no: string; final_amount: number } }>('/user/billing/subscribe', vars)).data.data,
  });
  const testPay = useMutation({ mutationFn: async (orderNo: string) => (await http.post('/user/billing/test-pay', { order_no: orderNo })).data });
  const startAlipay = useMutation({
    mutationFn: async (a: { order_no: string; amount: number; subject: string }) =>
      (await http.post<{ data: { payment_url: string } }>('/user/payment/alipay/create', a)).data.data,
  });

  const subscribe = async (plan: 'pro' | 'max', method: string, cycle: BillingCycle, label: string): Promise<boolean> => {
    if (!getAuthToken()) {
      navigate('/?login=required');
      return false;
    }
    const cycleLabel = cycle === 'yearly' ? `${label} 年度会员` : label;
    try {
      const order = await sub.mutateAsync({ plan, cycle });
      if (method === 'test') {
        await testPay.mutateAsync(order.order_no);
        toast.success(`测试支付成功!${cycleLabel}已开通`);
        notifyBillingChanged(); // 广播刷新额度/经费(账户资产卡 + 全局通知器,同 settings 侧 useSubscribeFlow)
        navigate('/settings/membership');
        return true;
      }
      if (method === 'wechat') {
        // 订单已建好 —— 交给扫码弹窗,不能在这里丢下它。
        setWechatOrder({ orderNo: order.order_no, subject: `${cycleLabel}订阅`, label: cycleLabel });
        return true;
      }
      const pay = await startAlipay.mutateAsync({ order_no: order.order_no, amount: order.final_amount, subject: `${cycleLabel}订阅` });
      window.location.href = pay.payment_url;
      return true;
    } catch (err) {
      toast.error(toApiError(err).message || '发起支付失败');
      return false;
    }
  };
  return {
    subscribe,
    busy: sub.isPending || testPay.isPending || startAlipay.isPending,
    wechatOrder,
    closeWechat: () => setWechatOrder(null),
    /** 微信支付成功 —— 与本页 test 分支同一套副作用(成功 toast + 广播 + 进会员页)。 */
    onWechatPaid: () => {
      toast.success(`支付成功!${wechatOrder?.label ?? '会员'}已开通`);
      notifyBillingChanged();
      qc.invalidateQueries({ queryKey: ['settings', 'billing'] });
      navigate('/settings/membership');
    },
  };
}
