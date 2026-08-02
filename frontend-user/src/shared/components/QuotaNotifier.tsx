// 全局额度通知器(挂在 providers)——
//  · 任一协议拿到 6010/quota_exceeded → 弹「额度已耗尽」弹窗,四条恢复路:
//    ① 重置次数一键重置 ② 兑换码就地开通 ③ payg「用经费继续」(就地开 autopay / 引导充值)
//    ④ 升级会员(PC 就地弹 SubscribeDialog;移动去 /m/me?upgrade=1)
//  · 弹窗要素行由**结构化 6010 载荷**驱动(quota-events.QuotaPayload,缺载荷回落 overview)
//  · 关闭后 60s 冷却:同类 6010 只轻 toast 不重弹(冷却态在 quota.store)
//  · 每次 AI 用量结束(billing-changed)→ 刷新额度,过半/将尽时弹 toastr(每级每周期一次,已持久化)
//  · 四条恢复路成功时统一广播 QUOTA_RECOVERED_EVENT(本组件自身监听并 invalidate overview)
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Loader2, RefreshCw, Ticket, Zap } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/shared/ui/dialog';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { localDateKey } from '@/shared/lib/daily-trend';
import { isPhoneDevice } from '@/shared/lib/device';
import {
  QUOTA_EXCEEDED_EVENT,
  QUOTA_RECOVERED_EVENT,
  BILLING_CHANGED_EVENT,
  notifyQuotaRecovered,
  quotaNavigate,
  type QuotaExceededDetail,
  type QuotaPayload,
} from '@/shared/lib/quota-events';
import { useQuotaStore, QUOTA_DIALOG_SNOOZE_MS } from '@/stores/quota.store';
import { SubscribeDialog, subscribePayMethods, type SubQuote } from './subscribe-dialog';
import type { BillingCycle, MembershipPlanData } from './membership-plan-card';
import { showQuotaToast } from './quota-toast';

interface Overview {
  tier: 'free' | 'pro' | 'max';
  token: {
    used: number;
    ceiling: number;
    percent: number;
    unlimited: boolean;
    window_days: number; // P4:7 天周期
    window_started_at: string | null; // null = 未开窗
    window_reset_at: string | null; // 窗口自动重置时刻
  };
  credit: { perm: number; total: number; perm_micro: number; points: number; credit_autopay: boolean };
  reset_passes: number;
}

// mirrors backend /billing/plans(vip/billing_handler.go PublicPlans)的**弹窗消费子集**;
// 全量 interface 在 features/settings/api/membership.ts —— shared 不可反向 import features,
// 故这里手写子集(queryKey 与 usePlans 同键,缓存共享,不多打请求)。
interface PublicPlans {
  popular_plan: string;
  test_payment: boolean;
  payment_methods: { alipay: boolean; wechat: boolean };
  plans: MembershipPlanData[];
  /** 邀请奖励活动(0100):>0=活动开启,描述区渲染「邀请好友赚经费」次选路。 */
  invite_reward_credits: number;
}

/** 支付宝收银台回程锚点(跨文件契约:App.tsx 启动时读到则 navigate 回来并清除)。 */
const PAY_RETURN_KEY = 'scholay:pay-return-path';

/** 「X月X日 HH:MM」—— 周期重置时刻的短格式(展示用)。 */
export function formatResetAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const KEY = ['settings', 'billing'];

/** 订阅报价(SubscribeDialog 用;模块级函数 = 稳定引用,防 effect 重跑)。 */
const quoteSubscription = async (tier: 'pro' | 'max', cycle: BillingCycle): Promise<SubQuote> =>
  (await http.get<{ data: SubQuote }>('/user/billing/subscribe/quote', { params: { tier, cycle } })).data.data;

