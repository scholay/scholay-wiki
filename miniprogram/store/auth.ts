// token 单一真源:wx.storage 的 'auth_token'(内存缓存一层减少同步读)。
// 对标 Web 端 localStorage.auth_token(见后端 memory: auth-token-single-source)。
const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

let tokenCache: string | null | undefined // undefined = 尚未从 storage 读取

// 会话变更观察者(见体检 A3):setToken/clearToken 时广播,让在场页面即时 reconcile 登录态
// (401 静默清 token、内联 ensureLogin 登录成功后,不必等下次 onShow 才刷新)。
type AuthListener = (loggedIn: boolean) => void
const authListeners = new Set<AuthListener>()
export function onAuthChange(fn: AuthListener): () => void {
  authListeners.add(fn)
  return () => authListeners.delete(fn)
}
function emitAuthChange(loggedIn: boolean): void {
  for (const fn of authListeners) {
    try {
      fn(loggedIn)
    } catch {
      /* 单个订阅者抛错不影响其它 */
    }
  }
}

export function getToken(): string {
  if (tokenCache === undefined) {
    tokenCache = (wx.getStorageSync(TOKEN_KEY) as string) || null
  }
  return tokenCache || ''
}

export function setToken(token: string): void {
  const was = !!tokenCache
  tokenCache = token
  wx.setStorageSync(TOKEN_KEY, token)
  if (!was) emitAuthChange(true)
}

export function clearToken(): void {
  const was = !!tokenCache
  tokenCache = null
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
  if (was) emitAuthChange(false)
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

export function getUser<T = Record<string, unknown>>(): T | null {
  return (wx.getStorageSync(USER_KEY) as T) || null
}

export function setUser(user: unknown): void {
  wx.setStorageSync(USER_KEY, user)
}
