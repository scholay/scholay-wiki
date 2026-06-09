// ============================================================================
// Prism 智能写作 — 极端全流程 E2E(bun tests/prism-e2e/extreme.mjs)
//
// 真实驱动 Prism 的 round/apply + 编译链路,覆盖本轮新增能力:
//   - 多文件:agent 拆章节(sections/*.tex)、建数据文件(data/*.dat)→ 新文件被固化
//   - 图表:pgfplots 折线 + booktabs 三线表 + 公式(用 prism-figures / latex-format skill)
//   - 多文件 pending(前端多文件切换面的数据源)+ 整轮 apply
//   - 编译:LaTeX→PDF(scholar_prism_tex 沙箱)成功出 PDF
//   - per-hunk/per-file:第二轮用 overrides 只固化部分文件
//
// 前置:整套 stack 起着 + agent 配好 provider/key。配置 env:
//   PRISM_E2E_BASE(默认 http://localhost:5411)+ PRISM_E2E_TOKEN(JWT)
//   或默认用 admin/adminadmin 走 /admin/login。
// ============================================================================

const BASE = process.env.PRISM_E2E_BASE || 'http://localhost:5411';
const API = '/api/v1';
const TURN_TIMEOUT = Number(process.env.PRISM_E2E_TURN_TIMEOUT_MS || 300000);

function apiUrl(p) { return `${BASE}${API}${p}`; }
function unwrap(j) { return j && typeof j === 'object' && j.data && typeof j.data === 'object' ? j.data : j; }

async function http(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  return { status: res.status, json, ok: res.ok };
}

async function login() {
  if (process.env.PRISM_E2E_TOKEN) return process.env.PRISM_E2E_TOKEN;
  const r = await http('POST', '/admin/login', { body: { username: process.env.PRISM_E2E_USER || 'admin', password: process.env.PRISM_E2E_PASS || 'adminadmin' } });
  const t = unwrap(r.json)?.token;
  if (!t) throw new Error(`login failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`);
  return t;
}

function wsUrl(sessionId, wsToken) {
  const proto = BASE.startsWith('https') ? 'wss' : 'ws';
  return `${proto}://${BASE.replace(/^https?:\/\//, '')}${API}/user/prism/ws/${sessionId}?ws_token=${encodeURIComponent(wsToken)}`;
}

// runRound: prepare(铺源) → ws-ticket → WS → 发指令 → 收到 message_complete/error/超时。
async function runRound(token, projectId, content) {
  await http('POST', `/user/prism/projects/${projectId}/round/prepare`, { token, body: {} });
  const tk = await http('POST', `/user/prism/projects/${projectId}/ws-ticket`, { token, body: {} });
  const { sessionId, wsToken } = unwrap(tk.json);
  if (!wsToken) throw new Error('no ws-ticket');

  const frames = [];
  const toolUses = [];
  let text = '', completed = false, errored = false, errMsg = '', timedOut = false;
  const start = Date.now();
  await new Promise((resolve) => {
    let settled = false;
    const ws = new WebSocket(wsUrl(sessionId, wsToken));
    const timer = setTimeout(() => { timedOut = true; fin(); }, TURN_TIMEOUT);
    function fin() { if (settled) return; settled = true; clearTimeout(timer); try { ws.close(); } catch {} resolve(); }
    ws.onopen = () => ws.send(JSON.stringify({ type: 'user_message', content }));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
      frames.push(m.type);
      if (m.type === 'content_delta' && typeof m.text === 'string') text += m.text;
      else if (m.type === 'tool_use_complete') toolUses.push(m.toolName);
      else if (m.type === 'error') { errored = true; errMsg = m.message || ''; fin(); }
      else if (m.type === 'message_complete') { completed = true; fin(); }
    };
    ws.onerror = () => {};
    ws.onclose = () => fin();
  });
  return { completed, errored, errMsg, timedOut, toolUses, text, durationMs: Date.now() - start };
}

async function pending(token, projectId) {
  const r = await http('GET', `/user/prism/projects/${projectId}/round/pending`, { token });
  return unwrap(r.json)?.files ?? [];
}
async function apply(token, projectId, instruction, overrides) {
  const body = {}; if (instruction) body.instruction = instruction; if (overrides) body.files = overrides;
  const r = await http('POST', `/user/prism/projects/${projectId}/round/apply`, { token, body });
  return unwrap(r.json)?.applied ?? 0;
}
async function getProject(token, projectId) {
  const r = await http('GET', `/user/prism/projects/${projectId}`, { token });
  return unwrap(r.json);
}
async function getFileBody(token, projectId, fileId) {
  const r = await http('GET', `/user/prism/projects/${projectId}/files/${fileId}`, { token });
  return unwrap(r.json)?.body ?? '';
}
async function compileAndWait(token, projectId) {
  const c = await http('POST', `/user/prism/projects/${projectId}/compile`, { token, body: {} });
  const cid = unwrap(c.json)?.compile?.id;
  if (!cid) return { status: 'no-compile' };
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const g = await http('GET', `/user/prism/projects/${projectId}/compile/${cid}`, { token });
    const cm = unwrap(g.json)?.compile;
    if (cm && (cm.status === 'success' || cm.status === 'error')) return cm;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: 'timeout' };
}

const ok = (b) => (b ? 'PASS' : 'FAIL');
function has(s, ...needles) { const l = (s || '').toLowerCase(); return needles.some((n) => l.includes(n.toLowerCase())); }

