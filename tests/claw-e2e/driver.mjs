// ============================================================================
// Claw 智能助手 — E2E 协议驱动 (bun 运行: 原生 fetch + WebSocket, 零依赖)
//
// 这是 run.mjs 用的底层驱动: 登录 → 取/建会话 → ws-ticket → WS 升级 → 发 user_message
// → 收 ServerMessage 流到 message_complete/error → 断言 → 查产物。
//
// 协议来源 (真源): frontend-user/src/features/claw/api/{socket,types}.ts + backend 路由。
// WS 鉴权只认 ?ws_token=<30s 一次性 ticket>; HTTP 走 Authorization: Bearer <jwt>。
//
// 运行: bun tests/claw-e2e/run.mjs   (配置见下 env)
// ============================================================================

export const CONFIG = {
  base: process.env.CLAW_E2E_BASE || 'http://localhost:5411',
  apiBase: process.env.CLAW_E2E_API_BASE || '/api/v1',
  email: process.env.CLAW_E2E_EMAIL || '',
  password: process.env.CLAW_E2E_PASSWORD || '',
  token: process.env.CLAW_E2E_TOKEN || '', // 可直接给 JWT 跳过登录
  turnTimeoutMs: Number(process.env.CLAW_E2E_TURN_TIMEOUT_MS || 180000), // 重多工具轮(如作者检索 11 次调用 ~85s)需要宽预算
};

function apiUrl(path) {
  return `${CONFIG.base}${CONFIG.apiBase}${path}`;
}

function wsUrl(sessionId, wsToken) {
  const proto = CONFIG.base.startsWith('https') ? 'wss' : 'ws';
  const host = CONFIG.base.replace(/^https?:\/\//, '');
  return `${proto}://${host}${CONFIG.apiBase}/user/claw/ws/${sessionId}?ws_token=${encodeURIComponent(wsToken)}`;
}

// unwrap —— 后端 utils.Success 包成 {data:{...}} 或直接 {...}, 两种都兼容。
function unwrap(json) {
  if (json && typeof json === 'object' && 'data' in json && json.data && typeof json.data === 'object') {
    return json.data;
  }
  return json;
}

async function httpJSON(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, ok: res.ok };
}

// login —— POST /user/login {email,password} → JWT。容忍多种字段名 (token/accessToken)。
export async function login() {
  if (CONFIG.token) return CONFIG.token;
  if (!CONFIG.email || !CONFIG.password) {
    throw new Error('需要 CLAW_E2E_EMAIL + CLAW_E2E_PASSWORD 或 CLAW_E2E_TOKEN');
  }
  const { status, json } = await httpJSON('POST', '/user/login', {
    body: { email: CONFIG.email, password: CONFIG.password },
  });
  const data = unwrap(json);
  const token = data?.token || data?.accessToken || data?.auth_token;
  if (!token) throw new Error(`登录失败 (status ${status}): ${JSON.stringify(json).slice(0, 300)}`);
  return token;
}

export async function getOrCreateSession(token) {
  const { json } = await httpJSON('GET', '/user/claw/session', { token });
  const sid = unwrap(json)?.sessionId;
  if (!sid) throw new Error('未拿到 sessionId');
  return sid;
}

export async function newSession(token) {
  const { json } = await httpJSON('POST', '/user/claw/sessions', { token, body: {} });
  const sid = unwrap(json)?.sessionId;
  if (!sid) throw new Error('未拿到新 sessionId');
  return sid;
}

export async function resetSession(token) {
  const { json } = await httpJSON('POST', '/user/claw/session/reset', { token, body: {} });
  return unwrap(json)?.sessionId;
}

async function wsTicket(token, sessionId) {
  const { status, json } = await httpJSON(
    'POST',
    `/user/claw/session/ws-ticket?session_id=${encodeURIComponent(sessionId)}`,
    { token, body: {} },
  );
  const wt = unwrap(json)?.wsToken;
  if (!wt) throw new Error(`ws-ticket 失败 (status ${status})`);
  return wt;
}

export async function listArtifacts(token, sessionId) {
  const { status, json } = await httpJSON(
    'GET',
    `/user/claw/session/artifacts?session_id=${encodeURIComponent(sessionId)}`,
    { token },
  );
  return { status, items: unwrap(json)?.items || [] };
}

// downloadArtifact —— 返回 {status, contentType, body}。download=1 触发 attachment。
export async function downloadArtifact(token, sessionId, relPath, { download = false } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const q = new URLSearchParams({ session_id: sessionId, path: relPath });
  if (download) q.set('download', '1');
  const res = await fetch(apiUrl(`/user/claw/session/artifact?${q.toString()}`), { headers });
  const body = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type') || '', body };
}

// upload —— multipart POST /user/claw/upload。bytes: Uint8Array/string。
export async function upload(token, sessionId, fileName, bytes, contentType = 'text/plain') {
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: contentType }), fileName);
  if (sessionId) fd.append('session_id', sessionId);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(apiUrl('/user/claw/upload'), { method: 'POST', headers, body: fd });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, attachment: unwrap(json) };
}

/**
 * runTurn —— 跑一轮对话: 签 ticket → 连 WS → 发 user_message → 收流到终态。
 * 返回结构化结果供断言, 绝不抛 (除非连不上)。
 *   { completed, errored, errorMessage, displaced, frames, types, text, toolUses, durationMs, timedOut }
 */
export async function runTurn(token, sessionId, { content, attachments } = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs || CONFIG.turnTimeoutMs;
  const wt = await wsTicket(token, sessionId);
  const url = wsUrl(sessionId, wt);

  const frames = [];
  let text = '';
  const toolUses = [];
  let completed = false;
  let errored = false;
  let errorMessage = '';
  let displaced = false;
  let timedOut = false;
  const start = Date.now();

  await new Promise((resolve) => {
    let settled = false;
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      timedOut = true;
      finish();
    }, timeoutMs);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve();
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'user_message', content: content ?? '', ...(attachments ? { attachments } : {}) }));
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
      frames.push(msg);
      switch (msg.type) {
        case 'content_delta': if (typeof msg.text === 'string') text += msg.text; break;
        case 'tool_use_complete': toolUses.push(msg.toolName); break;
        case 'error': errored = true; errorMessage = msg.message || ''; finish(); break;
        case 'displaced': displaced = true; finish(); break;
        case 'message_complete': completed = true; finish(); break;
        default: break;
      }
    };
    ws.onerror = () => { /* 由 onclose / timeout 收口 */ };
    ws.onclose = () => finish();
  });

  return {
    completed,
    errored,
    errorMessage,
    displaced,
    timedOut,
    frames,
    types: frames.map((f) => f.type),
    text,
    toolUses,
    durationMs: Date.now() - start,
  };
}
