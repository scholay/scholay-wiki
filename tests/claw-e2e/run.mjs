// ============================================================================
// Claw 智能助手 — E2E 场景跑测器 (bun tests/claw-e2e/run.mjs)
//
// 读 scenarios.json (workflow 生成的学术对话场景全集), 逐个场景驱动真实 claw HTTP+WS API,
// 断言「结构性不变量」+ 记录观测信号 (frames / toolUses / artifacts), 产出报告。
//
// ⚠️ 这是 SMOKE + 结构harness, 不评判 LLM 文本质量 (那是非确定的)。它回答的是:
//   「系统对这类(含奇葩/对抗)学术对话, 是否健壮地处理 —— 不卡死、不 5xx、WS 不崩、
//    拿到终态帧、该出产物的出了产物、越权/穿越被挡」。LLM 内容好坏需人工抽查报告。
//
// 前置: 整套 stack 起着 (docker compose up -d) + agent 配好可用 provider/key。
// 配置 (env): CLAW_E2E_BASE(默认 http://localhost:5411) + CLAW_E2E_EMAIL + CLAW_E2E_PASSWORD
//            (或 CLAW_E2E_TOKEN 直接给 JWT)。详见 driver.mjs / README.md。
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import * as d from './driver.mjs';

const catalogUrl = new URL('./scenarios.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8'));
const scenarios = catalog.scenarios || [];
const globalInvariants = catalog.globalInvariants || [];

const ONLY = process.env.CLAW_E2E_ONLY || ''; // 子串过滤 id/category, 调试单场景用
const MAX = Number(process.env.CLAW_E2E_MAX || 0); // 限跑前 N 个

// synthUpload —— 按 uploadHint 造一个尽量贴切的占位文件, 让 needsUpload 场景能自洽跑通。
// 真 PDF/图片难以凭空造有效字节, 用文本占位并在报告里标注 (stand-in)。
function synthUpload(hint) {
  const h = (hint || '').toLowerCase();
  if (h.includes('csv') || h.includes('数据') || h.includes('表格') || h.includes('data')) {
    return {
      name: 'sample-data.csv',
      type: 'text/csv',
      bytes:
        'group,n,mean,sd\nA,30,12.4,2.1\nB,28,15.9,3.4\nC,31,11.2,1.8\n,,,\nD,29,,2.0\n', // 含一个缺失值行
      standIn: false,
    };
  }
  if (h.includes('json')) {
    return { name: 'sample.json', type: 'application/json', bytes: '{"items":[{"x":1},{"x":2}]}', standIn: false };
  }
  // pdf / 论文 / 图片 → 用文本占位 (agent 仍可 Read; 标注为占位, 内容代表性有限)
  return {
    name: 'sample-paper.txt',
    type: 'text/plain',
    bytes:
      'Title: A Stand-in Academic Paper\nAbstract: This is a placeholder used by the E2E harness ' +
      'in lieu of a real PDF. Methods: synthetic. Results: n/a. Limitations: this is not a real paper.\n',
    standIn: true,
  };
}

// 数据源/内部实现泄露黑名单 (来自全局不变量): 助手文本只能用 Graph/Discovery/Medicine 品牌,
// 绝不能暴露真实库名或内部工具/enum。HARD = 明确内部泄露(判 FAIL); SOFT = 真实库名(判 WARN,
// 因为论文标题等偶尔可能含同名词, 留人工复核)。
const HARD_LEAK = ['mcp__minicod__', 'source 参数', 'SmartSearchSystemPrompt', 'ClawSystemPrompt'];
const SOFT_LEAK = ['semantic scholar', 'openalex', 'pubmed', 'ncbi', 'e-utilities'];
function scanLeaks(text) {
  const low = (text || '').toLowerCase();
  return {
    hard: HARD_LEAK.filter((k) => low.includes(k.toLowerCase())),
    soft: SOFT_LEAK.filter((k) => low.includes(k.toLowerCase())),
  };
}

function mentions(strs, ...needles) {
  const blob = (Array.isArray(strs) ? strs.join(' ') : String(strs || '')).toLowerCase();
  return needles.some((n) => blob.includes(n.toLowerCase()));
}

// expectsDelivery —— 该场景是否应当产出可下载产物 (用于软断言 artifacts 非空)。
function expectsDelivery(s) {
  if (s.category === 'delivery') return true;
  return mentions(s.structuralAssertions, 'artifact', '产物', '下载', '.csv', '.md', '.png', 'manifest', 'out/');
}

// expectsErrorOk —— 该场景出现 error 帧是否「在预期内」(配额耗尽/越权/非法输入等对抗场景)。
function expectsErrorOk(s) {
  return (
    s.category === 'adversarial' ||
    s.category === 'edge' ||
    !!(s.weirdness && s.weirdness.trim()) ||
    mentions(s.structuralAssertions, 'error', 'quota', '配额', '拒绝', '4xx', '越权', 'reject')
  );
}

