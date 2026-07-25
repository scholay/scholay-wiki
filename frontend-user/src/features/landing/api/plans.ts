// 公开套餐(价格/倍率/赠送)+ 订阅下单流程 —— 落地价格页用。对齐 backend billing_handler.PublicPlans。
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
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
  grant_credits: number;
  year_price_cents: number; // 年度实付价(分);<=0 = 该档年付未开放(0079)
  year_original_cents: number; // 年度划线原价(分)
  year_grant_credits: number; // 年度赠送经费总额(按月分 12 批发放)
}
export interface Plans {
  free_daily_tokens: number; // 兼容字段:窗口÷天数的日均口径(P4)
  free_window_tokens: number; // 7 天周期基准额度
  window_days: number;
  reset_cost_credits: number;
  recharge_rate: number;
  min_recharge_cents: number;
  popular_plan: string;
  enabled: boolean;
  test_payment: boolean;
  subscription_year_days: number; // 年度订阅时长(天,默认 365)
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
  const { data } = useQuery({
    queryKey: ['settings', 'billing'],
    queryFn: async () => (await http.get<{ data: { tier: string } }>('/user/billing/overview')).data.data,
    enabled: !!getAuthToken(),
    staleTime: 30_000,
  });
  const t = data?.tier;
  return t === 'pro' || t === 'max' ? t : t === 'free' ? 'free' : undefined;
}

/** 价格页订阅:建单 + 按选定支付方式发起。测试支付→一键履约后进会员页;支付宝→跳收银台;微信→暂未开放。
 *  cycle=yearly 走年度订阅(订单/权益/文案由后端按周期履约)。
 *  返回 true=已完成(关弹窗),false=保持弹窗。登录闸门在调用方(点订阅时)先做。 */
export function useLandingSubscribe() {
  const navigate = useNavigate();
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
        navigate('/settings/membership');
        return true;
      }
      if (method === 'wechat') {
        toast.info('微信支付即将开放,请暂用其他方式');
        return false;
      }
      const pay = await startAlipay.mutateAsync({ order_no: order.order_no, amount: order.final_amount, subject: `${cycleLabel}订阅` });
      window.location.href = pay.payment_url;
      return true;
    } catch (err) {
      toast.error(toApiError(err).message || '发起支付失败');
      return false;
    }
  };
  return { subscribe, busy: sub.isPending || testPay.isPending || startAlipay.isPending };
}
