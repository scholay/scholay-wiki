#!/usr/bin/env node
/**
 * 录制真实后端响应为契约 fixture(取代手写 seed,让契约测试对照真值)。
 *
 * 用法(本地起好 docker、用真实账号登录后,从 localStorage.auth_token 取 JWT):
 *   BASE_URL=http://localhost:5411/api/v1 TOKEN=<jwt> node tests/contract/record.mjs
 *
 * 录完 `git diff tests/contract/fixtures/` 看后端是否动了字段;再 `npm run test:contract`。
 * 注:WS 帧(ws-error-quota.json)无法用 HTTP 录制 —— 触发一次额度耗尽、从真实 WS 抓一帧手动更新。
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://localhost:5411/api/v1';
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error('需要 TOKEN=<jwt>(登录后从 localStorage.auth_token 取)。');
  process.exit(1);
}

// 只录「驱动 UI 分支」的行为关键端点。新增契约时往这里加一行。
const targets = [
  { name: 'vip-overview.json', url: '/user/membership' },
];

let failed = false;
for (const t of targets) {
  try {
    const res = await fetch(BASE + t.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const body = await res.json();
    writeFileSync(path.join(here, 'fixtures', t.name), JSON.stringify(body, null, 2) + '\n');
    console.log(`✓ recorded ${t.name} (HTTP ${res.status})`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${t.name}: ${e?.message ?? e}`);
  }
}
if (failed) process.exit(1);
console.log('完成。WS 帧需手动从真实会话更新(见文件头说明)。');
