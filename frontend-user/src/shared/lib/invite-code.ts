/**
 * 邀请码本地暂存 —— 邀请归因通道的前端半边。
 *
 * 链路(契约见 backend/internal/invite):
 *   1. 落地页 /i/:code 进入时 saveInviteCode() 存下 {code, ts}
 *   2. http.ts 请求拦截器每次 readInviteCode(),有效则带 X-Invite-Code 头
 *   3. 后端**仅在「新用户创建成功」时**消费该头,平时携带无副作用
 *
 * 30 天过期语义:没有后台定时器,**读取时校验 ts**,过期顺手清除并返回 null。
 * localStorage 不可用(隐私模式 / 配额满 / 非浏览器环境)时全部静默 ——
 * 归因是 best-effort,绝不能因为它挡住正常请求。
 */
const STORAGE_KEY = 'scholay:invite_code';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

interface StoredInvite {
  code: string;
  /** 存入时刻(epoch ms),读取时据此判过期。 */
  ts: number;
}

export function saveInviteCode(code: string): void {
  try {
    const payload: StoredInvite = { code, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 静默:归因丢了就丢了,不影响落地页跳转
  }
}

/** 读取未过期的邀请码;过期 / 形态损坏时顺手清除并返回 null。 */
export function readInviteCode(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredInvite>;
    if (
      typeof parsed?.code !== 'string' ||
      parsed.code === '' ||
      typeof parsed?.ts !== 'number' ||
      Date.now() - parsed.ts > TTL_MS
    ) {
      // 过期或损坏:清掉,避免之后每次请求都重复走失败分支
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearInviteCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同 save:best-effort
  }
}
