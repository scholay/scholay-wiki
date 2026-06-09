// ============================================================================
// Prism 智能写作 — 真·前端 UI 全流程测试(headless Chrome via CDP, bun 运行)
//
// 驱动真实 /prism 界面,验证用户实际操作路径:
//   1) API 备好:建项目 + 跑一轮多文件改动(不 apply,留 pending)
//   2) 无头 Chrome:注入 token → 打开 /prism?p=<id>
//   3) 断言并截图:多文件 diff 渲染(pending tabs + CodeMirror merge 红删绿增)+ 应用按钮
//   4) 切文件 tab(多文件切换)→ 截图
//   5) per-hunk:点 diff 浮层「撤销此处」→ 截图
//   6) 点「应用」→ pending 清空(已应用)→ 截图
//   7) 点「编译」→ 等 PDF canvas 渲染 → 截图
//   8) API 复核:文件已落库
//
// 前置:stack 起着 + agent 配好。env: PRISM_E2E_BASE(默认 http://localhost:5411)。
// ============================================================================

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.PRISM_E2E_BASE || 'http://localhost:5411';
const API = '/api/v1';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(SHOTS, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9222;
const TURN_TIMEOUT = 300000;

const apiUrl = (p) => `${BASE}${API}${p}`;
const unwrap = (j) => (j && j.data && typeof j.data === 'object' ? j.data : j);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { _raw: t }; }
  return { status: res.status, json: j };
}
async function login() {
  if (process.env.PRISM_E2E_TOKEN) return process.env.PRISM_E2E_TOKEN;
  const r = await http('POST', '/admin/login', { body: { username: 'admin', password: 'adminadmin' } });
  const t = unwrap(r.json)?.token;
  if (!t) throw new Error('login failed: ' + JSON.stringify(r.json).slice(0, 200));
  return t;
}
function wsUrl(sid, wt) {
  const proto = BASE.startsWith('https') ? 'wss' : 'ws';
  return `${proto}://${BASE.replace(/^https?:\/\//, '')}${API}/user/prism/ws/${sid}?ws_token=${encodeURIComponent(wt)}`;
}
async function runRound(token, pid, content) {
  await http('POST', `/user/prism/projects/${pid}/round/prepare`, { token, body: {} });
  const tk = await http('POST', `/user/prism/projects/${pid}/ws-ticket`, { token, body: {} });
  const { sessionId, wsToken } = unwrap(tk.json);
  let completed = false;
  await new Promise((resolve) => {
    let done = false;
    const ws = new WebSocket(wsUrl(sessionId, wsToken));
    const timer = setTimeout(() => fin(), TURN_TIMEOUT);
    function fin() { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch {} resolve(); }
    ws.onopen = () => ws.send(JSON.stringify({ type: 'user_message', content }));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
      if (m.type === 'message_complete') { completed = true; fin(); }
      else if (m.type === 'error') fin();
    };
    ws.onclose = () => fin();
  });
  return completed;
}