export function QuotaNotifier() {
  const qc = useQueryClient();
  const resetOpen = useQuotaStore((s) => s.resetOpen);
  const openReset = useQuotaStore((s) => s.openReset);
  const closeReset = useQuotaStore((s) => s.closeReset);

  const [code, setCode] = useState('');
  // 后端随 6010/quota_exceeded 下发的说明文案 —— 作为**正文**展示(时刻要素行由结构化载荷
  // 单独渲染,见下;不再依赖 message 里嵌的时间,避免两行重复)。新事件覆盖旧值。
  const [exceededMsg, setExceededMsg] = useState('');
  // 结构化 6010 载荷(冻结契约):reset_at / window_days / credit_balance_positive / credit_autopay。
  // null = 本次事件未带载荷(旧后端)→ 一律回落 overview 数据。
  const [payloadQuota, setPayloadQuota] = useState<QuotaPayload | null>(null);
  // 升级会员就地化:PC 在本组件内直接挂 SubscribeDialog(移动 UA 走 /m/me?upgrade=1)。
  const [subOpen, setSubOpen] = useState(false);

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await http.get<{ data: Overview }>('/user/billing/overview')).data.data,
    enabled: !!getAuthToken(),
    staleTime: 15_000,
    // 跨设备:在别的设备充了会员/重置后,回到本设备(标签页重新聚焦)立即重新核对额度/等级,
    // 让额度显示及时跟上(发送本身走后端真源不受影响,这里修的是「显示滞后」)。
    refetchOnWindowFocus: true,
  });

  // 套餐(免登录端点)—— 只在弹窗需要时才拉;与 features/settings usePlans 同 queryKey 共享缓存。
  const { data: plansData } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () => (await http.get<{ data: PublicPlans }>('/billing/plans')).data.data,
    staleTime: 60_000,
    enabled: resetOpen || subOpen,
  });

  // 6010 / quota_exceeded → 更新载荷 + 按弹窗状态分流;billing-changed / quota-recovered → 刷新额度
  useEffect(() => {
    const onExceeded = (e: Event) => {
      const detail = (e as CustomEvent<QuotaExceededDetail | undefined>).detail;
      setExceededMsg(detail?.message ?? '');
      setPayloadQuota(detail?.quota ?? null);
      qc.invalidateQueries({ queryKey: KEY });
      const s = useQuotaStore.getState();
      if (s.resetOpen) return; // 已开着:只更新载荷,不动弹窗(别打断用户正在看的内容)
      if (Date.now() - s.dismissedAt < QUOTA_DIALOG_SNOOZE_MS) {
        // 刚关掉 60s 内的同类事件:轻 toast 提示,不重弹弹窗(冷却态在 quota.store.dismissedAt)。
        showQuotaToast('exhausted');
        return;
      }
      openReset();
    };
    const onRefresh = () => qc.invalidateQueries({ queryKey: KEY });
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onExceeded);
    window.addEventListener(BILLING_CHANGED_EVENT, onRefresh);
    window.addEventListener(QUOTA_RECOVERED_EVENT, onRefresh);
    return () => {
      window.removeEventListener(QUOTA_EXCEEDED_EVENT, onExceeded);
      window.removeEventListener(BILLING_CHANGED_EVENT, onRefresh);
      window.removeEventListener(QUOTA_RECOVERED_EVENT, onRefresh);
    };
  }, [openReset, qc]);

  // 弹窗关闭 → 清空本次事件的文案与载荷(修「旧文案在下一次弹出时复现」)。
  useEffect(() => {
    if (!resetOpen) {
      setExceededMsg('');
      setPayloadQuota(null);
    }
  }, [resetOpen]);

  // 阈值 toastr:过半(>=50%)/ 将尽(>=80%),每级每**周期**只弹一次(P4:锚定 7 天窗口,
  // 去重 key 用 window_started_at —— 换窗即重置;未开窗兜底当日 key。warnDay/warnLevel 已持久化)。
  useEffect(() => {
    // P5:用户端不下发额度绝对值(ceiling 被抹为 0),只按 unlimited + percent 判定(百分比是真值)。
    if (!data || data.token.unlimited) return;
    const day = data.token.window_started_at ?? localDateKey();
    const s = useQuotaStore.getState();
    const level = s.warnDay === day ? s.warnLevel : 0;
    const pct = data.token.percent;
    if (pct >= 80 && level < 2) {
      showQuotaToast('almost');
      s.markWarn(day, 2);
    } else if (pct >= 50 && level < 1) {
      showQuotaToast('half');
      s.markWarn(day, 1);
    }
  }, [data]);

  const reset = useMutation({
    mutationFn: async () => (await http.post('/user/billing/reset')).data,
    onSuccess: () => {
      showQuotaToast('reset');
      notifyQuotaRecovered();
      qc.invalidateQueries({ queryKey: KEY });
      closeReset();
    },
    onError: (err) => toast.error(toApiError(err).message || '重置失败'),
  });

  // 兑换码就地开通 —— 兑换成功 = tier/经费即时到账,用户可直接回对话「重新发送」。inline 调 http,
  // 不 import features/settings(shared 不可反向依赖 features)。
  const redeem = useMutation({
    mutationFn: async (c: string) => (await http.post('/user/redeem-code', { code: c })).data,
    onSuccess: () => {
      toast.success('兑换成功,已到账');
      setCode('');
      notifyQuotaRecovered();
      qc.invalidateQueries({ queryKey: KEY });
      closeReset();
    },
    onError: (err) => toast.error(toApiError(err).message || '兑换失败,请检查兑换码'),
  });

  // payg 第三条路:就地开启「用经费继续」(PUT /user/billing/autopay,与 features/settings
  // useSetCreditAutopay 同端点;shared 不可 import features 故 inline)。开启即恢复可用。
  const autopay = useMutation({
    mutationFn: async () => (await http.put('/user/billing/autopay', { enabled: true })).data,
    onSuccess: () => {
      toast.success('已开启,重新发送即可继续');
      notifyQuotaRecovered();
      qc.invalidateQueries({ queryKey: KEY });
      closeReset();
    },
    onError: (err) => toast.error(toApiError(err).message || '开启失败,请稍后重试'),
  });

  // 升级就地化的支付流(mirrors features/settings useSubscribeFlow;shared 不可反向 import)。
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
        toast.success('已升级,可重新发送');
        notifyQuotaRecovered();
        qc.invalidateQueries({ queryKey: KEY });
        closeReset();
        return true;
      }
      if (method === 'wechat') {
        toast.info('微信支付即将开放,请暂用其他方式');
        return false;
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
      toast.error(toApiError(err).message || '发起支付失败');
      return false;
    }
  };

  const onUpgrade = () => {
    if (isPhoneDevice()) {
      // 移动 UA:升级面板由移动端承接(?upgrade=1 深链,移动代理实现)。
      closeReset();
      quotaNavigate('/m/me?upgrade=1');
      return;
    }
    setSubOpen(true);
    closeReset();
  };

  const goRecharge = () => {
    closeReset();
    // 充值深链(?tab=recharge 由 settings 侧代理承接);移动无对等页 → /m/me。
    quotaNavigate(isPhoneDevice() ? '/m/me' : '/settings/membership?tab=recharge');
  };

  // ⚠️ 绝不 `return null`:resetOpen===true 时卸载 Dialog 会让 Radix body 锁泄漏(全站点击失灵,
  // 见 BodyPointerLockGuard)。改为把 data 闸折进 open prop + 内容用 data 守卫,让 Radix 正常收尾。
  // 0090:重置入口按**重置次数**判,不是经费余额(见 account-assets-card 同款注释)。
  const enough = !!data && data.reset_passes > 0;
  // payg 分支的单一数据源:结构化载荷优先(后端 payAsYouGoOrQuotaError 顺手带出,零额外查询),
  // 缺载荷(旧后端)回落 overview —— 两者语义同源(vip Balance)。
  const autopayOn = payloadQuota?.credit_autopay ?? data?.credit.credit_autopay ?? false;
  const creditPositive = payloadQuota?.credit_balance_positive ?? (data?.credit.total ?? 0) > 0;
  const windowDays = payloadQuota?.window_days || data?.token.window_days || 7;
  // 时刻要素行的**唯一**渲染源(reset_at 空串 = 无窗口 → 回落 overview;仍无则不渲染该句)。
  const resetAtText = formatResetAt(payloadQuota?.reset_at || data?.token.window_reset_at);

  return (
    <>
    <Dialog open={resetOpen && !!data} onOpenChange={(o) => (o ? openReset() : closeReset())}>
      {data && (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>本周期 AI 额度已用完</DialogTitle>
          <DialogDescription>
            {/* 后端 message 作正文首段(DialogDescription 是 <p>,内层只能用 block span 不能用 div)。 */}
            {exceededMsg && <span className="mb-1 block font-medium text-foreground">{exceededMsg}</span>}
            额度按 {windowDays} 天周期计算
            {resetAtText && (
              <>,将于 <b className="text-foreground">{resetAtText}</b> 自动重置满额</>
            )}
            。
            {enough ? (
              <>可使用 <b className="text-foreground">1 次</b>重置次数立即重置(剩余 {data.reset_passes} 次),或升级会员获更高额度。</>
            ) : (
              <>升级会员可获更高额度;有兑换码也可在下方立即开通。</>
            )}
            {/* payg 引导行(按 载荷/overview 分支;按钮在 footer,这里只讲清路径) */}
            {!autopayOn && creditPositive && (
              <span className="mt-1 block">你有可用经费:开启「用经费继续」后按量续用,不中断当前工作。</span>
            )}
            {!autopayOn && !creditPositive && (
              <span className="mt-1 block">也可开启「用经费继续」,充值后按量续用不中断。</span>
            )}
            {autopayOn && !creditPositive && (
              <span className="mt-1 block">已开启「用经费继续」,但经费余额不足 —— 充值后即可无缝续用。</span>
            )}
            {/* 邀请奖励次选路(0100)。🔴 铁律:业界(Gamma/Dropbox)把邀请与升级**并列为次选项**,
                绝不做限额弹窗的主 CTA —— 这里只是一条文字链,主按钮仍是 重置/升级/payg。 */}
            {(plansData?.invite_reward_credits ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => {
                  closeReset();
                  quotaNavigate(isPhoneDevice() ? '/m/me/invite' : '/settings/invite');
                }}
                className="mt-1 block text-left text-brand-red hover:underline"
              >
                也可邀请好友注册:每成功 1 位得 {plansData?.invite_reward_credits} 经费 →
              </button>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* 兑换码就地开通(不跳转、不离开当前页)——开完即可回对话一键重发未发送的消息。 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim();
            if (c && !redeem.isPending) redeem.mutate(c);
          }}
          className="flex items-center gap-2"
        >
          <Ticket className="size-4 shrink-0 text-faint" />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="输入兑换码立即开通"
            className="h-9 flex-1"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!code.trim() || redeem.isPending}>
            {redeem.isPending ? <Loader2 className="size-3.5 animate-spin" /> : '兑换'}
          </Button>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">稍后再说</Button>
          </DialogClose>
          <Button variant="outline" size="sm" onClick={onUpgrade}>
            升级会员
          </Button>
          {/* payg 第三条路(0094):有经费未开 → 就地开启;开了没钱 → 去充值;
              没钱没开 → 弱化的充值引导。有重置次数时重置仍是主按钮,payg 退居 outline。 */}
          {!autopayOn && creditPositive && (
            <Button
              size="sm"
              variant={enough ? 'outline' : 'default'}
              onClick={() => autopay.mutate()}
              disabled={autopay.isPending}
            >
              {autopay.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              开启用经费继续
            </Button>
          )}
          {autopayOn && !creditPositive && (
            <Button size="sm" variant={enough ? 'outline' : 'default'} onClick={goRecharge}>
              <Coins className="size-3.5" />
              充值经费
            </Button>
          )}
          {!autopayOn && !creditPositive && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={goRecharge}>
              去充值开启
            </Button>
          )}
          {enough ? (
            <Button size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
              {reset.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              使用 1 次重置
            </Button>
          ) : null /* 0090:次数用完时不给「购入经费换重置」—— 经费买不到重置,那是条死路 */}
        </DialogFooter>
      </DialogContent>
      )}
    </Dialog>

    {/* 升级会员就地化(PC):不再整页跳 /pricing,套餐/报价/支付都在弹窗内完成。
        常驻挂载 + open 控制(Radix 铁律:绝不在 open 时卸载)。 */}
    <SubscribeDialog
      open={subOpen}
      onOpenChange={setSubOpen}
      plans={plansData?.plans ?? []}
      popularTier={plansData?.popular_plan}
      currentTier={data?.tier}
      quote={quoteSubscription}
      methods={subscribePayMethods(plansData?.payment_methods, plansData?.test_payment ?? false)}
      onPay={paySubscribe}
    />
    </>
  );
}
