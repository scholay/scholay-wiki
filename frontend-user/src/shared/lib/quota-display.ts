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
  /** 主展示(相对):如「3 天后重置」「满额」「即将重置」「不限额度」。 */
  rel: string;
  /** 副/tooltip(绝对 + 说明):如「7月20日自动恢复满额(7 天周期)」。 */
  hint: string;
  /** 窗口尚未开始计时(满额未使用)。 */
  notStarted: boolean;
}

export function resetInfo(t: QuotaWindowLike): ResetInfo {
  if (t.unlimited) return { rel: '不限额度', hint: '会员不限本项额度', notStarted: false };
  if (!t.window_started_at || !t.window_reset_at) {
    return {
      rel: '满额',
      hint: `额度充满;首次使用起算 ${t.window_days} 天周期,到期自动恢复满额`,
      notStarted: true,
    };
  }
  const ms = Date.parse(t.window_reset_at) - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  const hours = Math.ceil(ms / 3_600_000);
  const rel = ms <= 0 ? '即将重置' : days >= 2 ? `${days} 天后重置` : hours >= 1 ? `${hours} 小时后重置` : '即将重置';
  // hint 显式点明「本周期自 X 起、Y 恢复」——首次使用开锚的窗口若只显重置日会显得随意/像 bug(业界共识,
  // Codex #28246 / Claude Code #52498),把起止都摆出来让规则透明。
  return {
    rel,
    hint: `本周期自 ${monthDay(t.window_started_at)} 起,${monthDay(t.window_reset_at)}自动恢复满额(${t.window_days} 天周期)`,
    notStarted: false,
  };
}

/** 「X月X日 HH:MM」—— 周期重置时刻的短格式(展示用)。
 *  真源在此(shared/lib,零重依赖);QuotaNotifier 再导出仅为兼容旧 import,
 *  额度条/用量弹窗等常载路径必须从这里 import,避免把懒加载的支付/升级弹窗拽进主包。 */
export function formatResetAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