// ── CDP ─────────────────────────────────────────────────────────────────────
let cmdId = 0;
const pendingCmd = new Map();
const jsErrors = [];
function cdpSend(ws, method, params = {}) {
  const id = ++cmdId;
  return new Promise((res, rej) => {
    pendingCmd.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pendingCmd.has(id)) { pendingCmd.delete(id); rej(new Error('cdp timeout ' + method)); } }, 30000);
  });
}
async function evaluate(ws, expr) {
  const r = await cdpSend(ws, 'Runtime.evaluate', { expression: `(${expr})()`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}
async function navigate(ws, url) {
  await cdpSend(ws, 'Page.navigate', { url });
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    const rs = await evaluate(ws, `() => document.readyState`).catch(() => '');
    if (rs === 'complete') break;
  }
  await sleep(800);
}
async function shot(ws, name) {
  const r = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  const p = join(SHOTS, name);
  writeFileSync(p, Buffer.from(r.data, 'base64'));
  return p;
}
const ok = (b) => (b ? 'PASS' : 'FAIL');

async function main() {
  const results = [];
  const rec = (label, pass, extra = '') => { results.push({ label, pass }); console.log(`  ${ok(pass)} ${label}${extra ? ' — ' + extra : ''}`); };

  const token = await login();
  console.log('[ui] login OK');
  const cp = await http('POST', '/user/prism/projects', { token, body: { title: 'UI 流程测试' } });
  const pid = unwrap(cp.json)?.project?.id;
  if (!pid) throw new Error('create project failed');
  console.log(`[ui] project ${pid} created; running multi-file round (1-4min)…`);
  const done = await runRound(token, pid,
    '把这篇中文论文(用 ctex)搭成多文件工程:main.tex 用 \\input 引入 sections/intro.tex 与 sections/method.tex;' +
    '在 method 里放一个 pgfplots 折线图(数据写 data/d.dat 再 \\addplot table)和一个 booktabs 三线表,都带 caption 和 label。');
  console.log(`[ui] round done=${done}`);
  const pend = unwrap((await http('GET', `/user/prism/projects/${pid}/round/pending`, { token })).json)?.files ?? [];
  console.log(`[ui] pending files: ${pend.map((f) => f.rel_path).join(', ')}`);

  // launch headless chrome
  const profile = `/tmp/prism-cdp-${pid}`;
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1500,950', 'about:blank',
  ], { stdio: 'ignore', detached: false });

  let ws;
  try {
    // wait for CDP + page target
    let target;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch { /* not up yet */ }
    }
    if (!target) throw new Error('CDP page target not found');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cdp ws fail')); });
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
      if (m.id && pendingCmd.has(m.id)) { const { res, rej } = pendingCmd.get(m.id); pendingCmd.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'exception');
    };
    await cdpSend(ws, 'Page.enable');
    await cdpSend(ws, 'Runtime.enable');
    await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });

    // inject session, open project
    await navigate(ws, `${BASE}/`);
    await evaluate(ws, `() => { localStorage.setItem('auth_token', ${JSON.stringify(token)}); document.cookie='scholay_token=${token}; path=/'; return true; }`);
    await navigate(ws, `${BASE}/prism?p=${pid}`);

    // poll for awaiting multi-file diff UI
    let ui;
    for (let i = 0; i < 40; i++) {
      ui = await evaluate(ws, `() => {
        const tabs=[...document.querySelectorAll('[data-testid="prism-pending-tab"]')];
        return {
          tabCount: tabs.length,
          tabRels: tabs.map(t=>t.getAttribute('data-rel')),
          hasApply: !!document.querySelector('[data-testid="prism-apply"]'),
          hasCompile: !!document.querySelector('[data-testid="prism-compile"]'),
          diffMarks: document.querySelectorAll('.cm-changedLine,.cm-deletedChunk,.cm-changedText,.cm-insertedLine,.cm-deletedText').length,
          aiChange: document.body.innerText.includes('AI 改动'),
        };
      }`).catch(() => null);
      if (ui && ui.hasApply && ui.tabCount >= 1) break;
      await sleep(1000);
    }
    console.log('[ui] rendered state:', JSON.stringify(ui));
    await shot(ws, '1-multifile-diff.png');

    console.log('\n[ASSERT UI]');
    rec('页面无 JS 异常', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
    rec('多文件 pending tabs 渲染 (>=2)', (ui?.tabCount ?? 0) >= 2, `tabs=${(ui?.tabRels || []).join(', ')}`);
    rec('待应用卡片「应用」按钮存在', !!ui?.hasApply);
    rec('diff 红删绿增已渲染', (ui?.diffMarks ?? 0) > 0, `marks=${ui?.diffMarks}`);

    // switch to 2nd file tab
    if ((ui?.tabCount ?? 0) >= 2) {
      const switched = await evaluate(ws, `() => { const t=document.querySelectorAll('[data-testid="prism-pending-tab"]'); if(t[1]){t[1].click(); return t[1].getAttribute('data-rel');} return null; }`);
      await sleep(900);
      await shot(ws, '2-switch-file.png');
      rec('切换到第 2 个文件 tab', !!switched, switched || '');
    }

    // per-hunk: reject one chunk via floating control (if present)
    const rejected = await evaluate(ws, `() => { const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('撤销此处')); if(b){b.click(); return true;} return false; }`);
    if (rejected) { await sleep(600); await shot(ws, '3-per-hunk-reject.png'); }
    rec('per-hunk「撤销此处」控件可用', rejected || (ui?.diffMarks ?? 0) === 0, rejected ? '已点一次' : '该文件无可取舍 hunk');

    // apply
    const clickedApply = await evaluate(ws, `() => { const b=document.querySelector('[data-testid="prism-apply"]'); if(b){b.click(); return true;} return false; }`);
    let afterApply;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      afterApply = await evaluate(ws, `() => ({ stillAwaiting: !!document.querySelector('[data-testid="prism-apply"]'), applied: document.body.innerText.includes('已应用') })`).catch(() => null);
      if (afterApply && !afterApply.stillAwaiting) break;
    }
    await shot(ws, '4-applied.png');
    rec('点「应用」后 pending 清空(已固化)', !!clickedApply && afterApply && !afterApply.stillAwaiting);

    // compile → PDF
    const pollPdf = async (n) => { for (let i = 0; i < n; i++) { await sleep(2000); const p = await evaluate(ws, `() => !!document.querySelector('canvas') || document.body.innerText.includes('下载')`).catch(() => false); if (p) return true; } return false; };
    await evaluate(ws, `() => { const b=document.querySelector('[data-testid="prism-compile"]'); if(b) b.click(); return true; }`);
    let pdf = await pollPdf(45);
    let viaFix = false;
    if (!pdf) {
      // 首次编译没出 PDF(LLM 生成的 LaTeX 可能有语法错)→ 走「让 AI 修复」回路恢复。
      console.log('[ui] 首次未出 PDF → 触发「让 AI 修复」回路…');
      const clickedFix = await evaluate(ws, `() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('修复')); if(b){b.click(); return true;} return false; }`);
      if (clickedFix) {
        viaFix = true;
        for (let i = 0; i < 70; i++) { await sleep(3000); const has = await evaluate(ws, `() => !!document.querySelector('[data-testid="prism-apply"]')`).catch(() => false); if (has) break; }
        await shot(ws, '6-fix-round.png');
        await evaluate(ws, `() => { const b=document.querySelector('[data-testid="prism-apply"]'); if(b) b.click(); return true; }`);
        for (let i = 0; i < 20; i++) { await sleep(1000); const still = await evaluate(ws, `() => !!document.querySelector('[data-testid="prism-apply"]')`).catch(() => true); if (!still) break; }
        await evaluate(ws, `() => { const b=document.querySelector('[data-testid="prism-compile"]'); if(b) b.click(); return true; }`);
        pdf = await pollPdf(45);
      }
    }
    await shot(ws, '5-compiled-pdf.png');
    rec('编译出 PDF 在界面渲染' + (viaFix ? '(经「让 AI 修复」回路恢复)' : ''), pdf);

    // API cross-check
    const proj = unwrap((await http('GET', `/user/prism/projects/${pid}`, { token })).json);
    const dbFiles = (proj.files || []).map((f) => f.rel_path);
    rec('文件已落库 (>=2)', dbFiles.length >= 2, dbFiles.join(', '));

    const pass = results.filter((r) => r.pass).length;
    console.log(`\n==== UI SUMMARY: ${pass}/${results.length} PASS ====`);
    console.log('screenshots →', SHOTS);
    if (jsErrors.length) console.log('JS errors:', jsErrors.slice(0, 5));
    process.exitCode = pass === results.length ? 0 : 1;
  } finally {
    try { ws?.close(); } catch {}
    try { process.kill(-chrome.pid); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
  }
}

main().catch((e) => { console.error('[ui] fatal:', e.message); process.exit(2); });
