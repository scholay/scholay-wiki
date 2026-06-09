// 一次性冒烟: 真实驱动 claw 一轮"数据分析→交付 csv"对话, 看接口/产物链路。
// 运行: CLAW_E2E_BASE=... CLAW_E2E_TOKEN=... bun tests/claw-e2e/smoke.mjs
import * as d from './driver.mjs';

const token = await d.login();
console.log('[smoke] token OK (len', token.length, ')');
const sid = await d.newSession(token);
console.log('[smoke] new session', sid);

const prompt =
  '请把下面三组实验数据整理成一个 CSV 文件, 保存到 ./out/experiment.csv, ' +
  '并写一份 ./out/manifest.json (artifacts: file=experiment.csv, title=实验数据汇总, description=三组对比)。' +
  '然后在回复正文用一句话说明。数据: A组 n=30 mean=12.4 sd=2.1; B组 n=28 mean=15.9 sd=3.4; C组 n=31 mean=11.2 sd=1.8。';

console.log('[smoke] sending turn (real LLM, 可能要等 30-120s) ...');
const r = await d.runTurn(token, sid, { content: prompt }, { timeoutMs: 220000 });
console.log('[smoke] completed=%s errored=%s timedOut=%s durationMs=%d', r.completed, r.errored, r.timedOut, r.durationMs);
if (r.errorMessage) console.log('[smoke] errorMessage:', r.errorMessage);
console.log('[smoke] frame types:', [...new Set(r.types)].join(', '));
console.log('[smoke] toolUses:', r.toolUses.join(', ') || '(none)');
console.log('[smoke] reply head:', r.text.slice(0, 500).replace(/\n/g, ' '));

const a = await d.listArtifacts(token, sid);
console.log('[smoke] artifacts:', JSON.stringify(a.items));
for (const it of a.items) {
  const dl = await d.downloadArtifact(token, sid, it.path, { download: true });
  console.log(`[smoke] download ${it.path} -> HTTP ${dl.status} | ${dl.contentType} | ${dl.body.length}B`);
  console.log('        head:', dl.body.slice(0, 160).replace(/\n/g, '\\n'));
}
console.log('[smoke] done.');
