import { getToken } from '../store/auth'
import { request } from './request'

// 上报只由真实前台进入、页面切换或用户输入事件触发。
// 这里不设心跳/定时器，也不从通用请求层调用，避免挂机、轮询和 WS 重连被误认为活跃。
export const ACTIVITY_REPORT_INTERVAL_MS = 60_000

export interface ActivityGateInput {
  loggedIn: boolean
  inFlight: boolean
  now: number
  lastSuccessAt: number
}

/** 纯函数：只对已登录、无进行中请求且距上次成功足够久的事件放行。 */
export function shouldReportActivity(input: ActivityGateInput): boolean {
  if (!input.loggedIn || input.inFlight) return false
  const elapsed = input.now - input.lastSuccessAt
  // 设备时钟被向后校准时不应长时间压制上报。
  return input.lastSuccessAt === 0 || elapsed < 0 || elapsed >= ACTIVITY_REPORT_INTERVAL_MS
}

let lastSuccessfulToken = ''
let lastSuccessAt = 0
const inFlightTokens = new Set<string>()

/**
 * 静默上报用户真实活动。
 *
 * - 未登录时不发请求。
 * - 同一登录态只在成功后节流 60 秒；失败不记节流，下一个真实事件可重试。
 * - 不返回需要业务层 await 的 Promise，避免影响交互。
 */
export function reportActivity(): void {
  const token = getToken()
  const tokenLastSuccessAt = token === lastSuccessfulToken ? lastSuccessAt : 0
  if (
    !shouldReportActivity({
      loggedIn: !!token,
      inFlight: !!token && inFlightTokens.has(token),
      now: Date.now(),
      lastSuccessAt: tokenLastSuccessAt,
    })
  ) {
    return
  }

  inFlightTokens.add(token)
  void request<unknown>({ url: '/user/activity', method: 'POST', data: {} })
    .then(() => {
      // 只记录当前登录态的成功时间，避免退出/换号时旧请求污染新会话。
      if (getToken() === token) {
        lastSuccessfulToken = token
        lastSuccessAt = Date.now()
      }
    })
    .catch(() => {
      // 活跃上报不打断用户操作；未记录成功时间，下一次真实事件会重试。
    })
    .finally(() => {
      inFlightTokens.delete(token)
    })
}
