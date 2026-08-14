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
// trim:数组只留前 N 项 —— 契约钉的是**形态**,全量录制会让 fixture 膨胀到几百 KB 且每次 diff 全变。
const targets = [
  { name: 'vip-overview.json', url: '/user/membership' },
  // 后台算力用量看板。需要 role=admin 的 TOKEN;成本字段(cost_micro_yuan / unpriced_*)是主单位来源。
  {
    name: 'admin-llm-usage-summary.json',
    url: '/admin/llm-token-usage/summary?days=30',
    trim: ['daily', 'by_model', 'by_feature', 'by_source', 'by_provider', 'top_users', 'daily_by_model', 'daily_by_feature'],
  },
  // 「用户端不下发额度绝对值」不变量的两个出口。schema 是 strict 的:录到绝对字段就说明后端回归了。
  { name: 'billing-plans.json', url: '/billing/plans' },
  { name: 'usage-calendar.json', url: '/user/billing/usage-calendar' },
];

let failed = false;
for (const t of targets) {
  try {
    const res = await fetch(BASE + t.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const body = await res.json();
    for (const k of t.trim ?? []) {
      if (Array.isArray(body?.data?.[k])) body.data[k] = body.data[k].slice(0, 3);
    }
    writeFileSync(path.join(here, 'fixtures', t.name), JSON.stringify(body, null, 2) + '\n');
    console.log(`✓ recorded ${t.name} (HTTP ${res.status})`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${t.name}: ${e?.message ?? e}`);
  }
}
if (failed) process.exit(1);
console.log('完成。WS 帧需手动从真实会话更新(见文件头说明)。');
