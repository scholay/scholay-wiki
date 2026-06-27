// 「额度耗尽(quota_exceeded / 6010)」「账单/用量变动」的全前端单一出口 ——
// http / SSE / WS 各协议统一汇入,由 QuotaNotifier 单点消费(弹重置弹窗 / 阈值 toastr)。
// 仿 notifyAuthLost 的 window 事件模式,保持 shared/lib 纯净(不依赖 store / react)。
export const QUOTA_EXCEEDED_EVENT = 'scholay:quota-exceeded';
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

function dispatch(name: string, detail?: unknown) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** AI 额度耗尽(任一协议拿到 6010 / quota_exceeded)→ 弹重置弹窗。 */
export function notifyQuotaExceeded(detail?: { message?: string }) {
  dispatch(QUOTA_EXCEEDED_EVENT, detail);
}

/** 一次 AI 用量结束(message_complete)/ 充值兑换等 → 让额度总览刷新(触发过半/将尽 toastr)。 */
export function notifyBillingChanged() {
  dispatch(BILLING_CHANGED_EVENT);
}
