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

/**
 * React Query 私有数据的非敏感会话分区键。
 *
 * 正常 JWT 只提取 user_id，不把原 token 放进 query key / DevTools；
 * 异常或旧 token 用不可逆的 32 位快速指纹隔离，宁可多发一次请求也不跨账号复用私有缓存。
 */
export function authSessionKey(token: string | null): string {
  if (!token) return 'anonymous';
  try {
    const payload = token.split('.')[1];
    if (payload) {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        '=',
      );
      const decoded = JSON.parse(globalThis.atob(padded)) as {
        user_id?: number | string;
      };
      const userId = Number(decoded.user_id);
      if (Number.isSafeInteger(userId) && userId > 0) return `user:${userId}`;
    }
  } catch {
    // 交给后端做真正的 JWT 校验；此处只需生成隔离键。
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `token:${(hash >>> 0).toString(36)}:${token.length}`;
}

/** 写 token —— localStorage + cookie 一起更新。登录成功后调(经 auth.store.setSession)。 */
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  writeSessionCookie(token);
  authLostDispatched = false; // 重新登录 → 解除"认证丢失"去重锁,下次失效能再次引导
}

// 认证丢失去重锁:一次会话失效里, 并发的多个 401(一个页面好几条受保护请求同时失败)只引导一次,
// 避免连弹多个 toast / 反复开登录框;下次成功登录(setAuthToken)后复位。
let authLostDispatched = false;

/** 清 token —— localStorage + cookie 一起清。登出 / 401 吊销时调。 */
export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  clearSessionCookie();
}

/**
 * 通知「鉴权已失效」—— 全前端**唯一**的「认证丢失」出口。
 * 清 token(真源)+ 广播 `auth-evicted` 事件;由 AuthBootstrap 单点消费
 * (清 store.user + 用户端弹登录框 / 管理端跳首页 + toast)。
 *
 * http 401 拦截器 / useProfile / WS 鉴权失败 / SSE 401 全部调它,确保
 * 「未登录 / 登录失效」在所有协议上走同一条引导路径(不再各写各的、漏弹登录)。
 * 放在 auth-token(而非 http.ts)是为了让不依赖 axios 的 WS/SSE 也能调,
 * 且不引入对 zustand store 的反向依赖(store → auth-token 单向)。
 */
export function notifyAuthLost(detail?: { code?: number; message?: string }): void {
  clearAuthToken(); // 清 token 永远执行(幂等)
  if (authLostDispatched) return; // 并发 401 只引导一次, 直到下次登录复位
  authLostDispatched = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth-evicted', { detail: detail ?? {} }));
  }
}

/**
 * 同步 token 的**非持久化**副作用(cookie 跟上 + 401 去重锁复位)—— 专供跨 tab 的
 * storage 监听使用。刻意不写 localStorage:storage 事件是异步排队投递的,监听器里
 * 回写(setAuthToken/clearAuthToken)会向发起 tab 反射新事件,发起 tab 两次相邻写
 * (如登录响应落地前一个并行 401 先清了 token)即可点燃两 tab 间的无限回环 ——
 * 登录态反复翻转 + 每轮 auth-token-swapped → qc.clear() 的请求风暴(2026-08-12 对抗审查确认)。
 */
export function syncAuthSideEffects(token: string | null): void {
  if (token) {
    writeSessionCookie(token);
    authLostDispatched = false; // 拿回 token → 解除去重锁,下次会话失效能再次引导
  } else {
    clearSessionCookie();
  }
}

// ─── cookie(仅 iframe / 跨页签共享会话用;主流请求仍走 Authorization header)─────
// SameSite=Strict:同站同源加载,够用且免 CSRF。无 HttpOnly:token 在 localStorage 本就 XSS 可读,
// 不损失安全等级,换取「前端任意 login 入口都能写」。
// Max-Age 必须 = 后端 JWT TTL(utils/jwt.go TokenExpiration=48h)—— 早前写 24h 与之错位:
// 长驻超 24h 的 tab 里 Authorization header 仍有效(axios 200),但 cookie 已过期,只吃 cookie
// 的鉴权面(聊天图片 iframe / umami)会静默 401(2026-08-12 审计)。JWT 真过期时由 401 清。
const SESSION_COOKIE_MAX_AGE = 48 * 60 * 60; // 48h,对齐后端 JWT TTL

function writeSessionCookie(token: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; SameSite=Strict`;
}

function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
}
