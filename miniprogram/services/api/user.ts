// 用户资料 API。类型契约镜像后端 backend/internal/user(Go struct 为真源)。
// 首期手工复制;后续可把关键响应纳入 tests/contract 的 zod 校验守漂移(见立项报告 六)。
import { request } from '../request'

export interface UserProfile {
  id: number
  username?: string
  email?: string
  phone?: string
  avatar_url?: string
  role?: string
  [key: string]: unknown
}

// GET /api/v1/user/profile(受保护)—— 用来自测「JWT 已通、能调受保护接口」。
export function getProfile(): Promise<UserProfile> {
  return request<UserProfile>({ url: '/user/profile', method: 'GET' })
}

// PUT /api/v1/user/profile —— 改昵称/简介。
export function updateProfile(username: string, bio: string): Promise<UserProfile> {
  return request<UserProfile>({ url: '/user/profile', method: 'PUT', data: { username, bio } })
}

// POST /api/v1/user/change-password —— 后端字段是 current_password(不是 old_password)。
export function changePassword(current: string, next: string): Promise<unknown> {
  return request({ url: '/user/change-password', method: 'POST', data: { current_password: current, new_password: next } })
}

// POST /api/v1/user/wechat/miniprogram/bind-phone —— getPhoneNumber code → 绑定手机号。
export function bindMiniProgramPhone(code: string): Promise<unknown> {
  return request({ url: '/user/wechat/miniprogram/bind-phone', method: 'POST', data: { code } })
}
