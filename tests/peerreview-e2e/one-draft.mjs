// ============================================================================
// 智能审稿 — 「每用户每模式一个草稿」get-or-create 收口 E2E (bun)
//
// 验证修复后:反复 POST /submissions(= 前端 lazy create 走的入口)只会复用同一条
// 草稿, 不再每次新建堆积;不同 mode 各一条;DB 唯一索引兜底并发。
//
// 鉴权: PR_E2E_TOKEN(JWT) 或 admin/login 兜底。
// ============================================================================

const BASE = process.env.PR_E2E_BASE || 'http://localhost:5411';
const API = '/api/v1';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const unwrap = (j) => (j && j.data && typeof j.data === 'object' ? j.data : j);

async function http(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { _raw: t }; }
  return { status: res.status, json: j };
}
async function token() {
  if (process.env.PR_E2E_TOKEN) return process.env.PR_E2E_TOKEN;
  const r = await http('POST', '/admin/login', null, { username: 'admin', password: 'adminadmin' });
  return unwrap(r.json).token;
}
const createDraft = async (tk, mode) => unwrap((await http('POST', '/user/peer-review/submissions', tk, { mode })).json);
const listSubs = async (tk) => unwrap((await http('GET', '/user/peer-review/submissions', tk)).json);

async function main() {
  const tk = await token();
  console.log('[one-draft] token OK');

  // 起点:清掉本用户已有草稿, 保证从干净态开始(只删 draft, 不碰已完成)
  const before = await listSubs(tk);
  const beforeItems = (before.items || before || []);
  for (const s of beforeItems) {
    if (s.status === 'draft') await http('DELETE', `/user/peer-review/submissions/${s.id}`, tk);
  }

  // journal: 连发 3 次 create —— 应全部复用同一条
  const j1 = await createDraft(tk, 'journal');
  const j2 = await createDraft(tk, 'journal');
  const j3 = await createDraft(tk, 'journal');
  check('journal: create 返回有效 id', !!j1?.id, `id=${j1?.id}`);
  check('journal: 第2次 create 复用同一草稿', j2?.id === j1?.id, `${j1?.id} vs ${j2?.id}`);
  check('journal: 第3次 create 复用同一草稿', j3?.id === j1?.id, `${j1?.id} vs ${j3?.id}`);

  // thesis: 不同 mode 应是另一条, 但其内部也复用
  const t1 = await createDraft(tk, 'thesis');
  const t2 = await createDraft(tk, 'thesis');
  check('thesis: 与 journal 草稿不同', t1?.id && t1.id !== j1.id, `journal=${j1?.id} thesis=${t1?.id}`);
  check('thesis: 第2次 create 复用同一草稿', t2?.id === t1?.id, `${t1?.id} vs ${t2?.id}`);

  // 并发 backstop:同时发 5 个 journal create, 全部应收敛到同一条(DB 唯一索引 + 1062 回查)
  const burst = await Promise.all(Array.from({ length: 5 }, () => createDraft(tk, 'journal')));
  const burstIds = new Set(burst.map((b) => b?.id).filter(Boolean));
  check('并发 5 次 create 收敛到 1 条', burstIds.size === 1 && burstIds.has(j1.id), `ids=${[...burstIds].join(',')}`);

  // 最终 DB 视角:该用户当前 draft 数量(journal+thesis)= 恰好 2
  const after = await listSubs(tk);
  const drafts = (after.items || after || []).filter((s) => s.status === 'draft');
  const jDrafts = drafts.filter((s) => s.mode === 'journal').length;
  const tDrafts = drafts.filter((s) => s.mode === 'thesis').length;
  check('journal 草稿恰好 1 条', jDrafts === 1, `count=${jDrafts}`);
  check('thesis 草稿恰好 1 条', tDrafts === 1, `count=${tDrafts}`);

  // 清理
  for (const s of drafts) await http('DELETE', `/user/peer-review/submissions/${s.id}`, tk);

  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== one-draft: ${results.length - fails.length}/${results.length} PASS ===`);
  if (fails.length) { console.log('FAILED:', fails.map((f) => f.name).join(' | ')); process.exit(1); }
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