async function main() {
  console.log(`[prism-e2e] base=${BASE}`);
  const token = await login();
  console.log('[prism-e2e] login OK');

  const cp = await http('POST', '/user/prism/projects', { token, body: { title: '极端测试项目' } });
  const proj = unwrap(cp.json);
  const projectId = proj?.project?.id;
  if (!projectId) throw new Error(`create project failed: ${JSON.stringify(cp.json).slice(0, 200)}`);
  console.log(`[prism-e2e] project ${projectId} created (files: ${(proj.files || []).map((f) => f.rel_path).join(', ')})`);

  // ── Round 1:多文件 + 图表 + 表格 + 公式 + 中文 ───────────────────────────
  const r1prompt =
    '把这篇论文搭成一个规范的多文件 LaTeX 工程并填充内容(中文论文,用 ctex):\n' +
    '1) 主文件 main.tex 用 \\input 引入各章节;\n' +
    '2) 新建 sections/intro.tex(引言)、sections/method.tex(方法,含一个编号公式)、sections/experiment.tex(实验);\n' +
    '3) 在实验章节用 pgfplots 画一张折线图(数据写进 data/loss.dat 再 \\addplot table 引用),并放一张 booktabs 三线表对比 Baseline 与 Ours;\n' +
    '4) 图和表都要 \\caption 和 \\label,正文用 \\ref 引用。\n' +
    '需要的宏包都在导言区补好。';
  console.log('[prism-e2e] Round 1 (multi-file + figures), 可能要等 1-4 分钟…');
  const r1 = await runRound(token, projectId, r1prompt);
  console.log(`  round1: completed=${r1.completed} errored=${r1.errored} timedOut=${r1.timedOut} ${r1.durationMs}ms`);
  console.log(`  tools: ${[...new Set(r1.toolUses)].join(', ') || '(none)'}`);
  if (r1.errMsg) console.log(`  errMsg: ${r1.errMsg}`);

  const pend1 = await pending(token, projectId);
  const newFiles = pend1.filter((f) => f.is_new).map((f) => f.rel_path);
  const allChanged = pend1.map((f) => f.rel_path);
  const corpus = pend1.map((f) => f.new_body).join('\n');
  console.log(`\n[ASSERT R1]`);
  console.log(`  ${ok(pend1.length >= 2)} 多文件改动: ${pend1.length} 个 (${allChanged.join(', ')})`);
  console.log(`  ${ok(newFiles.length >= 1)} 新建文件被检出: ${newFiles.join(', ') || '无'}`);
  console.log(`  ${ok(has(corpus, 'pgfplots', 'tikzpicture', 'addplot'))} 含 pgfplots/TikZ 图`);
  console.log(`  ${ok(has(corpus, 'toprule', 'booktabs'))} 含 booktabs 三线表`);
  console.log(`  ${ok(has(corpus, '\\label', '\\caption'))} 含 caption/label`);
  console.log(`  ${ok(has(corpus, 'ctex', '\\input'))} 含 ctex/多文件 \\input`);

  const applied1 = await apply(token, projectId, r1prompt);
  console.log(`  ${ok(applied1 >= 1)} apply 固化 ${applied1} 个文件`);

  const projAfter = await getProject(token, projectId);
  const dbFiles = (projAfter.files || []).map((f) => f.rel_path);
  console.log(`  ${ok(dbFiles.length >= 2)} DB 现有文件: ${dbFiles.join(', ')}`);

  // ── 编译 → PDF ───────────────────────────────────────────────────────────
  console.log('\n[prism-e2e] 编译…');
  const cm = await compileAndWait(token, projectId);
  console.log(`  ${ok(cm.status === 'success')} 编译 status=${cm.status}${cm.error_summary ? ' | ' + cm.error_summary.slice(0, 160) : ''}`);
  if (cm.status === 'success') {
    const pdf = await fetch(apiUrl(`/user/prism/projects/${projectId}/pdf`), { headers: { Authorization: `Bearer ${token}` } });
    const buf = await pdf.arrayBuffer();
    console.log(`  ${ok(pdf.status === 200 && buf.byteLength > 1000)} PDF: HTTP ${pdf.status} ${buf.byteLength}B ${pdf.headers.get('content-type')}`);
  }

  // ── Round 2:per-file override(只固化一个文件)─────────────────────────────
  console.log('\n[prism-e2e] Round 2 (小改 + per-file override)…');
  const r2 = await runRound(token, projectId, '把引言(sections/intro.tex)的第一句改写得更精炼一些,只改这一处。');
  console.log(`  round2: completed=${r2.completed} errored=${r2.errored} ${r2.durationMs}ms`);
  const pend2 = await pending(token, projectId);
  console.log(`  pending2: ${pend2.map((f) => f.rel_path).join(', ') || '无'}`);
  if (pend2.length > 0) {
    // 只固化第一个文件(模拟用户 per-file 只接受一个),用其 new_body
    const pick = pend2[0];
    const applied2 = await apply(token, projectId, '', { [pick.rel_path]: pick.new_body });
    console.log(`  ${ok(applied2 === 1)} per-file override 只固化 1 个 (${pick.rel_path}), applied=${applied2}`);
  } else {
    console.log('  (round2 无改动,跳过 override 断言)');
  }

  console.log('\n[prism-e2e] done. project id =', projectId);
}

main().catch((e) => { console.error('[prism-e2e] fatal:', e.message); process.exit(1); });
