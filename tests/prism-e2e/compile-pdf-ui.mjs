// ============================================================================
// Prism — 确定性验证「UI 里编译 → PDF 渲染」(headless Chrome via CDP, bun)
//
// 避开 LLM 生成 LaTeX 的不确定性:用 API 写入一份已知可编译的中文文档(ctex+pgfplots+booktabs),
// 再在真实 /prism 界面点「编译」,断言右侧 PdfViewer 渲染出 PDF(canvas)且无错误卡片,并截图。
// 与 extreme.mjs(后端复杂文档→144KB PDF)+ ui-flow.mjs(多文件 diff/apply/per-hunk)互补,
// 补齐「浏览器里看到 PDF」这一环。
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
const PORT = 9222;
const apiUrl = (p) => `${BASE}${API}${p}`;
const unwrap = (j) => (j && j.data && typeof j.data === 'object' ? j.data : j);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { _raw: t }; }
  return { status: res.status, json: j };
}
async function login() {
  if (process.env.PRISM_E2E_TOKEN) return process.env.PRISM_E2E_TOKEN;
  const r = await http('POST', '/admin/login', { body: { username: 'admin', password: 'adminadmin' } });
  const t = unwrap(r.json)?.token; if (!t) throw new Error('login failed'); return t;
}

const GOOD_TEX = String.raw`\documentclass[11pt]{ctexart}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath}
\usepackage{booktabs}
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
\title{编译与 PDF 渲染验证文档}
\author{E2E}
\date{\today}
\begin{document}
\maketitle
\section{引言}
这是一份用于验证编译与 PDF 渲染的中文文档,包含公式、图和表。质能方程为 \(E = mc^2\)。
\section{图与表}
\begin{figure}[ht]
\centering
\begin{tikzpicture}
\begin{axis}[width=0.7\linewidth, xlabel={Epoch}, ylabel={Loss}, grid=both]
\addplot coordinates {(1,0.90) (2,0.61) (3,0.42) (4,0.31) (5,0.25)};
\end{axis}
\end{tikzpicture}
\caption{训练损失曲线。}
\label{fig:loss}
\end{figure}
如图~\ref{fig:loss} 所示,损失随训练下降;表~\ref{tab:res} 给出方法对比。
\begin{table}[ht]
\centering
\caption{方法对比。}
\label{tab:res}
\begin{tabular}{lcc}
\toprule
方法 & 准确率 (\%) & F1 \\
\midrule
基线 & 88.5 & 0.87 \\
本文 & \textbf{93.1} & \textbf{0.92} \\
\bottomrule
\end{tabular}
\end{table}
\end{document}
`;

// ── CDP ──
let cmdId = 0; const pend = new Map(); const jsErr = [];
function send(ws, method, params = {}) {
  const id = ++cmdId;
  return new Promise((res, rej) => { pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pend.has(id)) { pend.delete(id); rej(new Error('timeout ' + method)); } }, 30000); });
}
async function evaluate(ws, expr) {
  const r = await send(ws, 'Runtime.evaluate', { expression: `(${expr})()`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}
async function navigate(ws, url) { await send(ws, 'Page.navigate', { url }); for (let i = 0; i < 60; i++) { await sleep(300); const rs = await evaluate(ws, '() => document.readyState').catch(() => ''); if (rs === 'complete') break; } await sleep(800); }
async function shot(ws, name) { const r = await send(ws, 'Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name), Buffer.from(r.data, 'base64')); }

async function main() {
  const token = await login();
  console.log('[pdf-ui] login OK');
  const cp = await http('POST', '/user/prism/projects', { token, body: { title: 'PDF 渲染验证' } });
  const proj = unwrap(cp.json);
  const pid = proj?.project?.id;
  const mainId = (proj.files || []).find((f) => f.rel_path === 'main.tex')?.id;
  if (!pid || !mainId) throw new Error('create project failed');
  // 写入已知可编译文档
  await http('PUT', `/user/prism/projects/${pid}/files/${mainId}`, { token, body: { body: GOOD_TEX } });
  console.log(`[pdf-ui] project ${pid}: wrote known-good main.tex`);

  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/prism-pdf-${pid}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    let target;
    for (let i = 0; i < 40; i++) { await sleep(300); try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); if (target) break; } catch {} }
    if (!target) throw new Error('no CDP target');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; } if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params?.exceptionDetails?.exception?.description || 'exc'); };
    await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable');
    await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });

    await navigate(ws, `${BASE}/`);
    await evaluate(ws, `() => { localStorage.setItem('auth_token', ${JSON.stringify(token)}); document.cookie='scholay_token=${token}; path=/'; return true; }`);
    await navigate(ws, `${BASE}/prism?p=${pid}`);
    // 等编译按钮就绪
    for (let i = 0; i < 30; i++) { const ready = await evaluate(ws, `() => !!document.querySelector('[data-testid="prism-compile"]')`).catch(() => false); if (ready) break; await sleep(800); }
    await evaluate(ws, `() => { const b=document.querySelector('[data-testid="prism-compile"]'); if(b) b.click(); return true; }`);

    let state = {};
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      state = await evaluate(ws, `() => ({ pdf: !!document.querySelector('canvas'), download: document.body.innerText.includes('PDF 预览'), err: document.body.innerText.includes('编译失败') })`).catch(() => ({}));
      if (state.pdf || state.err) break;
    }
    await shot(ws, '7-deterministic-pdf.png');
    console.log('[pdf-ui] state:', JSON.stringify(state), 'jsErr:', jsErr.length);
    const pass = !!state.pdf && !state.err;
    console.log(`\n  ${pass ? 'PASS' : 'FAIL'} UI 编译已知可编译文档 → PDF canvas 渲染 (err=${!!state.err})`);
    console.log('screenshot → tests/prism-e2e/shots/7-deterministic-pdf.png');
    process.exitCode = pass ? 0 : 1;
  } finally { try { ws?.close(); } catch {} try { chrome.kill('SIGKILL'); } catch {} }
}
main().catch((e) => { console.error('[pdf-ui] fatal:', e.message); process.exit(2); });
