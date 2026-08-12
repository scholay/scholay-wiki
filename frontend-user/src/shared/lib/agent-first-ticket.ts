/**
 * agent 首连 ws ticket 的一次性暂存(2026-08-12 推送化配套)。
 *
 * 后端 GET /user/<feature>/session 现在顺带附一张 30s 一次性 ws ticket
 * (agentbridge.SessionEnvelopeWithTicket),前端首连可以直接用它升级 WS,
 * 省掉「GET session → POST ws-ticket → WS」三段串行里的中间一跳。
 *
 * 语义约束:
 *  - take 即删(与后端 GETDEL 对齐):同一张票只会被本地消费一次;
 *    双连/重连拿不到 stash → 自动回落 POST /session/ws-ticket,行为与旧版完全一致。
 *  - sessionId 必须匹配:多会话 feature 里 socket 可能连的不是默认会话,错票不发。
 *  - 25s 新鲜窗(票面 TTL 30s,留 5s 传输余量):过期票直接丢弃走 POST。
 */
interface StashedTicket {
  sessionId: string;
  wsToken: string;
  expiresInSeconds: number;
  stashedAt: number;
}

const FRESH_WINDOW_MS = 25_000;
const stash = new Map<string, StashedTicket>();

/** session/create/activate 响应带了 wsToken 时入栈(featureBase 形如 '/user/claw')。 */
export function stashFirstConnectTicket(
  featureBase: string,
  payload: { sessionId?: string; wsToken?: string; expiresInSeconds?: number } | undefined
): void {
  if (!payload?.sessionId || !payload.wsToken) return;
  stash.set(featureBase, {
    sessionId: payload.sessionId,
    wsToken: payload.wsToken,
    expiresInSeconds: payload.expiresInSeconds ?? 30,
    stashedAt: Date.now(),
  });
}

/** 首连前出栈:命中(同 feature + 同 session + 未过窗)返回并删除,否则 null → 调用方走 POST。 */
export function takeFirstConnectTicket(
  featureBase: string,
  sessionId: string | null | undefined
): { sessionId: string; wsToken: string; expiresInSeconds: number } | null {
  const t = stash.get(featureBase);
  if (!t) return null;
  stash.delete(featureBase); // 无论是否命中都删:陈票留着只会在下一次错发
  if (Date.now() - t.stashedAt > FRESH_WINDOW_MS) return null;
  if (sessionId && sessionId !== t.sessionId) return null;
  return { sessionId: t.sessionId, wsToken: t.wsToken, expiresInSeconds: t.expiresInSeconds };
}
