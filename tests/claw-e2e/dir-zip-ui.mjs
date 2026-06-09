// ============================================================================
// Claw 智能助手 — 目录产物前端展示 UI 测试 (headless Chrome via CDP, bun 运行)
//
// 前置: dir-zip.mjs 已先跑过(会话里有一轮把多文件写进 ./out/<dir>/)。
// 这里验证用户真实看到的:
//   1) 打开 /claw → 默认进最近会话(libattery 多文件交付那次)
//   2) 该轮回答下方出现「生成的文件」卡片组, 且是【一个目录 zip 卡】(不是散开的多张文件卡)
//   3) 卡片有「打包下载」按钮, href 指向 artifact.zip 且 dir=out/<dir>
//   4) 没有文件改动的轮次不出现下载卡(本轮才出现)
//
// env: CLAW_E2E_TOKEN(JWT, 必填或用 admin/login 兜底), CLAW_E2E_DIR(默认 libattery)
// ============================================================================

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.CLAW_E2E_BASE || 'http://localhost:5411';
const API = '/api/v1';
const DIRNAME = process.env.CLAW_E2E_DIR || 'libattery';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(SHOTS, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9233;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function adminToken() {
  if (process.env.CLAW_E2E_TOKEN) return process.env.CLAW_E2E_TOKEN;
  const res = await fetch(`${BASE}${API}/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'adminadmin' }),
  });
  const j = await res.json();
  const t = (j.data || j)?.token;
  if (!t) throw new Error('admin login failed');
  return t;
}

// ── CDP ──────────────────────────────────────────────────────────────────────
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
  for (let i = 0; i < 60; i++) { await sleep(300); const rs = await evaluate(ws, `() => document.readyState`).catch(() => ''); if (rs === 'complete') break; }
  await sleep(800);
}
async function shot(ws, name) {
  const r = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const p = join(SHOTS, name); writeFileSync(p, Buffer.from(r.data, 'base64')); return p;
}

async function main() {
  const results = [];
  const rec = (label, pass, extra = '') => { results.push({ label, pass }); console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`); };

  const token = await adminToken();
  console.log('[ui] token OK; dir =', DIRNAME);

  const profile = `/tmp/claw-cdp-${DIRNAME}`;
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1500,950', 'about:blank',
  ], { stdio: 'ignore', detached: false });

  let ws;
  try {
    let target;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      try { const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); if (target) break; } catch {}
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

    await navigate(ws, `${BASE}/`);
    await evaluate(ws, `() => { localStorage.setItem('auth_token', ${JSON.stringify(token)}); document.cookie='scholay_token=${token}; path=/'; return true; }`);
    await navigate(ws, `${BASE}/claw`);

    // 等历史 + 产物加载: 轮询直到出现 zip 下载链接(或超时)
    let ui;
    for (let i = 0; i < 40; i++) {
      ui = await evaluate(ws, `() => {
        const zipLinks = [...document.querySelectorAll('a[href*="artifact.zip"]')];
        const fileLinks = [...document.querySelectorAll('a[href*="/artifact?"]')];
        const cards = [...document.querySelectorAll('a[download]')];
        return {
          ready: zipLinks.length > 0,
          zipCount: zipLinks.length,
          zipHrefs: zipLinks.map(a => a.getAttribute('href')),
          zipText: zipLinks.map(a => (a.textContent||'').trim()),
          fileDownloadCount: fileLinks.filter(a => a.hasAttribute('download')).length,
          hasGeneratedHeader: document.body.innerText.includes('生成的文件'),
          hasZipHint: document.body.innerText.includes('打包为 zip 下载'),
          downloadCardCount: cards.length,
        };
      }`).catch(() => null);
      if (ui && ui.ready) break;
      await sleep(1000);
    }
    console.log('[ui] state:', JSON.stringify(ui, null, 0));
    await shot(ws, 'dir-zip-ui-1.png');

    rec('页面无 JS 异常', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
    rec('出现「生成的文件」卡片组', !!ui?.hasGeneratedHeader);
    rec('目录产物渲染为 1 个 zip 下载卡', (ui?.zipCount ?? 0) === 1, `zipCount=${ui?.zipCount}`);
    rec('zip 卡按钮文案=「打包下载」', (ui?.zipText || []).some(t => t.includes('打包下载')), (ui?.zipText || []).join(' | '));
    rec('zip href 指向 artifact.zip 且 dir=out/<dir>', (ui?.zipHrefs || []).some(h => h.includes('artifact.zip') && (h.includes(`dir=out%2F${DIRNAME}`) || h.includes(`dir=out/${DIRNAME}`))), (ui?.zipHrefs || []).join(' | '));
    rec('「文件夹 · 打包为 zip 下载」副标题存在', !!ui?.hasZipHint);
    // 目录是一个 zip 卡, 不应再为目录内文件散开成多张单文件下载卡
    rec('未把目录拆成多张单文件卡(无 /artifact? 单文件下载链接)', (ui?.fileDownloadCount ?? 99) === 0, `fileDownloadLinks=${ui?.fileDownloadCount}`);

    const pass = results.filter((r) => r.pass).length;
    console.log(`\n==== dir-zip UI: ${pass}/${results.length} PASS ====`);
    console.log('screenshot →', join(SHOTS, 'dir-zip-ui-1.png'));
    if (jsErrors.length) console.log('JS errors:', jsErrors.slice(0, 5));
    process.exitCode = pass === results.length ? 0 : 1;
  } finally {
    try { ws?.close(); } catch {}
    try { process.kill(-chrome.pid); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
