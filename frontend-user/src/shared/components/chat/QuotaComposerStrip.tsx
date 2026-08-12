// 输入框上方的额度条 —— 对话位(claw / smart-search / prism)的额度提示唯一形态。
//
// 两种状态(2026-08-12 交互重做,取代「会话末尾 BlockedTurnCard + 自动弹全局弹窗」):
//   · 预警条:本周期额度 ≥80%,细条 + 「查看用量」;当周期可关闭(去重持久化在 quota.store)。
//   · 耗尽条:feature 报告有「被拦未发送」消息(blocked 注入)。**所有出路都在条内**,
//     不再有「更多选项」外链(原全局大弹窗已删除)。分两区:
//       【上区】有重置次数时才出:[立即恢复](二次确认)—— 唯一零成本、当场生效的路,
//               与付费路分区,免得用户把免费的和要花钱的混在一排里看。
//       【下区】升级/续费,按档位 × 经费状态:
//               free → [升级会员]
//               pro  → [升级 Max] + (有经费未开 → [用经费继续] / 否则 → [充值经费])
//               max  → (有经费未开 → [用经费继续] / 否则 → [充值经费])  ※ 顶档不出升级键
//   · 额度恢复(QUOTA_RECOVERED 事件,或 overview 刷出可用状态,含跨页充值/跨端重置)
//     → **自动重发**被拦的消息,不再要求手动点「重新发送」。
//
// 挂载即向 quota.store 注册(stripCount/blockedStripCount):全局 Gate 据此把
// 阈值 toast 与 6010 全局提示让位给本条,同一信息不双发。
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, Info, RefreshCw, TrendingUp, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { http } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/shared/lib/utils';
import { isPhoneDevice } from '@/shared/lib/device';
import { QUOTA_RECOVERED_EVENT, quotaNavigate } from '@/shared/lib/quota-events';
import { QUOTA_OVERVIEW_QUERY_KEY, type QuotaOverview } from '@/shared/lib/quota-overview';
import { useQuotaStore } from '@/stores/quota.store';
import { UsageDialog } from '../UsageDialog';
import { formatResetAt } from '@/shared/lib/quota-display';
import {
  PaygConfirmDialog,
  ResetConfirmDialog,
  usePaygMutation,
  useResetQuotaMutation,
} from '../quota-recovery';

/**
 * 到顶提示文案 —— 依据大厂 UX writing 调研(2026-08-12)定稿:
 *   ① **主语是「用量」不是用户**:「本周期用量已达上限」而非「你已超出限制」
 *      (Microsoft 错误文案准则 "Do not make the user feel at fault";Ant Design 同款)。
 *   ② **正文只讲恢复时刻**(2026-08-12 产品拍板):给了绝对时间,「等待」才是真实选项,
 *      文案才不只剩逼单一条路;其余信息一律不进条内 ——
 *      「消息已保存 / 未消耗用量 / 届时自动发送」都被砍掉:前两条是用户不会怀疑的默认,
 *      第三条在真的自动发出去时有 toast 兜底(见下方 attempt),不必提前承诺占一行。
 * 图标用中性 Info + 琥珀,不用红色/感叹号:额度到顶是**状态**,不是错误。
 */
const EXHAUSTED_TITLE = '本周期用量已达上限';

export interface QuotaBlockedControls {
  /** 重发被拦的那条(清持久化 → 走 feature 正常发送路径)。 */
  onResend: () => void;
  /** 用户决定不发了(清持久化 + 移除 blocked 轮)。 */
  onDismiss: () => void;
}

/** 「额度重新可用」谓词 —— 与后端闸门(vip CheckDailyQuota → payAsYouGoOrQuotaError)同构:
 *  不限额 / 窗口未满 / 开了用经费继续且有钱,三者任一为真即可发。 */
function quotaAvailable(data: QuotaOverview | undefined): boolean {
  if (!data) return false;
  return (
    data.token.unlimited ||
    data.token.percent < 100 ||
    (data.credit.credit_autopay && data.credit.total > 0)
  );
}

