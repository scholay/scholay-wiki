import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
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
 *   - 同时查多个 endpoint,react-query 各自缓存
 *   - 失败不抛错(用 try fallback),避免任何一个接口挂导致整个 dashboard 白
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

export function useAdminAlerts() {
  // 待处理反馈数 —— feedback 后端用 camelCase `pageSize`(gin form tag),不是 page_size
  const pendingFeedback = useQuery({
    queryKey: ['admin', 'alerts', 'pending-feedback'],
    queryFn: async () => {
      try {
        const r = await http.get<{ data: { total: number; list: Feedback[] } }>('/admin/feedbacks', {
          params: { status: 'pending', page: 1, pageSize: 1 },
        });
        return r.data.data.total ?? 0;
      } catch {
        return 0;
      }
    },
    staleTime: STALE,
  });

  // 草稿消息数 —— 同样 list?status=draft 取 total
  const draftMessages = useQuery({
    queryKey: ['admin', 'alerts', 'draft-messages'],
    queryFn: async () => {
      try {
        const r = await http.get<{ data: { total: number; list: AdminMessage[] } }>('/admin/messages', {
          params: { status: 'draft', page: 1, page_size: 1 },
        });
        return r.data.data.total ?? 0;
      } catch {
        return 0;
      }
    },
    staleTime: STALE,
  });

  // 三方账号健康度 —— 后端 list 已经计算了 stats.success_rate,前端按这个判定
  const unhealthyThirdParty = useQuery({
    queryKey: ['admin', 'alerts', 'unhealthy-3p'],
    queryFn: async () => {
      try {
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
      } catch {
        return 0;
      }
    },
    staleTime: STALE,
  });

  // 支付配置激活状态 —— 任一商户 is_active 即为有
  const alipay = useQuery({
    queryKey: ['admin', 'alerts', 'alipay-active'],
    queryFn: async () => {
      try {
        const r = await http.get<{ data: AlipayConfig[] }>('/admin/payment/alipay/configs');
        return (r.data.data ?? []).some((c) => c.is_active);
      } catch {
        return true; // 接口挂时默认 true,避免误报
      }
    },
    staleTime: STALE,
  });

  const wechatPay = useQuery({
    queryKey: ['admin', 'alerts', 'wechat-pay-active'],
    queryFn: async () => {
      try {
        const r = await http.get<{ data: WeChatPayConfig[] }>('/admin/payment/wechat/configs');
        return (r.data.data ?? []).some((c) => c.is_active);
      } catch {
        return true;
      }
    },
    staleTime: STALE,
  });

  // 维护模式 —— 复用 system config(已经被 SystemConfigPage 用了,react-query 缓存共享)
  const system = useQuery({
    queryKey: ['admin', 'config', 'system'],
    queryFn: async () => {
      try {
        const r = await http.get<{ data: SystemConfig & { maintenance_mode?: boolean } }>('/admin/system-config');
        return r.data.data;
      } catch {
        return null;
      }
    },
    staleTime: STALE,
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

  /** 任何告警 > 0,sidebar 可以渲染整体红点 */
  const hasAnyAlert =
    alerts.pendingFeedback > 0 ||
    alerts.draftMessages > 0 ||
    alerts.unhealthyThirdParty > 0 ||
    !alerts.hasActiveAlipay ||
    !alerts.hasActiveWechatPay ||
    alerts.maintenanceMode;

  return { alerts, isLoading, hasAnyAlert };
}
