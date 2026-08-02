// 「额度耗尽(quota_exceeded / 6010)」「额度恢复」「账单/用量变动」的全前端单一出口 ——
// http / SSE / WS 各协议统一汇入,由 QuotaNotifier 单点消费(弹重置弹窗 / 阈值 toastr)。
// 仿 notifyAuthLost 的 window 事件模式,保持 shared/lib 纯净(不依赖 store / react)。
export const QUOTA_EXCEEDED_EVENT = 'scholay:quota-exceeded';
/** 额度重新可用(重置 / 兑换 / 开启用经费继续 / 升级成功)—— 消费方据此解除「额度耗尽」态。 */
export const QUOTA_RECOVERED_EVENT = 'scholay:quota-recovered';
export const BILLING_CHANGED_EVENT = 'scholay:billing-changed';

// ── 额度信号的「单一谓词」(架构报告 Theme 2)──────────────────────────────
// 同一个业务事件「额度耗尽」在三条通道有两种线编码:HTTP/SSE 用数字 6010,WS 用字符串
// 'quota_exceeded'。历史上三处各写一份字面量判断(http.ts / sse-post.ts / useAgentSocket.ts),
// 后端改其一就静默漏判某条通道。这里收口成一个常量对 + 一个谓词,三处都调它。
//
// HTTP 侧 6010 与 backend errcode.AgentQuotaExceeded 对齐(http.ts 的 BizCode.AgentQuotaExceeded
// 即引用本常量,单一真源);WS 字符串与 agent error 帧 code 对齐。本模块是无依赖叶子,故
// http.ts 反过来 import 它不构成环。
export const AGENT_QUOTA_HTTP_CODE = 6010;
export const AGENT_QUOTA_WS_CODE = 'quota_exceeded';

/** 任一协议的载荷,只要其 code 命中「额度耗尽」(数字 6010 或 WS 字符串)即真。 */
export function isQuotaSignal(signal: { code?: number | string | null } | null | undefined): boolean {
  const code = signal?.code;
  return code === AGENT_QUOTA_HTTP_CODE || code === AGENT_QUOTA_WS_CODE;
}

// ── 结构化 6010 载荷(冻结契约,前后端共同遵守)────────────────────────────
// HTTP 6010 信封:{code:6010, message, data:{quota:{reset_at, window_days,
//   credit_balance_positive, credit_autopay}}};WS 错误帧把同名 quota 对象平铺在帧上。
// reset_at 为 RFC3339(无窗口时空串);credit_* 由后端 payAsYouGoOrQuotaError 已读到的
// Balance 顺手带出(零额外查询)。reset_passes **刻意不进载荷**(热路径不查 DB 的既有拍板),
// 弹窗仍从 /user/billing/overview 拿。全字段可选:旧后端不下发 quota 时照常走 overview 兜底。
export interface QuotaPayload {
  reset_at?: string;
  window_days?: number;
  credit_balance_positive?: boolean;
  credit_autopay?: boolean;
}

/** QUOTA_EXCEEDED_EVENT 的 CustomEvent.detail 形状(三协议统一汇入口径)。 */
export interface QuotaExceededDetail {
  message?: string;
  quota?: QuotaPayload;
}

function dispatch(name: string, detail?: unknown) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** AI 额度耗尽(任一协议拿到 6010 / quota_exceeded)→ 弹重置弹窗。 */
export function notifyQuotaExceeded(detail?: QuotaExceededDetail) {
  dispatch(QUOTA_EXCEEDED_EVENT, detail);
}

/** 额度恢复(重置成功 / 兑换成功 / 开启 autopay / 升级成功)→ 广播给全站监听方。 */
export function notifyQuotaRecovered() {
  dispatch(QUOTA_RECOVERED_EVENT);
}

/** 一次 AI 用量结束(message_complete)/ 充值兑换等 → 让额度总览刷新(触发过半/将尽 toastr)。 */
export function notifyBillingChanged() {
  dispatch(BILLING_CHANGED_EVENT);
}

/**
 * 额度弹窗 / 额度 toastr 的 SPA 跳转出口 —— 这两类 UI 挂在 RouterProvider **之外**
 * (providers.tsx / sonner portal),拿不到 useNavigate。经 App.tsx 常挂在 window 上的
 * data router(`__appRouter`,见 App.tsx:14)做客户端导航;桥不在时兜底整页跳转,
 * 保证「点了一定会去」。仅供额度链路使用,别当通用导航 API 扩散。
 */
export function quotaNavigate(to: string) {
  if (typeof window === 'undefined') return;
  const r = (window as { __appRouter?: { navigate: (t: string) => unknown } }).__appRouter;
  if (r && typeof r.navigate === 'function') void r.navigate(to);
  else window.location.assign(to);
}
