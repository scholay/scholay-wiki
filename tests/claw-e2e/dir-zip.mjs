// ============================================================================
// Claw 智能助手 — 目录产物 → zip 打包下载 E2E (bun tests/claw-e2e/dir-zip.mjs)
//
// 验证「多文件交付」全链路:
//   1. 新会话(吃到新 prompt)→ 让 agent 在 ./out/<dir>/ 下产出多个文件
//   2. GET /artifacts → 该子目录作为 kind:"dir" 产物列出(根文件仍是 kind:"file")
//   3. GET /artifact.zip?dir=out/<dir> → 合法 zip, 含目录内全部文件
//   4. 安全: 路径穿越 dir=../.. / 非 out 前缀 被挡
//
// 前置: stack 起着 + agent 有可用 provider/key。
// 鉴权: CLAW_E2E_TOKEN(JWT) 或 admin/login 兜底。
// ============================================================================

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as d from './driver.mjs';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function adminToken() {
  if (process.env.CLAW_E2E_TOKEN) return process.env.CLAW_E2E_TOKEN;
  const res = await fetch(`${d.CONFIG.base}${d.CONFIG.apiBase}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'adminadmin' }),
  });
  const j = await res.json();
  const t = (j.data || j)?.token;
  if (!t) throw new Error('admin login failed: ' + JSON.stringify(j).slice(0, 200));
  return t;
}

// 直接拉 zip 字节(driver 只有文本下载, 这里要二进制)。
async function downloadZip(token, sessionId, dir) {
  const q = new URLSearchParams({ session_id: sessionId, dir });
  const res = await fetch(
    `${d.CONFIG.base}${d.CONFIG.apiBase}/user/claw/session/artifact.zip?${q.toString()}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  const buf = new Uint8Array(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    disposition: res.headers.get('content-disposition') || '',
    bytes: buf,
  };
}

function isZip(bytes) {
  // 本地 file header 魔数 "PK\x03\x04"
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function zipEntries(bytes) {
  const p = join(tmpdir(), `claw-zip-${bytes.length}-${bytes[10] ?? 0}.zip`);
  writeFileSync(p, bytes);
  const out = execFileSync('unzip', ['-l', p], { encoding: 'utf8' });
  // 解析 "Length Date Time Name" 表, 取文件名列(最后一段)
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+\s/.test(l))
    .map((l) => l.split(/\s+/).slice(3).join(' '))
    .filter(Boolean);
}

async function main() {
  const token = await adminToken();
  console.log('[dir-zip] token OK');

  // 全新会话 → 确保吃到「多文件放子目录」的新 prompt
  const sid = await d.newSession(token);
  console.log('[dir-zip] new session', sid);

  const prompt =
    '请帮我准备一份「锂电池研究」的多文件交付包。务必在交付目录 ./out/ 下新建一个子目录 ' +
    'libattery,并在该子目录里创建三个文件:summary.md(写两三句研究简介)、' +
    'data.csv(写一个含表头的小表格,4 行数据)、refs.txt(列三条参考文献)。' +
    '这是一个需要多个文件一起交付的成品,请放进同一个子目录。';

  const turn = await d.runTurn(token, sid, { content: prompt }, { timeoutMs: 240000 });
  check('turn completed', turn.completed && !turn.errored, turn.errored ? turn.errorMessage : `${turn.durationMs}ms, tools=${turn.toolUses.join(',')}`);

  const { status, items } = await d.listArtifacts(token, sid);
  console.log('[dir-zip] artifacts:', JSON.stringify(items));
  check('artifacts list 200', status === 200, `status=${status}`);

  const dirArt = items.find((a) => a.kind === 'dir');
  check('a dir artifact is listed', !!dirArt, dirArt ? `${dirArt.path}` : `items=${items.map((i) => i.name + ':' + (i.kind || 'file')).join(', ')}`);

  if (dirArt) {
    check('dir artifact path under out/', dirArt.path.startsWith('out/') && dirArt.path.split('/').length === 2, dirArt.path);

    const zip = await downloadZip(token, sid, dirArt.path);
    check('zip download 200', zip.status === 200, `status=${zip.status}`);
    check('zip content-type application/zip', zip.contentType.includes('zip'), zip.contentType);
    check('zip disposition attachment .zip', /attachment/.test(zip.disposition) && /\.zip/.test(zip.disposition), zip.disposition);
    check('zip magic bytes valid', isZip(zip.bytes), `len=${zip.bytes.length}`);

    if (isZip(zip.bytes)) {
      let entries = [];
      try { entries = zipEntries(zip.bytes); } catch (e) { console.log('unzip -l failed:', e.message); }
      console.log('[dir-zip] zip entries:', entries);
      check('zip has >=2 files (multi-file bundle)', entries.length >= 2, `entries=${entries.join(', ')}`);
      const hasMd = entries.some((e) => e.endsWith('.md'));
      check('zip preserves file names', hasMd, entries.join(', '));
    }
  }

  // 安全: 路径穿越 / 非 out 前缀必须被挡(非 200)
  const evil1 = await downloadZip(token, sid, '../../etc');
  check('traversal ../../etc blocked', evil1.status !== 200, `status=${evil1.status}`);
  const evil2 = await downloadZip(token, sid, 'out/../..');
  check('traversal out/../.. blocked', evil2.status !== 200, `status=${evil2.status}`);
  const evil3 = await downloadZip(token, sid, 'workspace');
  check('non-out prefix blocked', evil3.status !== 200, `status=${evil3.status}`);

  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== dir-zip: ${results.length - fails.length}/${results.length} PASS ===`);
  if (fails.length) {
    console.log('FAILED:', fails.map((f) => f.name).join(' | '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
