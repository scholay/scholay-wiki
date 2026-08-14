// 后台通用展示格式化 —— 纯函数、无业务、无依赖。
// 存在的理由:同一段格式化在后台被复制粘贴多份且各自算错(见下面每个函数的注释)。

/**
 * 字节数 → 人类可读。
 *
 * 为什么不继续用 `(size / 1024).toFixed(0) + 'KB'`(审稿监控里曾有两份同样的复制代码):
 *   - 8MB 的稿件 PDF 显示成「8192KB」,要心算才知道大不大;
 *   - 300 字节的 .bib 显示成「0KB」,看起来像空文件 —— 会把排查直接引到
 *     「是不是上传失败了」这条错误的岔路上。
 */
export function formatBytes(n?: number | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** 整数千分位(token 数 / 字数)。空值给占位,**绝不回落成 0** —— 0 和「没有数据」含义相反。 */
export function formatCount(n?: number | null): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('zh-CN');
}

/**
 * 秒 → 「9 分 12 秒」。
 * 审稿是 server-side agent,单个审稿人的 agentDurationSec 常在 300~900s 量级,
 * 裸写 `${sec}s` 时「612s 到底久不久」需要心算。
 */
export function formatDurationSec(sec?: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
  if (sec < 60) return `${Math.round(sec)} 秒`;
  const totalMin = Math.floor(sec / 60);
  const restSec = Math.round(sec % 60);
  if (totalMin < 60) return restSec ? `${totalMin} 分 ${restSec} 秒` : `${totalMin} 分`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

/**
 * 充值汇率取不到时的兜底(0095 起后端默认 100,即「经费 = 分」)。
 * 只作兜底用 —— 真实值是 BillingConfigPage 里一个**可编辑**的旋钮,见 creditsToYuan。
 */
export const FALLBACK_RECHARGE_RATE = 100;

/**
 * 经费 → 人民币。
 *
 * 🔴 **rate 必须传**,不要写死 100。
 * `recharge_rate` 是 BillingConfigPage 上一个可编辑输入框,管理员随时能改。
 * 改造中一度有三处各自硬编码 `credits / 100`(活动管理 / 邀请监控 / 订单),
 * 而「发放经费」的确认弹窗读的是真实 rate —— 汇率一旦被调整,
 * 同一笔经费在四个页面会显示成两个金额,其中一个还出现在**写钱前的最后一道核对**上。
 * 统一从 `useBillingConfig().data?.recharge_rate` 取,取不到用 FALLBACK_RECHARGE_RATE。
 */
export function creditsToYuan(credits?: number | null, rate: number = FALLBACK_RECHARGE_RATE): string {
  if (credits == null || !Number.isFinite(credits)) return '—';
  const r = rate > 0 ? rate : FALLBACK_RECHARGE_RATE;
  return `¥${(credits / r).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 「1,250,000 经费 ≈ ¥12,500.00(100 经费 = ¥1)」—— 任何裸经费数字旁都该挂这个 title */
export function creditsTitle(credits?: number | null, rate: number = FALLBACK_RECHARGE_RATE): string | undefined {
  if (credits == null || !Number.isFinite(credits)) return undefined;
  const r = rate > 0 ? rate : FALLBACK_RECHARGE_RATE;
  return `${credits.toLocaleString('zh-CN')} 经费 ≈ ${creditsToYuan(credits, r)}(${r} 经费 = ¥1)`;
}
