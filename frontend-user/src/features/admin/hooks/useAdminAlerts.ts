import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { retryDetailQuery } from '@/shared/lib/query-config';
import type { Feedback } from '../api/feedback';
import type { AdminMessage } from '../api/messages';
import type { ThirdPartyAccount } from '../api/third-party';
import type { AlipayConfig, WeChatPayConfig } from '../api/payment';
import type { SystemConfig } from '../api/system-config';

/**
 * 后台告警单一来源 —— sidebar 徽章 + dashboard 今日待办 共用。
 *
 * 设计原则:
 *   - 30s stale time —— admin 不需要实时刷新,但刚发反馈后再看应该能反映
 *   - 同时查多个 endpoint,react-query 各自缓存;任一挂掉不影响其余几项
 *   - **失败如实上报**(见下方 checkFailed / degraded)。早期版本用 try/catch 把失败
 *     吞成"安全值",结果是后端一挂,首屏反而绿油油地宣布一切正常 —— 别改回去。
 */

export interface AdminAlerts {
  /** 待处理的反馈数 */
  pendingFeedback: number;
  /** 草稿消息数 */
  draftMessages: number;
  /** 失败率 > 10% 的三方账号数 */
  unhealthyThirdParty: number;
  /** 是否有激活的支付配置(支付宝 + 微信) */
  hasActiveAlipay: boolean;
  hasActiveWechatPay: boolean;
  /** 维护模式是否开启 */
  maintenanceMode: boolean;
}

const STALE = 30_000; // 30s

/**
 * 这一项算不算「没查到」。
 *
 * 🔴 **403 不算**。这六个检查里有四个(三方账号 / 支付宝 / 微信支付 / 系统配置)挂在后端的
 * `adminOnly`(RequirePermission(config.manage))下,而看板本身只要求 `analytics.view` ——
 * 也就是说 **operations 角色进后台首页,这四个必然 403**。若把 403 也算成降级,
 * 运营账号的首屏会永久挂着「部分状态未能查到」的琥珀横幅,重试按钮点多少次都不可能成功,
 * 「今日无待办」的绿卡还被永久抑制 —— 这正是同一次改造在侧栏里明令避免的「狼来了」。
 *
 * 无权看 ≠ 没查到:前者是这个角色的正常状态,后者才是故障。
 */
function checkFailed(
  q: { isError: boolean; error: unknown },
  label: string
): string | false {
  if (!q.isError) return false;
  if (toApiError(q.error).status === 403) return false;
  return label;
}

