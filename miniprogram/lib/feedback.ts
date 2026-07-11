// 用户面错误文案单一执行点(见体检 A6;呼应 Web 铁律 friendly-error-messages:
// 绝不裸吐原始 err.message、隐藏 5xx 细节、保留 4xx 后端中文业务提示)。
import { ApiError } from '../services/request'

export function errMsg(e: unknown, fallback = '操作失败,请稍后重试'): string {
  if (e instanceof ApiError) {
    if (e.httpStatus >= 500) return fallback // 5xx 后端内部错误 → 不吐细节
    if (e.httpStatus === 0) return e.message || '网络异常' // 传输失败
    return e.message || fallback // 4xx 后端中文提示,可直接展示
  }
  return fallback // 非 ApiError(JS 异常等)一律兜底,不裸吐
}

export function toastError(e: unknown, fallback = '操作失败,请稍后重试'): void {
  wx.showToast({ title: errMsg(e, fallback), icon: 'none' })
}
