// 额度展示辅助 —— 把 7 天窗口的重置信息算成「相对(主) + 绝对(tooltip/副)」两段。
// 业界做法(Claude/ChatGPT/API dashboard/Copilot/Cursor 等):周期额度必须露出**重置时间**,
// 长周期用「剩余天数/日期」、相对为主绝对做提示;窗口未开始(满额未用)= 「满额·用后计时」;不限额度无重置。
// 用户设置卡(AccountAssetsCard / MobileAssetsCard)与后台用户监控(UserDetailDrawer)共用,口径一致。
// 入参用结构化 QuotaWindowLike,不依赖任何 feature 的 DTO(shared 不反向 import features)。

/** 重置窗口所需的最小结构(settings TokenStatus 与 admin UserTokenStatus 均兼容)。 */
export interface QuotaWindowLike {
  unlimited: boolean;
  window_started_at: string | null;
  window_reset_at: string | null;
  window_days: number;
}

export function monthDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export interface ResetInfo {
  /** 主展示(相对):如「3 天后恢复」「满额」「即将恢复」「不限额度」。 */
  rel: string;
  /** 副/tooltip(绝对):如「8月11日起算,8月18日恢复满额」。 */
  hint: string;
  /** 窗口尚未开始计时(满额未使用)。 */
  notStarted: boolean;
  /** Dense UI: remaining days (≥2) or hours; 0 = soon / not started. */
  count: number;
}

// 用词:用户侧一律说「恢复」,不说「重置」——「重置」是内部口径(端点 /billing/reset、
// 字段 reset_passes),规则在变,写进 UI 就会过期。全站额度文案三条铁律见
// shared/components/quota-toast.tsx 头部。函数名保留 resetInfo(纯代码侧,不外露)。
export function resetInfo(t: QuotaWindowLike): ResetInfo {
  if (t.unlimited) {
    return { rel: '不限额度', hint: '会员不限本项额度', notStarted: false, count: 0 };
  }
  if (!t.window_started_at || !t.window_reset_at) {
    return {
      rel: '满额',
      hint: '额度为满额,首次使用后开始计时',
      notStarted: true,
      count: 0,
    };
  }
  const ms = Date.parse(t.window_reset_at) - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  const hours = Math.ceil(ms / 3_600_000);
  const rel =
    ms <= 0
      ? '即将恢复'
      : days >= 2
        ? `${days} 天后恢复`
        : hours >= 1
          ? `${hours} 小时后恢复`
          : '即将恢复';
  const count = ms <= 0 ? 0 : days >= 2 ? days : hours >= 1 ? hours : 0;
  // hint 把起止都摆出来:首次使用开锚的窗口若只显恢复日会显得随意/像 bug(业界共识,
  // Codex #28246 / Claude Code #52498)。这里给的是**日期**(事实),不是周期规则(机制)。
  return {
    rel,
    hint: `${monthDay(t.window_started_at)}起算,${monthDay(t.window_reset_at)}恢复满额`,
    notStarted: false,
    count,
  };
}

/** 「X月X日 HH:MM」—— 额度恢复时刻的短格式(展示用)。
 *  真源在此(shared/lib,零重依赖);QuotaNotifier 再导出仅为兼容旧 import,
 *  额度条/用量弹窗等常载路径必须从这里 import,避免把懒加载的支付/升级弹窗拽进主包。 */
export function formatResetAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
