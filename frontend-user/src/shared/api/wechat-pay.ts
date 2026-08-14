// 微信支付(用户端)—— mirrors backend/internal/payment/wechat_pay_handler.go
//   CreatePayment      POST /user/payment/wechat/create
//   QueryPaymentStatus GET  /user/payment/wechat/status/:orderNo
// 响应 DTO mirrors internal/payment/wechat_pay_service.go WxPrepayResult。
//
// 🔴 为什么真源在 shared/api 而不是 features/settings/api:
// 四条支付路径里有一条(QuotaNotifier「额度耗尽 → 升级会员」)住在 shared/components,
// 而 shared 不能反向 import features。两侧各写一份必然漂移(本仓库的 paySubscribe
// 就是「mirrors useSubscribeFlow」的手抄件,微信分支两边都得改)。
// features/settings/api/membership.ts 对这两个 hook 做同名再导出,settings 侧调用点写法不变。
import { useMutation, useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/** 交易场景。native=PC 扫码 / h5=手机浏览器(非微信内)/ jsapi=微信内(需 openid)。 */
export type WechatPayMode = 'native' | 'h5' | 'jsapi';

/** 下单结果。按 mode 只有对应的一个字段有值。 */
export interface WechatPayCreated {
  mode: WechatPayMode;
  /** native:二维码内容(weixin://wxpay/bizpayurl?...),直接喂给 QRCodeCanvas。 */
  code_url: string;
  /** h5:跳转地址,拿到即 window.location.href 过去。 */
  h5_url: string;
  prepay_id: string;
  invoke_params?: Record<string, string>;
  /** unix **秒**(不是毫秒)—— 二维码/链接失效时刻,倒计时按它算。 */
  expires_at: number;
  order_no: string;
  /** 元(后端订单行的 final_amount,权威金额)。 */
  amount: number;
  timestamp: number;
}

export interface WechatPayStatus {
  order_no: string;
  /** pending | paid | expired */
  status: string;
  paid: boolean;
}

export interface StartWechatArgs {
  order_no: string;
  mode?: WechatPayMode;
  /** 仅 jsapi 场景需要。 */
  openid?: string;
}

/**
 * 建微信支付单。
 *
 * 🔴 请求体**只有** order_no / mode / openid —— **绝不传 amount**。
 * 金额只由服务端订单行决定(后端也会忽略传入值)。历史上前端传 amount 造成过
 * 「任意用户 ¥0.01 支付 ¥269 订单」的漏洞,这条约束是安全边界不是风格偏好。
 */
export function useStartWechat() {
  return useMutation({
    mutationFn: async (args: StartWechatArgs) =>
      (
        await http.post<{ data: WechatPayCreated }>('/user/payment/wechat/create', {
          order_no: args.order_no,
          ...(args.mode ? { mode: args.mode } : {}),
          ...(args.openid ? { openid: args.openid } : {}),
        })
      ).data.data,
  });
}

/**
 * 轮询订单支付状态(扫码后用)。
 *
 * 该端点在本地仍 pending 时会**主动向微信查单,查到已支付就地履约** ——
 * 它既是轮询源,也是「回调丢失」的自愈路径。因此单次可能耗时 1~2s,
 * interval 取 3s:再短只会让查单排队,并不会更早拿到结果。
 * paid 之后 refetchInterval 返回 false 自动停轮询。
 */
export function useWechatPayStatus(orderNo: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['payment', 'wechat', 'status', orderNo],
    enabled: enabled && !!orderNo,
    queryFn: async () =>
      (await http.get<{ data: WechatPayStatus }>(`/user/payment/wechat/status/${orderNo}`)).data.data,
    refetchInterval: (q) => (q.state.data?.paid ? false : 3000),
    // 用户切去微信付款再切回来 —— 立刻查一次,不必等下一个 tick。
    refetchOnWindowFocus: true,
    // 支付状态没有"陈旧仍可用"这回事;换订单号也不该命中上一单的缓存。
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
}
