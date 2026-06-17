// ============================================================================
// Scholay agent E2E 测试公共库 (Node >=22, 用内置全局 WebSocket / fetch)
// 覆盖标准 WS 桥 feature(smart-search / claw):login → session → ws-ticket →
// WS 连接 → 发 user_message → 收流式帧直到 message_complete。
// 用法见 scripts/agent-test/run-*.mjs。需本地 docker 栈在跑(经 nginx :5411)。
// ============================================================================
const HOST = process.env.SCHOLAY_HOST || 'localhost:5411'
export const BASE = `http://${HOST}/api/v1`
export const WS_BASE = `ws://${HOST}/api/v1`

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function login(email, password) {
  const r = await fetch(`${BASE}/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json()
  const token = j?.data?.token || j?.token
  if (!token) throw new Error(`login failed for ${email}: ${JSON.stringify(j).slice(0, 200)}`)
  return token
}

export async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let j
  try { j = JSON.parse(text) } catch { j = { _raw: text } }
  return { status: r.status, json: j }
}

// getSession 拿到/创建 feature 的(单)会话 id。
export async function getSession(feature, token) {
  const { json } = await api(`/user/${feature}/session`, { token })
  return json?.data?.sessionId || json?.data?.id
}

// issueTicket 为某 session 申请一次性 ws ticket。
export async function issueTicket(feature, token, sessionId) {
  const { status, json } = await api(`/user/${feature}/session/ws-ticket`, {
    method: 'POST', token, body: sessionId ? { sessionId } : undefined,
  })
  const wsToken = json?.data?.wsToken
  if (!wsToken) throw new Error(`ws-ticket failed (${status}): ${JSON.stringify(json).slice(0, 200)}`)
  return { wsToken, sessionId: json?.data?.sessionId || sessionId }
}

// AgentConn 包一条 WS 连接,支持单连接内多轮问答(每轮等到 message_complete)。
// onPermission 缺省 null:有些 feature(prism/claw 写操作)会发 permission_request,
// 测试时可传一个回调决定批准/拒绝。
export class AgentConn {
  constructor(feature, { wsPath } = {}) {
    this.feature = feature
    this.wsPath = wsPath || `/user/${feature}/ws`
    this.ws = null
    this.sessionId = null
  }

  async open(token, { sessionId } = {}) {
    let sid = sessionId
    if (!sid) sid = await getSession(this.feature, token)
    const t = await issueTicket(this.feature, token, sid)
    sid = t.sessionId || sid
    this.sessionId = sid
    const url = `${WS_BASE}${this.wsPath}/${sid}?ws_token=${t.wsToken}`
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      const to = setTimeout(() => reject(new Error('ws open timeout')), 12000)
      ws.onopen = () => { clearTimeout(to); this.ws = ws; resolve() }
      ws.onerror = (e) => { clearTimeout(to); reject(new Error('ws error: ' + (e?.message || 'unknown'))) }
    })
    return this
  }

  // ask 发一条 user_message,收帧直到 message_complete / error / 超时。
  // 返回 {text, toolCalls:[{name,input}], toolResults:n, usage, frames:n, error, status, raw:[types]}
  ask(content, { timeoutMs = 180000, onDelta, autoApprove = true, attachments } = {}) {
    return new Promise((resolve) => {
      const ws = this.ws
      if (!ws || ws.readyState !== 1) return resolve({ error: 'ws not open' })
      const out = { text: '', toolCalls: [], toolResults: 0, usage: null, frames: 0, error: null, raw: [] }
      const seenTypes = new Set()
      let done = false
      const finish = () => { if (done) return; done = true; clearTimeout(to); ws.onmessage = prev; resolve(out) }
      const to = setTimeout(() => { out.error = out.error || 'timeout'; finish() }, timeoutMs)
      const prev = ws.onmessage
      ws.onmessage = (ev) => {
        let m
        try { m = JSON.parse(ev.data) } catch { return }
        out.frames++
        seenTypes.add(m.type)
        switch (m.type) {
          case 'content_delta': if (m.text) { out.text += m.text; onDelta?.(m.text) } break
          case 'tool_use_complete': out.toolCalls.push({ name: m.toolName, input: m.input }); break
          case 'tool_result': out.toolResults++; break
          case 'permission_request':
            if (autoApprove && ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'permission_response', requestId: m.requestId, allowed: true }))
            }
            break
          case 'message_complete': out.usage = m.usage || null; out.raw = [...seenTypes]; finish(); break
          case 'error': out.error = m.message || m.code || 'error'; out.code = m.code; out.raw = [...seenTypes]; finish(); break
        }
      }
      ws.send(JSON.stringify({ type: 'user_message', content, ...(attachments ? { attachments } : {}) }))
    })
  }

  close() { try { this.ws?.close() } catch {} }
}

// ─── prism 专用(项目级会话,ws-ticket 走 /prism/projects/:id/ws-ticket)───

export async function prismCreateProject(token, title) {
  const { status, json } = await api('/user/prism/projects', { method: 'POST', token, body: { title } })
  const id = json?.data?.project?.id || json?.data?.id
  if (!id) throw new Error(`prism create project failed (${status}): ${JSON.stringify(json).slice(0, 200)}`)
  return id
}

export async function prismDeleteProject(token, id) {
  await api(`/user/prism/projects/${id}`, { method: 'DELETE', token })
}

// prismOpen 建一个连到某 prism 项目会话的 AgentConn。
export async function prismOpen(token, projectId) {
  const { status, json } = await api(`/user/prism/projects/${projectId}/ws-ticket`, { method: 'POST', token })
  const wsToken = json?.data?.wsToken
  const sid = json?.data?.sessionId
  if (!wsToken || !sid) throw new Error(`prism ws-ticket failed (${status}): ${JSON.stringify(json).slice(0, 200)}`)
  const conn = new AgentConn('prism', { wsPath: '/user/prism/ws' })
  conn.sessionId = sid
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/user/prism/ws/${sid}?ws_token=${wsToken}`)
    const to = setTimeout(() => reject(new Error('prism ws open timeout')), 12000)
    ws.onopen = () => { clearTimeout(to); conn.ws = ws; resolve() }
    ws.onerror = (e) => { clearTimeout(to); reject(new Error('prism ws error: ' + (e?.message || 'unknown'))) }
  })
  return conn
}

// askOnce 一问一答(开连接→问→关)。多轮请用 AgentConn。
export async function askOnce(feature, token, content, opts = {}) {
  const conn = new AgentConn(feature, opts)
  await conn.open(token, opts)
  const r = await conn.ask(content, opts)
  r.sessionId = conn.sessionId
  conn.close()
  return r
}

// 结果摘要打印
export function fmt(label, r) {
  const tools = r.toolCalls?.map((t) => t.name).join(',') || '-'
  const u = r.usage ? `in=${r.usage.input_tokens} out=${r.usage.output_tokens}` : 'no-usage'
  const status = r.error ? `ERR(${r.code || ''}:${r.error})` : 'OK'
  return `[${label}] ${status} | frames=${r.frames} textLen=${r.text.length} tools=[${tools}] toolResults=${r.toolResults} | ${u} | types=${(r.raw || []).join('/')}`
}
