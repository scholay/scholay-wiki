// ============================================================================
// Claw — 多文件交付 下载卡「按轮归属」DOM 校验 (headless Chrome via CDP)
//
// 前置: dir-zip.mjs + dir-zip-followup.mjs 已跑过, 会话有 3 轮:
//   轮A 建 out/<dir>/* → 出卡   轮B 纯问答 → 不出卡   轮C 往同目录加文件 → 出卡
// 校验: 页面恰好 2 张 zip 下载卡(=改到文件的轮数), 纯问答那轮的 <article> 没有卡。
//
// env: CLAW_E2E_TOKEN(JWT 必填或 admin/login 兜底)
// ============================================================================

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.CLAW_E2E_BASE || 'http://localhost:5411';
const API = '/api/v1';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(SHOTS, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9244;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function adminToken() {
  if (process.env.CLAW_E2E_TOKEN) return process.env.CLAW_E2E_TOKEN;
  const res = await fetch(`${BASE}${API}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'adminadmin' }) });
  return (await res.json()).data.token;
}

let cmdId = 0; const pendingCmd = new Map(); const jsErrors = [];
function cdpSend(ws, method, params = {}) { const id = ++cmdId; return new Promise((res, rej) => { pendingCmd.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pendingCmd.has(id)) { pendingCmd.delete(id); rej(new Error('cdp timeout ' + method)); } }, 30000); }); }
async function evaluate(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: `(${expr})()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval'); return r.result?.value; }
async function navigate(ws, url) { await cdpSend(ws, 'Page.navigate', { url }); for (let i = 0; i < 60; i++) { await sleep(300); const rs = await evaluate(ws, `() => document.readyState`).catch(() => ''); if (rs === 'complete') break; } await sleep(800); }
async function shot(ws, name) { const r = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); writeFileSync(join(SHOTS, name), Buffer.from(r.data, 'base64')); }

async function main() {
  const results = [];
  const rec = (label, pass, extra = '') => { results.push({ pass }); console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`); };
  const token = await adminToken();

  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/claw-cdp-perturn`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore', detached: false });
  let ws;
  try {
    let target;
    for (let i = 0; i < 40; i++) { await sleep(300); try { const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); if (target) break; } catch {} }
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cdp ws')); });
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; } if (m.id && pendingCmd.has(m.id)) { const { res, rej } = pendingCmd.get(m.id); pendingCmd.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params?.exceptionDetails?.text || 'ex'); };
    await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
    await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', { width: 1500, height: 1400, deviceScaleFactor: 1, mobile: false });

    await navigate(ws, `${BASE}/`);
    await evaluate(ws, `() => { localStorage.setItem('auth_token', ${JSON.stringify(token)}); document.cookie='scholay_token=${token}; path=/'; return true; }`);
    await navigate(ws, `${BASE}/claw`);

    let ui;
    for (let i = 0; i < 40; i++) {
      ui = await evaluate(ws, `() => {
        const arts = [...document.querySelectorAll('article')];
        // 每个 turn 是一个 <article>; TurnArtifacts 卡组里有 a[href*="artifact.zip"]
        const perArticle = arts.map(a => ({
          hasWrite: !!a.querySelector('[class]') && /Write/.test(a.innerText),
          zipCards: a.querySelectorAll('a[href*="artifact.zip"]').length,
          isPureChat: a.innerText.includes('固态电解质') && !/Write/.test(a.innerText),
        }));
        return {
          articleCount: arts.length,
          totalZipCards: document.querySelectorAll('a[href*="artifact.zip"]').length,
          generatedHeaders: (document.body.innerText.match(/生成的文件/g) || []).length,
          perArticle,
        };
      }`).catch(() => null);
      if (ui && ui.totalZipCards >= 2) break;
      await sleep(1000);
    }
    console.log('[ui] state:', JSON.stringify(ui));
    await shot(ws, 'dir-zip-perturn.png');

    rec('页面无 JS 异常', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
    rec('恰好 2 张 zip 下载卡(=改到文件的两轮)', ui?.totalZipCards === 2, `totalZipCards=${ui?.totalZipCards}`);
    rec('恰好 2 个「生成的文件」卡组', ui?.generatedHeaders === 2, `headers=${ui?.generatedHeaders}`);
    // 纯问答那一轮 article 内 0 张卡
    const pureChat = (ui?.perArticle || []).find((a) => a.isPureChat);
    rec('纯问答轮存在且其内 0 张下载卡', !!pureChat && pureChat.zipCards === 0, pureChat ? `zipCards=${pureChat.zipCards}` : '未找到纯问答轮');

    const pass = results.filter((r) => r.pass).length;
    console.log(`\n==== per-turn UI: ${pass}/${results.length} PASS ====`);
    if (jsErrors.length) console.log('JS errors:', jsErrors.slice(0, 5));
    process.exitCode = pass === results.length ? 0 : 1;
  } finally {
    try { ws?.close(); } catch {}
    try { process.kill(-chrome.pid); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
