// 网络层 —— 对标 Web 端 frontend-user/src/shared/api/http.ts。
// wx.request 封装:baseURL + Bearer 注入 + 业务码(BizCode)解封 + 鉴权失效清 token。
//
// 后端响应统一信封(见 backend/internal/common/utils/response.go):
//   成功:HTTP 200 + { code: 0, message: "success", data: <T> }
//   失败:HTTP 4xx/5xx + { code: <bizcode>, message: <中文> }
import { BASE_URL, API_PREFIX } from '../config/env'
import { getToken, clearToken } from '../store/auth'

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

// 注:微信 wx.request 不支持 PATCH(平台限制,其 method 枚举无 PATCH)。
// 后端若有 PATCH 端点,小程序侧需改走 POST/PUT 变体或后端加兼容路由,不在此声明 PATCH。
export interface RequestOptions {
  url: string // 以 / 开头的 API 路径(不含 /api/v1 前缀),如 '/user/profile'
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: WechatMiniprogram.IAnyObject // 请求体(POST/PUT);GET 无
  auth?: boolean // 是否携带 token(默认 true)
  timeout?: number // 超时(ms),默认 20s;别再用微信默认 60s 让首屏骨架最坏挂一分钟
}

// 业务/传输错误:同时携带业务码(code)与 HTTP 状态(httpStatus),
// 页面据 code 区分具体错误(如配额、参数),据 httpStatus 判断是否需重登。
export class ApiError extends Error {
  code: number
  httpStatus: number
  constructor(code: number, message: string, httpStatus: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

// 鉴权失效(需重登):后端 401 / session 过期(2016)/ 被踢(2019 → 409)等。
// 这里以 HTTP 状态为准(httpStatusFromCode 已把 2016→401、2019→409 做了映射)。
function isAuthError(httpStatus: number): boolean {
  return httpStatus === 401 || httpStatus === 409
}

// querystring:跳过 undefined/null/'',统一 encodeURIComponent(见体检 R6)。返回含 '?' 前缀或空串。
export function qs(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const k in params) {
    const v = params[k]
    if (v === undefined || v === null || v === '') continue
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
  }
  return parts.length ? '?' + parts.join('&') : ''
}

// 后端返回的相对图片地址(如 /api/v1/public/tools/logo/<slug>)在小程序 <image> 里
// 没有 origin 可解析 —— 会被当成「本地包路径」而裂图(Web 端同源所以能直接用相对路径)。
// 这里把相对地址补成绝对(BASE_URL 打头);已是绝对 / 本地文件 / 内联 data URI 的原样返回。
// 注意:传入的相对路径若已含 /api/v1 前缀(如 logo),这里只补 host,不要再拼 API_PREFIX。
// 只对「后端返回的媒体字段」用,别对本地包资源(/images/...)用,否则会被错误加 host。
export function absMediaUrl(path?: string | null): string {
  if (!path) return ''
  if (/^(https?:|wxfile:|cloud:|data:)/i.test(path)) return path
  return path.charAt(0) === '/' ? BASE_URL + path : BASE_URL + '/' + path
}

// 非 JSON 通道(上传/下载/流式/WS)统一走这三个,别再各自手搓 URL+token(见体检 A2)。
export function authedUrl(path: string): string {
  return BASE_URL + API_PREFIX + path
}
export function authHeader(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: 'Bearer ' + token } : {}
}
// 这些通道拿到 401 时也和 request() 一样清 token,保持鉴权失效处理一致。
export function handleAuthFailure(httpStatus: number): void {
  if (isAuthError(httpStatus)) clearToken()
}

export function request<T = unknown>(opts: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, auth = true, timeout = 20000 } = opts
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) header['Authorization'] = 'Bearer ' + token
  }

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: BASE_URL + API_PREFIX + url,
      method,
      data,
      header,
      timeout,
      success: (res) => {
        const status = res.statusCode
        const body = res.data as unknown as ApiEnvelope<T>
        if (status >= 200 && status < 300 && body && body.code === 0) {
          resolve(body.data)
          return
        }
        // 鉴权失效:清 token(页面/调用方决定是否跳登录)。
        if (isAuthError(status)) {
          clearToken()
        }
        const code = body && typeof body.code === 'number' ? body.code : status
        const message = (body && body.message) || '请求失败(' + status + ')'
        reject(new ApiError(code, message, status))
      },
      fail: (err) => {
        reject(new ApiError(-1, err.errMsg || '网络异常', 0))
      },
    })
  })
}
