// 2026-08 证据账本 P0-c:research_state 帧的**口径契约**测试。
//
// 为什么单独立一个文件钉这件事:这枚帧是「取消模型对自身过程的叙述垄断」的唯一载体 ——
// 前端 chip 直接把它渲染成「本轮检索 N 次 · 账本 M 条」印在模型输出旁边。口径一旦填错
// (最容易犯的是拿会话累计去填「本轮」),这枚本来用于揭穿的 chip 自己就变成了一条新的谎,
// 恰好是本次改造要消灭的失效模式。故用测试把口径钉死,而不是靠注释约定。
//
// 冻结契约:
//   queries      = **本轮**(turn 开头取基线,turn 末取差值 —— 与轮号无关,裁历史也不受影响)
//   ledger_total = 会话累计
//   by_origin    = 会话累计
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest, ingestPapers, loadQueries, stats } from "../evidence/ledger.ts";
import type { ParsedPaper } from "../evidence/parse.ts";

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "research-state-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function paper(id: string, title: string): ParsedPaper {
  return { paperId: `olx:${id}`, sourceCode: "olx", title, doi: `10.1234/${id}` };
}

/** 走真实咽喉点:检索类 MCP 工具的一次调用(它同时写 ledger 与 queries)。 */
function search(dir: string, turn: number, q: string, ids: string[]) {
  const items = ids.map((id) => ({ id, source: "olx", title: "T-" + id, doi: `10.1234/${id}` }));
  return ingest(dir, turn, "mcp__minicod__search_papers", { query: q }, { items, total: items.length });
}

/** 复刻 turnLoop 末尾的口径计算(基线差值);turnLoop 里是内联的,这里独立验证同一算法。 */
async function computeFrame(dir: string, baseline: number) {
  const st = await stats(dir);
  return {
    queries: Math.max(0, st.queries - baseline),
    ledger_total: st.total,
    by_origin: st.byOrigin,
  };
}

describe("research_state 口径", () => {
  test("queries 是本轮口径:第二轮不把第一轮的检索次数算进来", async () => {
    // 轮 1:检索两次
    const b1 = (await loadQueries(workDir)).length;
    await search(workDir, 1, "q1", ["W1"]);
    await search(workDir, 1, "q2", ["W2"]);
    const f1 = await computeFrame(workDir, b1);
    expect(f1.queries).toBe(2);
    expect(f1.ledger_total).toBe(2);

    // 轮 2:只检索一次 —— queries 必须是 1(本轮),不是 3(累计)
    const b2 = (await loadQueries(workDir)).length;
    await search(workDir, 2, "q3", ["W3"]);
    const f2 = await computeFrame(workDir, b2);
    expect(f2.queries).toBe(1); // ← 填成累计的话这里会是 3,chip 当场变成谎
    expect(f2.ledger_total).toBe(3); // 账本是累计口径
  });

  test("取证会话里的零检索轮:queries=0 但账本非空 —— 这一格正是要曝光的", async () => {
    await search(workDir, 1, "q1", ["W1"]);
    const b = (await loadQueries(workDir)).length;
    // 轮 2 一次检索都没有(线上「还有哪些论文呢」→ 零工具 → 凭记忆编的那一格)
    const f = await computeFrame(workDir, b);
    expect(f.queries).toBe(0);
    expect(f.ledger_total).toBe(1);
    // 发帧门槛是 total>0 || turnQueries>0 → 这一轮**必须发**(否则最该曝光的场景反而没有 chip)
    expect(f.ledger_total > 0 || f.queries > 0).toBe(true);
  });

  test("纯闲聊会话:账本空 + 零检索 → 不满足发帧门槛(不在「你好」下面印「本轮未检索」)", async () => {
    const f = await computeFrame(workDir, 0);
    expect(f.queries).toBe(0);
    expect(f.ledger_total).toBe(0);
    expect(f.ledger_total > 0 || f.queries > 0).toBe(false);
  });

  test("by_origin 是累计,且区分检索与用户提供(直接回答用户「是你检索的还是我文献库的」)", async () => {
    await search(workDir, 1, "q1", ["W1"]);
    await ingestPapers(workDir, [paper("W2", "B")], "user_text", { turn: 1, tool: "user" });
    const f = await computeFrame(workDir, 0);
    expect(f.by_origin.retrieval).toBe(1);
    expect(f.by_origin.user_text).toBe(1);
    // 用户粘贴回来的算「你提供」,不算检索接地 —— 堵死「用户回声洗白」
    expect(f.by_origin.retrieval).not.toBe(f.ledger_total);
  });

  test("基线差值与轮号无关:即使 turn 号回退(裁历史),本轮计数仍精确", async () => {
    await search(workDir, 9, "q1", ["W1"]);
    const b = (await loadQueries(workDir)).length;
    // 历史被裁 → turnOf 数出来的轮号回退到 3(ledger.ts 自述该字段只能当近似值)
    await search(workDir, 3, "q2", ["W2"]);
    const f = await computeFrame(workDir, b);
    expect(f.queries).toBe(1); // 差值不受轮号回退影响
  });
});
