// per-user 长期记忆 E2E:API 编辑 / 注入(跨 feature)/ 后台自动抽取 / 隐私删除。
// 用法: node scripts/agent-test/run-memory.mjs
import { login, api, AgentConn, sleep } from './lib.mjs'

const PASS = 'P0test123!'
const results = []
const rec = (name, ok, obs) => { results.push({ name, status: ok ? 'pass' : 'fail', obs }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} — ${obs}`) }

function firstUserText(msgsResp) {
  const msgs = msgsResp?.json?.data?.messages || msgsResp?.json?.messages || []
  for (const m of msgs) {
    if (m.type !== 'user') continue
    let c = m.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) return c.filter(b => b.type === 'text').map(b => b.text).join(' ')
  }
  return ''
}
function allAssistantText(msgsResp) {
  const msgs = msgsResp?.json?.data?.messages || msgsResp?.json?.messages || []
  let t = ''
  for (const m of msgs) {
    if (m.type !== 'assistant') continue
    if (Array.isArray(m.content)) t += m.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
    else if (typeof m.content === 'string') t += m.content
  }
  return t
}

// ── A. API 编辑 round-trip ──
const token = await login('p0test_mem@test.local', PASS)
await api('/user/memory', { method: 'DELETE', token }) // clear
await api('/user/memory/profile', { method: 'PUT', token, body: { value: '研究方向:自然语言处理与大模型对齐(RLHF);身份:博士生' } })
await api('/user/memory/preferences', { method: 'PUT', token, body: { value: '偏好简洁中文回答,要点先行' } })
const listed = await api('/user/memory', { token })
const blocks = listed.json?.data?.blocks || []
rec('A. API 编辑 round-trip', blocks.length === 2 && blocks.some(b => b.label === 'profile' && b.value.includes('自然语言处理')),
  `GET /memory 返回 ${blocks.length} 块: ${blocks.map(b => b.label).join(',')}`)

// ── B. 注入 smart-search(transcript 首条 user 消息含记忆 + assistant 用上)──
await api('/user/smart-search/session/reset', { method: 'POST', token }) // 强制新会话→首条注入
{
  const conn = new AgentConn('smart-search', { wsPath: '/user/smart-search/ws' })
  await conn.open(token)
  const r = await conn.ask('用一句话:根据你已知的我的研究方向,我应该重点关注哪一类论文?', { timeoutMs: 150000 })
  conn.close()
  await sleep(1500)
  const msgs = await api('/user/smart-search/session/messages', { token })
  const fu = firstUserText(msgs)
  const injected = fu.includes('自然语言处理') || fu.includes('长期记忆')
  const used = /NLP|自然语言|对齐|RLHF|大模型/i.test(r.text)
  rec('B. smart-search 注入+使用', injected && used && !r.error,
    `首条user含记忆=${injected}; 回复体现研究方向=${used}; err=${r.error || 'none'}; replyHead="${r.text.slice(0, 80)}"`)
}

// ── C. 跨 feature:同一记忆注入 claw ──
await api('/user/claw/session/reset', { method: 'POST', token })
{
  const conn = new AgentConn('claw', { wsPath: '/user/claw/ws' })
  await conn.open(token)
  const r = await conn.ask('用一句话告诉我:你知道我的研究方向和回答偏好吗?', { timeoutMs: 150000 })
  conn.close()
  await sleep(1500)
  const msgs = await api('/user/claw/session/messages', { token })
  const fu = firstUserText(msgs)
  const injected = fu.includes('自然语言处理') || fu.includes('长期记忆')
  const used = /NLP|自然语言|对齐|RLHF|简洁/i.test(r.text)
  rec('C. 跨feature(claw)注入', injected && !r.error,
    `claw首条user含记忆=${injected}; 回复体现=${used}; err=${r.error || 'none'}`)
}

// ── D. 后台自动抽取(独立用户,无 cooldown 干扰)──
const token2 = await login('p0test_mem2@test.local', PASS)
await api('/user/memory', { method: 'DELETE', token: token2 })
{
  const conn = new AgentConn('claw', { wsPath: '/user/claw/ws' })
  await conn.open(token2)
  await conn.ask('补充点关于我的背景:我是做计算机视觉的硕士生,长期研究三维重建和点云;另外我希望你以后都用英文回答我。', { timeoutMs: 150000 })
  conn.close()
  // 抽取是 message_complete 后 safego 异步 + 一次便宜模型调用,给它时间
  let updated = false, detail = ''
  for (let i = 0; i < 8; i++) {
    await sleep(5000)
    const m = await api('/user/memory', { token: token2 })
    const bs = m.json?.data?.blocks || []
    const prof = bs.find(b => b.label === 'profile')?.value || ''
    const pref = bs.find(b => b.label === 'preferences')?.value || ''
    detail = `profile="${prof.slice(0, 60)}" pref="${pref.slice(0, 40)}"`
    if (/计算机视觉|视觉|三维重建|点云/.test(prof) || /英文|English/i.test(pref)) { updated = true; break }
  }
  rec('D. 后台自动抽取', updated, `轮询后记忆: ${detail}`)
}

// ── E. 隐私删除 ──
await api('/user/memory', { method: 'DELETE', token })
const after = await api('/user/memory', { token })
rec('E. 清空记忆(GDPR)', (after.json?.data?.blocks || []).length === 0, `清空后块数=${(after.json?.data?.blocks || []).length}`)

const pass = results.filter(r => r.status === 'pass').length
console.log(`\n=== MEMORY E2E: ${pass}/${results.length} passed ===`)
process.exit(pass === results.length ? 0 : 1)
