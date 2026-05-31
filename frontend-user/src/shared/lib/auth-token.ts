/**
 * 鉴权 token 的**唯一真源** —— `localStorage.auth_token`(+ 与后端 iframe 共享会话用的
 * `scholay_token` cookie)。全应用读/写 token 一律走这里。
 *
 * 背景(为什么要统一):历史上 token 有 3 个副本各自维护 ——
 *   1. `localStorage.auth_token`(axios / sse-post 读)
 *   2. zustand persist blob `scholay.auth` 里的 token(rehydrate 进 `useAuthStore.token`)
 *   3. `scholay_token` cookie
 * 它们靠 setSession/clear 手动同步,一旦错位(尤其**多 tab / token 轮换**:zustand 的
 * in-memory `store.token` 不跨 tab 同步,而 localStorage 是共享的)就会出现「走 axios 的请求
 * 200、走 store.token 的 SSE/WS 却 401」——审稿流式「一口气出」正是这么来的。
 *
 * 现在:localStorage.auth_token 是唯一真源;`useAuthStore.token` 退化成它的**镜像**
 *  (init 时读它、跨 tab storage 事件同步它、setSession/clear 一起写),所以读哪个都一致。
 * 非 React 场景(axios 拦截器 / SSE / WS ticket / PDF header)统一用 `getAuthToken()`。
 */

const TOKEN_KEY = 'auth_token';
/** 与后端 middleware.SessionCookieName 字面量保持一致(iframe / 跨页签场景 backend 回落读 cookie)。 */
const COOKIE_NAME = 'scholay_token';

/** 读当前 token(唯一真源)。SSR / 无 localStorage 环境返回 null。 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** 写 token —— localStorage + cookie 一起更新。登录成功后调(经 auth.store.setSession)。 */
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  writeSessionCookie(token);
}

/** 清 token —— localStorage + cookie 一起清。登出 / 401 吊销时调。 */
export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  clearSessionCookie();
}

// ─── cookie(仅 iframe / 跨页签共享会话用;主流请求仍走 Authorization header)─────
// SameSite=Strict:同站同源加载,够用且免 CSRF。无 HttpOnly:token 在 localStorage 本就 XSS 可读,
// 不损失安全等级,换取「前端任意 login 入口都能写」。Max-Age 24h ≈ 后端 JWT TTL,过期由 401 清。

function writeSessionCookie(token: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=86400; SameSite=Strict`;
}

function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
}
