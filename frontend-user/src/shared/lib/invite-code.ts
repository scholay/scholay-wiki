/**
 * 邀请码本地暂存 —— 邀请归因通道的前端半边。
 *
 * 链路(契约见 backend/internal/invite):
 *   1. 落地页 /i/:code 进入时 saveInviteCode() 存下 {code, ts, expiresAt}
 *   2. http.ts 请求拦截器每次 readInviteCode(),有效则带 X-Invite-Code 头
 *   3. 后端**仅在「新用户创建成功」时**消费该头,平时携带无副作用
 *
 * 过期时长跟随 campaign.bind_window_days；campaign 尚未返回时先按 30 天兜底，
 * 返回后再以原捕获时刻为锚点校正 expiresAt。没有后台定时器，读取时校验，
 * 过期顺手清除并返回 null。旧版仅有 code/ts 的存量仍按 30 天兼容。
 * localStorage 不可用(隐私模式 / 配额满 / 非浏览器环境)时全部静默 ——
 * 归因是 best-effort,绝不能因为它挡住正常请求。
 */
const STORAGE_KEY = "scholay:invite_code";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = 30 * DAY_MS;

export interface StoredInviteCandidate {
  code: string;
  /** 存入时刻(epoch ms),读取时据此判过期。 */
  ts: number;
  /** 候选失效时刻(epoch ms)，由活动的允许绑定时窗决定。 */
  expiresAt: number;
  /** preview 校验通过后返回的邀请人脱敏展示名。 */
  inviterName?: string;
  /** true=已经 /invite/preview 校验;undefined=仅捕获、尚未校验。 */
  valid?: true;
}

export function saveInviteCode(
  code: string,
  meta?: {
    inviterName?: string;
    valid?: boolean;
    bindWindowDays?: number;
    capturedAt?: number;
    expiresAt?: number;
  },
): void {
  try {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    const capturedAt = meta?.capturedAt ?? Date.now();
    const configuredDays = meta?.bindWindowDays;
    const ttl =
      typeof configuredDays === "number" &&
      Number.isFinite(configuredDays) &&
      configuredDays > 0
        ? Math.min(3650, Math.trunc(configuredDays)) * DAY_MS
        : DEFAULT_TTL_MS;
    const requestedExpiry = meta?.expiresAt;
    const expiresAt =
      typeof requestedExpiry === "number" &&
      Number.isFinite(requestedExpiry) &&
      requestedExpiry >= capturedAt
        ? requestedExpiry
        : capturedAt + ttl;
    const payload: StoredInviteCandidate = {
      code: normalized,
      ts: capturedAt,
      expiresAt,
      ...(meta?.inviterName ? { inviterName: meta.inviterName } : {}),
      ...(meta?.valid ? { valid: true as const } : {}),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 静默:归因丢了就丢了,不影响落地页跳转
  }
}

/** 读取未过期的邀请码;过期 / 形态损坏时顺手清除并返回 null。 */
export function readInviteCode(): string | null {
  return readInviteCandidate()?.code ?? null;
}

/** 读取邀请候选及 preview 摘要；旧版只有 code/ts 时按 30 天计算 expiresAt。 */
export function readInviteCandidate(): StoredInviteCandidate | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredInviteCandidate>;
    const expiresAt =
      typeof parsed?.expiresAt === "number" && Number.isFinite(parsed.expiresAt)
        ? parsed.expiresAt
        : typeof parsed?.ts === "number"
          ? parsed.ts + DEFAULT_TTL_MS
          : Number.NaN;
    if (
      typeof parsed?.code !== "string" ||
      parsed.code.trim() === "" ||
      typeof parsed?.ts !== "number" ||
      !Number.isFinite(expiresAt) ||
      expiresAt < parsed.ts ||
      Date.now() > expiresAt
    ) {
      // 过期或损坏:清掉,避免之后每次请求都重复走失败分支
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      code: parsed.code.trim().toUpperCase(),
      ts: parsed.ts,
      expiresAt,
      ...(typeof parsed.inviterName === "string" && parsed.inviterName
        ? { inviterName: parsed.inviterName }
        : {}),
      ...(parsed.valid === true ? { valid: true as const } : {}),
    };
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