export function QuotaComposerStrip({
  blocked,
  warnEligible = false,
  authed = true,
}: {
  blocked?: QuotaBlockedControls | null;
  /** 预警条(快用完)的准入:仅「已发过至少一轮对话」的输入框为 true ——
   *  新对话 hero / 空会话不出条(2026-08-12 拍板,空态上突兀)。耗尽条不受此门控制
   *  (有被拦消息 = 对话必然已存在)。 */
  warnEligible?: boolean;
  authed?: boolean;
}) {
  const openSubscribe = useQuotaStore((s) => s.openSubscribe);
  const lastExceeded = useQuotaStore((s) => s.lastExceeded);
  const stripWarnDismissDay = useQuotaStore((s) => s.stripWarnDismissDay);
  const dismissStripWarn = useQuotaStore((s) => s.dismissStripWarn);

  const [usageOpen, setUsageOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmPayg, setConfirmPayg] = useState(false);

  const isBlocked = !!blocked;

  // 注册到 store(Gate 据此让位)。blocked 变化 = 先注销旧态再注册新态。
  useEffect(() => {
    const s = useQuotaStore.getState();
    s.registerStrip(isBlocked);
    return () => useQuotaStore.getState().unregisterStrip(isBlocked);
  }, [isBlocked]);

  // 响应式登录态门控(getAuthToken 非响应式,原地弹窗登录后查询不会自动启动)。
  const authToken = useAuthStore((s) => s.token);
  const { data, dataUpdatedAt } = useQuery({
    queryKey: QUOTA_OVERVIEW_QUERY_KEY,
    queryFn: async () =>
      (await http.get<{ data: QuotaOverview }>('/user/billing/overview')).data.data,
    enabled: authed && !!authToken,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    // 耗尽期间轻量轮询:跨页充值 / 跨端重置回来后能自动感知并重发。
    refetchInterval: isBlocked ? 15_000 : false,
  });

  // ── 自动重发:恢复事件 or overview 刷出可用 → 发一次(同一触发源只发一次,防打转) ──
  const resendRef = useRef(blocked?.onResend);
  resendRef.current = blocked?.onResend;
  const handledTokenRef = useRef('');
  useEffect(() => {
    if (!isBlocked) {
      handledTokenRef.current = '';
      return;
    }
    const attempt = (token: string) => {
      if (handledTokenRef.current === token) return;
      handledTokenRef.current = token;
      useQuotaStore.getState().clearExceeded();
      toast.success('额度已恢复,消息已自动发送');
      resendRef.current?.();
    };
    const onRecovered = () => attempt(`evt:${Date.now()}`);
    window.addEventListener(QUOTA_RECOVERED_EVENT, onRecovered);
    // overview 侧:数据更新且谓词为真才触发;token 绑 dataUpdatedAt,同一份数据只试一次。
    if (data && quotaAvailable(data)) attempt(`ov:${dataUpdatedAt}`);
    return () => window.removeEventListener(QUOTA_RECOVERED_EVENT, onRecovered);
  }, [isBlocked, data, dataUpdatedAt]);

  // ── 恢复动作(条上按钮)—— mutation/确认弹窗与「查看用量」共用一份(quota-recovery)。
  // 成功即 notifyQuotaRecovered → 上面的监听接管自动重发。
  const reset = useResetQuotaMutation(() => setConfirmReset(false));
  const payg = usePaygMutation(() => setConfirmPayg(false));

  const goRecharge = () =>
    quotaNavigate(isPhoneDevice() ? '/m/me' : '/settings/membership?tab=recharge');
  const goUpgrade = () => {
    if (isPhoneDevice()) quotaNavigate('/m/me?upgrade=1');
    else openSubscribe();
  };

  // ── 状态判定(结构化 6010 载荷优先,缺则回落 overview;两者语义同源) ──
  const q = lastExceeded?.quota;
  const autopayOn = q?.credit_autopay ?? data?.credit.credit_autopay ?? false;
  const creditPositive = q?.credit_balance_positive ?? (data?.credit.total ?? 0) > 0;
  const tier = data?.tier ?? 'free';
  const passes = data?.reset_passes ?? 0;
  // 有经费且还没开「用经费继续」→ 一键开启即可续跑;否则(没经费 / 开了但余额为 0)只能去充值。
  const canOpenPayg = creditPositive && !autopayOn;
  const resetAtText = formatResetAt(q?.reset_at || data?.token.window_reset_at);

  // ── 预警条显隐:非 blocked、≥80%、当周期未关过 ──
  const warnDay = data?.token.window_started_at ?? '';
  const showWarn =
    !isBlocked &&
    warnEligible &&
    authed &&
    !!data &&
    !data.token.unlimited &&
    data.token.percent >= 80 &&
    quotaAvailable(data) &&
    stripWarnDismissDay !== warnDay;

  if (!isBlocked && !showWarn) return null;

  return (
    <>
      {isBlocked ? (
        <div
          role="status"
          className="mb-2 flex flex-col overflow-hidden rounded-12 border border-brand-amber/30 bg-warning-soft"
        >
          {/* 【上区】立即恢复 —— 仅当账上有重置次数。这是唯一「零成本、当场生效」的路,
              与下面的付费路分区呈现,避免用户在同一排按钮里把「免费的」和「要花钱的」看混。 */}
          {!!data && passes > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-brand-amber/20 px-3 py-2">
              <RefreshCw className="size-3.5 shrink-0 text-brand-amber" />
              <p className="min-w-0 flex-1 text-12 text-foreground">
                重置次数还剩 <b className="font-medium">{passes}</b> 次 · 用 1 次立即恢复满额,不扣经费
              </p>
              <Button size="sm" className="h-7" onClick={() => setConfirmReset(true)}>
                立即恢复
              </Button>
            </div>
          )}

          {/* 【下区】说明 + 升级/续费动作(按档位与经费状态出按钮,全部内置,不再有外链兜底) */}
          <div className="flex flex-col gap-2 px-3 py-2">
            <div className="flex items-start gap-2">
              <Info className="mt-px size-4 shrink-0 text-brand-amber" />
              <div className="min-w-0 flex-1">
                <p className="text-14 font-medium text-foreground">{EXHAUSTED_TITLE}</p>
                <p className="text-12 text-muted-foreground">
                  {resetAtText ? `额度将于 ${resetAtText} 恢复` : '额度恢复后可继续使用'}
                </p>
              </div>
              <button
                type="button"
                aria-label="不发了"
                onClick={() => blocked?.onDismiss()}
                className="shrink-0 rounded-4 p-1 text-faint transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            {/* ⚠️ data 未到之前不出按钮:tier 默认 'free',先渲染会闪一下「升级会员」
                再跳成正确的档位按钮(pro/max 用户看到的第一眼是错的 CTA)。 */}
            <div className={cn('flex flex-wrap items-center gap-2', !data && 'hidden')}>
              {/* 升级路:free → 升级会员;pro → 升级 Max;max 已在顶档,不出升级键。 */}
              {tier !== 'max' && (
                <Button size="sm" className="h-7" onClick={goUpgrade}>
                  <TrendingUp className="size-3.5" />
                  {tier === 'free' ? '升级会员' : '升级 Max'}
                </Button>
              )}
              {/* 按量付费路:有经费只差开关 → 就地开启;没经费 → 去充值。
                  free 档不出这条(先引导升级,避免把免费用户直接推向按量付费的复杂心智)。 */}
              {tier !== 'free' &&
                (canOpenPayg ? (
                  <Button
                    size="sm"
                    variant={tier === 'max' ? 'default' : 'outline'}
                    className="h-7"
                    onClick={() => setConfirmPayg(true)}
                  >
                    <Zap className="size-3.5" />
                    用经费继续
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={tier === 'max' ? 'default' : 'outline'}
                    className="h-7"
                    onClick={goRecharge}
                  >
                    <Coins className="size-3.5" />
                    充值经费
                  </Button>
                ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          role="status"
          className="mb-2 flex items-center gap-2 rounded-12 border border-brand-amber/30 bg-warning-soft px-3 py-2"
        >
          <span className="size-2 shrink-0 rounded-pill bg-brand-amber" />
          <p className="min-w-0 flex-1 truncate text-12 text-foreground">
            即将达到本周期用量上限
            {resetAtText && <span className="text-muted-foreground">,{resetAtText} 自动恢复</span>}
          </p>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setUsageOpen(true)}>
            查看用量
          </Button>
          <button
            type="button"
            aria-label="本周期不再提醒"
            onClick={() => dismissStripWarn(warnDay)}
            className="shrink-0 rounded-4 p-1 text-faint transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <UsageDialog open={usageOpen} onOpenChange={setUsageOpen} />

      <ResetConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        passes={passes}
        pending={reset.isPending}
        onConfirm={() => reset.mutate()}
        note="确认后你的消息会自动重新发送。"
      />
      <PaygConfirmDialog
        open={confirmPayg}
        onOpenChange={setConfirmPayg}
        pending={payg.isPending}
        onConfirm={() => payg.mutate()}
        note="开启后你的消息会自动重新发送。"
      />
    </>
  );
}