export function useAdminAlerts() {
  // 待处理反馈数 —— feedback 后端用 camelCase `pageSize`(gin form tag),不是 page_size
  const pendingFeedback = useQuery({
    queryKey: ['admin', 'alerts', 'pending-feedback'],
    queryFn: async () => {
      const r = await http.get<{ data: { total: number; list: Feedback[] } }>('/admin/feedbacks', {
        params: { status: 'pending', page: 1, pageSize: 1 },
      });
      return r.data.data.total ?? 0;
    },
    staleTime: STALE,
    // 403(该角色无权看)/404 不重试 —— 重试改变不了权限,只是白打两次
    retry: retryDetailQuery,
  });

  // 草稿消息数 —— 同样 list?status=draft 取 total
  const draftMessages = useQuery({
    queryKey: ['admin', 'alerts', 'draft-messages'],
    queryFn: async () => {
      const r = await http.get<{ data: { total: number; list: AdminMessage[] } }>('/admin/messages', {
        params: { status: 'draft', page: 1, page_size: 1 },
      });
      return r.data.data.total ?? 0;
    },
    staleTime: STALE,
    // 403(该角色无权看)/404 不重试 —— 重试改变不了权限,只是白打两次
    retry: retryDetailQuery,
  });

  // 三方账号健康度 —— 后端 list 已经计算了 stats.success_rate,前端按这个判定
  const unhealthyThirdParty = useQuery({
    queryKey: ['admin', 'alerts', 'unhealthy-3p'],
    queryFn: async () => {
      const r = await http.get<{ data: { accounts: ThirdPartyAccount[]; total: number } }>(
        '/admin/third-party-accounts'
      );
      const accounts = r.data.data.accounts ?? [];
      return accounts.filter((a) => {
        const total = a.total_requests ?? 0;
        if (total < 10) return false; // 样本不够不算异常
        // 优先用后端算好的 stats,fallback 到原始 fail_count 计算
        const successRate = a.stats?.success_rate ?? (1 - (a.fail_count ?? 0) / total);
        return successRate < 0.9;
      }).length;
    },
    staleTime: STALE,
    // 403(该角色无权看)/404 不重试 —— 重试改变不了权限,只是白打两次
    retry: retryDetailQuery,
  });

  // 支付配置激活状态 —— 任一商户 is_active 即为有
  const alipay = useQuery({
    queryKey: ['admin', 'alerts', 'alipay-active'],
    queryFn: async () => {
      const r = await http.get<{ data: AlipayConfig[] }>('/admin/payment/alipay/configs');
      return (r.data.data ?? []).some((c) => c.is_active);
    },
    staleTime: STALE,
    // 403(该角色无权看)/404 不重试 —— 重试改变不了权限,只是白打两次
    retry: retryDetailQuery,
  });

  const wechatPay = useQuery({
    queryKey: ['admin', 'alerts', 'wechat-pay-active'],
    queryFn: async () => {
      const r = await http.get<{ data: WeChatPayConfig[] }>('/admin/payment/wechat/configs');
      return (r.data.data ?? []).some((c) => c.is_active);
    },
    staleTime: STALE,
    // 403(该角色无权看)/404 不重试 —— 重试改变不了权限,只是白打两次
    retry: retryDetailQuery,
  });

  // 维护模式 —— 复用 system config(已经被 SystemConfigPage 用了,react-query 缓存共享)
  const system = useQuery({
    queryKey: ['admin', 'config', 'system'],
    queryFn: async () => {
      const r = await http.get<{ data: SystemConfig & { maintenance_mode?: boolean } }>('/admin/system-config');
      return r.data.data;
    },
    staleTime: STALE,
    // 403(该角色无权看)/404 不重试 —— 重试改变不了权限,只是白打两次
    retry: retryDetailQuery,
  });

  const alerts: AdminAlerts = {
    pendingFeedback: pendingFeedback.data ?? 0,
    draftMessages: draftMessages.data ?? 0,
    unhealthyThirdParty: unhealthyThirdParty.data ?? 0,
    hasActiveAlipay: alipay.data ?? true,
    hasActiveWechatPay: wechatPay.data ?? true,
    maintenanceMode: system.data?.maintenance_mode === true,
  };

  const isLoading =
    pendingFeedback.isLoading ||
    draftMessages.isLoading ||
    unhealthyThirdParty.isLoading ||
    alipay.isLoading ||
    wechatPay.isLoading;

  /**
   * 有哪几项**没查到**(而不是"查到了没问题")。
   *
   * 这个区分是这个 hook 的关键:改造前六个 queryFn 全都 try/catch 吞错并回落到"安全值"
   * (反馈/草稿/三方 → 0,支付宝/微信 → `true`,注释写着「接口挂时默认 true,避免误报」),
   * 于是 isError 恒为 false,任何调用方都拿不到"这项没查到"的信号。
   * 后果是后端一挂,首屏绿油油地宣布「今日无待办 —— 所有反馈已处理 · 三方账号健康 ·
   * 支付配置激活中」,侧栏徽章一起静默归零。**监控面板说反话比不说话更糟**。
   *
   * 现在让 queryFn 直接抛(react-query 会保住上一次成功值,短暂抖动不会闪),
   * 下面 alerts 组装处的 `?? 0` / `?? true` 兜底保留 —— 但同时把"降级"如实透出去。
   */
  const failedChecks = [
    checkFailed(pendingFeedback, '待处理反馈'),
    checkFailed(draftMessages, '草稿消息'),
    checkFailed(unhealthyThirdParty, '三方账号健康度'),
    checkFailed(alipay, '支付宝配置'),
    checkFailed(wechatPay, '微信支付配置'),
    checkFailed(system, '系统配置'),
  ].filter((x): x is string => typeof x === 'string');

  /** 有任何一项没查到 —— 调用方必须据此收回"一切正常"的断言 */
  const degraded = failedChecks.length > 0;

  /**
   * 支付通道是否整体不可用 —— 判据是**两个渠道都没启用**。
   * 只接支付宝不接微信是完全正常的经营选择,用 `||` 会让告警永久常亮 = 等于没有告警。
   */
  const noPaymentChannel = !alerts.hasActiveAlipay && !alerts.hasActiveWechatPay;

  /** 任何告警 > 0,sidebar 可以渲染整体红点 */
  const hasAnyAlert =
    alerts.pendingFeedback > 0 ||
    alerts.draftMessages > 0 ||
    alerts.unhealthyThirdParty > 0 ||
    noPaymentChannel ||
    alerts.maintenanceMode;

  const refetchAll = () => {
    void pendingFeedback.refetch();
    void draftMessages.refetch();
    void unhealthyThirdParty.refetch();
    void alipay.refetch();
    void wechatPay.refetch();
    void system.refetch();
  };

  return { alerts, isLoading, hasAnyAlert, noPaymentChannel, degraded, failedChecks, refetchAll };
}
