// 「额度耗尽(quota_exceeded / 6010)」「账单/用量变动」的全前端单一出口 ——
// http / SSE / WS 各协议统一汇入,由 QuotaNotifier 单点消费(弹重置弹窗 / 阈值 toastr)。
// 仿 notifyAuthLost 的 window 事件模式,保持 shared/lib 纯净(不依赖 store / react)。
export const QUOTA_EXCEEDED_EVENT = 'scholay:quota-exceeded';
export const BILLING_CHANGED_EVENT = 'scholay:billing-changed';

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
