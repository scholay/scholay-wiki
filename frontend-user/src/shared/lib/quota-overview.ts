/** 与后端 /user/billing/overview 对齐的全局额度快照。 */
export interface QuotaOverview {
  tier: 'free' | 'pro' | 'max';
  /** 当前计费周期；免费或已过期时后端可能省略。 */
  cycle?: 'monthly' | 'yearly';
  token: {
    used: number;
    ceiling: number;
    percent: number;
    unlimited: boolean;
    window_days: number;
    window_started_at: string | null;
    window_reset_at: string | null;
  };
  credit: {
    perm: number;
    total: number;
    perm_micro: number;
    points: number;
    credit_autopay: boolean;
  };
  reset_passes: number;
  /** 最近一批恢复次数的到期时刻；无可用次数时为 null。 */
  reset_pass_next_expiry?: string | null;
}

/** 与设置页、推广资格查询共享同一份 query cache。 */
export const QUOTA_OVERVIEW_QUERY_KEY = ['settings', 'billing'] as const;
