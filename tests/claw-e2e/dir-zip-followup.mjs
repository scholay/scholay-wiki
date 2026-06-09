// ============================================================================
// Claw — 多文件交付「续问」行为 E2E (bun tests/claw-e2e/dir-zip-followup.mjs)
//
// 接 dir-zip.mjs 的会话(env CLAW_E2E_SID, 默认最近一个), 验证用户三连问:
//   Q: 继续对话还是操作同一个目录吗?         → 续问写入 → 仍落在同一个 out/<dir>/
//   Q: 本轮没有文件改动, 还会出现下载交互吗?  → 纯问答轮 不产出新产物, 不出卡
//   Q: 有文件修改/新文件时交互是什么?         → 改到该目录的轮 → 出卡, zip 含新文件
//
// 鉴权: CLAW_E2E_TOKEN(JWT) 或 admin/login 兜底。
// ============================================================================

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as d from './driver.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };

async function adminToken() {
  if (process.env.CLAW_E2E_TOKEN) return process.env.CLAW_E2E_TOKEN;
  const res = await fetch(`${d.CONFIG.base}${d.CONFIG.apiBase}/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'adminadmin' }),
  });
  return (await res.json()).data.token;
}
async function latestSession(token) {
  const res = await fetch(`${d.CONFIG.base}${d.CONFIG.apiBase}/user/claw/sessions`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  return (j.data || j).items[0].sessionId;
}
async function downloadZip(token, sessionId, dir) {
  const q = new URLSearchParams({ session_id: sessionId, dir });
  const res = await fetch(`${d.CONFIG.base}${d.CONFIG.apiBase}/user/claw/session/artifact.zip?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
}
function zipEntries(bytes) {
  const p = join(tmpdir(), `claw-fu-${bytes.length}.zip`);
  writeFileSync(p, bytes);
  return execFileSync('unzip', ['-l', p], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim()).filter((l) => /^\d+\s/.test(l))
    .map((l) => l.split(/\s+/).slice(3).join(' ')).filter(Boolean);
}

async function main() {
  const token = await adminToken();
  const sid = process.env.CLAW_E2E_SID || (await latestSession(token));
  console.log('[followup] session', sid);

  const before = await d.listArtifacts(token, sid);
  const dirArt = before.items.find((a) => a.kind === 'dir');
  check('起始已有目录产物', !!dirArt, dirArt?.path);
  const dirName = dirArt ? dirArt.name : 'libattery';

  // 轮 B: 纯问答, 明确不要动文件
  const turnB = await d.runTurn(token, sid, { content: '不要修改或新建任何文件。请用一句话告诉我:固态电解质相比液态电解质最大的优势是什么?' }, { timeoutMs: 180000 });
  check('纯问答轮完成', turnB.completed && !turnB.errored, turnB.errored ? turnB.errorMessage : `tools=${turnB.toolUses.join(',') || '(无)'}`);
  check('纯问答轮没有写文件工具', !turnB.toolUses.some((t) => ['Write', 'Edit', 'MultiEdit'].includes(t)), `tools=${turnB.toolUses.join(',')}`);

  const afterB = await d.listArtifacts(token, sid);
  check('纯问答轮后产物数量不变', afterB.items.length === before.items.length, `${before.items.length} -> ${afterB.items.length}`);

  // 轮 C: 往同一个目录加一个新文件
  const turnC = await d.runTurn(token, sid, { content: `请在交付目录 ./out/${dirName}/ 里再新增一个文件 glossary.md, 写 3 条锂电池术语解释。放进同一个 ${dirName} 目录, 不要新建别的目录。` }, { timeoutMs: 180000 });
  check('续写轮完成', turnC.completed && !turnC.errored, turnC.errored ? turnC.errorMessage : `tools=${turnC.toolUses.join(',')}`);
  check('续写轮调用了写文件工具', turnC.toolUses.some((t) => ['Write', 'Edit', 'MultiEdit'].includes(t)), `tools=${turnC.toolUses.join(',')}`);

  const afterC = await d.listArtifacts(token, sid);
  const dirC = afterC.items.find((a) => a.kind === 'dir' && a.name === dirName);
  check('续写仍落在同一个目录(产物未新增散落)', !!dirC && afterC.items.length === before.items.length, `items=${afterC.items.map((i) => i.name).join(',')}`);

  const zip = await downloadZip(token, sid, dirC ? dirC.path : `out/${dirName}`);
  const entries = zipEntries(zip.bytes);
  console.log('[followup] zip now:', entries);
  check('同目录 zip 现在含新文件 glossary.md', entries.some((e) => e.endsWith('glossary.md')), entries.join(', '));
  check('原有文件仍在 zip 中', entries.some((e) => e.endsWith('summary.md')), entries.join(', '));

  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== followup: ${results.length - fails.length}/${results.length} PASS ===  (session ${sid})`);
  if (fails.length) { console.log('FAILED:', fails.map((f) => f.name).join(' | ')); process.exit(1); }
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