async function runScenario(token, s) {
  const obs = { id: s.id, domain: s.domain, category: s.category, title: s.title };
  let sessionId;
  try {
    sessionId = await d.newSession(token); // 每场景独立会话, 隔离产物/上下文
  } catch (e) {
    return { ...obs, status: 'FAIL', reason: `建会话失败: ${e.message}` };
  }

  const notes = [];
  // 上传 (如需)
  if (s.needsUpload) {
    const f = synthUpload(s.uploadHint);
    if (f.standIn) notes.push(`上传用文本占位代替 (${s.uploadHint || 'file'})`);
    try {
      const up = await d.upload(token, sessionId, f.name, f.bytes, f.type);
      if (up.status >= 400) notes.push(`上传返回 ${up.status}`);
      if (up.attachment?.sessionId) sessionId = up.attachment.sessionId; // adopt
    } catch (e) {
      notes.push(`上传异常: ${e.message}`);
    }
  }

  // 逐轮发送
  const turns = [];
  let lastTurn = null;
  let fullText = '';
  for (const msg of s.userMessages.length ? s.userMessages : ['']) {
    try {
      lastTurn = await d.runTurn(token, sessionId, { content: msg });
    } catch (e) {
      lastTurn = { errored: true, errorMessage: `WS异常: ${e.message}`, completed: false, timedOut: false, types: [], toolUses: [], text: '', frames: [] };
    }
    fullText += lastTurn.text || '';
    turns.push({
      sent: msg.slice(0, 80),
      completed: lastTurn.completed,
      errored: lastTurn.errored,
      errorMessage: lastTurn.errorMessage,
      timedOut: lastTurn.timedOut,
      displaced: lastTurn.displaced,
      toolUses: lastTurn.toolUses,
      textLen: lastTurn.text.length,
      durationMs: lastTurn.durationMs,
    });
  }

  // 产物
  let artifacts = [];
  try {
    const a = await d.listArtifacts(token, sessionId);
    artifacts = a.items;
  } catch (e) {
    notes.push(`产物列举异常: ${e.message}`);
  }

  // ── 判定 ──────────────────────────────────────────────────────────────
  const reachedTerminal = !!lastTurn && (lastTurn.completed || lastTurn.errored);
  const hung = !!lastTurn && lastTurn.timedOut;
  let status = 'PASS';
  const reasons = [];

  if (hung || !reachedTerminal) {
    status = 'FAIL';
    reasons.push('未在超时内拿到终态帧 (可能卡死/WS 崩)');
  }
  if (lastTurn?.errored && !expectsErrorOk(s)) {
    status = status === 'FAIL' ? 'FAIL' : 'WARN';
    reasons.push(`非预期 error 帧: ${lastTurn.errorMessage}`);
  }
  if (expectsDelivery(s) && artifacts.length === 0 && status === 'PASS') {
    status = 'WARN';
    reasons.push('期望有可下载产物, 但 ./out 为空 (LLM 未交付? 需人工看)');
  }

  const leaks = scanLeaks(fullText);
  if (leaks.hard.length) {
    status = 'FAIL';
    reasons.push(`内部实现泄露: ${leaks.hard.join(', ')}`);
  } else if (leaks.soft.length && status !== 'FAIL') {
    status = 'WARN';
    reasons.push(`疑似真实数据源名泄露(需复核): ${leaks.soft.join(', ')}`);
  }

  return {
    ...obs,
    status,
    reasons,
    notes,
    weirdness: s.weirdness || '',
    declaredAssertions: s.structuralAssertions || [], // 供人工对照
    observed: {
      turns,
      artifacts: artifacts.map((x) => x.name),
      toolUses: [...new Set(turns.flatMap((t) => t.toolUses))],
      leaks,
    },
  };
}

async function main() {
  console.log(`[claw-e2e] base=${d.CONFIG.base}  scenarios=${scenarios.length}`);
  const token = await d.login();
  console.log('[claw-e2e] logged in OK');

  let list = scenarios;
  if (ONLY) list = list.filter((s) => `${s.id} ${s.category} ${s.domain}`.toLowerCase().includes(ONLY.toLowerCase()));
  if (MAX > 0) list = list.slice(0, MAX);

  const results = [];
  let i = 0;
  for (const s of list) {
    i++;
    process.stdout.write(`[${i}/${list.length}] ${s.domain}/${s.id} ... `);
    const r = await runScenario(token, s);
    results.push(r);
    console.log(`${r.status}${r.reasons.length ? ' — ' + r.reasons.join('; ') : ''}`);
  }

  const counts = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  const report = {
    base: d.CONFIG.base,
    total: results.length,
    counts,
    globalInvariants,
    results,
  };
  writeFileSync(new URL('./last-report.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log('\n==== SUMMARY ====');
  console.log(JSON.stringify(counts));
  console.log('report → tests/claw-e2e/last-report.json');
  // 退出码: 有 FAIL → 1 (供 CI), 仅 WARN/PASS → 0。
  process.exit((counts.FAIL || 0) > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[claw-e2e] fatal:', e.message);
  process.exit(2);
});
