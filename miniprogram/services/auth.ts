// 小程序一键登录 —— 主链路:wx.login(拿 code)→ 后端 jscode2session 换 JWT → 落 token/user。
// 后端端点:POST /api/v1/user/wechat/miniprogram/login(见 backend user.MiniProgramLogin)。
// unionid 命中 = 与 PC 扫码同一账号(前提:小程序已绑定到同一微信开放平台账号)。
import { request } from './request'
import { setToken, setUser, getToken } from '../store/auth'

export interface MiniProgramLoginResponse {
  token: string
  user: Record<string, unknown>
  is_new_user: boolean
}

// wx.login 拿临时登录凭证 code(5 分钟有效、一次性)。
function wxLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code)
        else reject(new Error('wx.login 未返回 code'))
      },
      fail: (err) => reject(new Error(err.errMsg || 'wx.login 失败')),
    })
  })
}

// 一键登录:换 code → 调后端 → 存 token/user。
export async function login(): Promise<MiniProgramLoginResponse> {
  const code = await wxLogin()
  const res = await request<MiniProgramLoginResponse>({
    url: '/user/wechat/miniprogram/login',
    method: 'POST',
    data: { code },
    auth: false, // 登录本身不需要旧 token
  })
  setToken(res.token)
  setUser(res.user)
  return res
}

// 确保已登录:已有 token 直接返回,否则静默走一键登录。
export async function ensureLogin(): Promise<void> {
  if (getToken()) return
  await login()
}

// ── 其他登录方式(方便在开发者工具里测,无需真微信环境)────────────────────────
export interface AuthResp {
  token: string
  user: Record<string, unknown>
}

// 邮箱 + 密码登录。POST /user/login。
export async function loginPassword(email: string, password: string): Promise<AuthResp> {
  const res = await request<AuthResp>({ url: '/user/login', method: 'POST', data: { email, password }, auth: false })
  setToken(res.token)
  setUser(res.user)
  return res
}

// 发邮箱验证码(purpose=login;后端把验证码打到 docker logs)。
export function sendEmailCode(email: string): Promise<unknown> {
  return request({ url: '/user/send-code', method: 'POST', data: { email, purpose: 'login' }, auth: false })
}

// 邮箱验证码登录(6 位;账号不存在自动建号直登)。POST /user/login-with-code。
export async function loginWithCode(email: string, code: string): Promise<AuthResp> {
  const res = await request<AuthResp>({
    url: '/user/login-with-code',
    method: 'POST',
    data: { email, code },
    auth: false,
  })
  setToken(res.token)
  setUser(res.user)
  return res
}
