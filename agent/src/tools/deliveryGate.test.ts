// SubmitAnswer / DeclareInsufficient 的闸契约(2026-08 证据账本 P1)。
//
// 钉两件事:
//   ① 闸的判据必须是**引擎对账本的计数**,零 LLM、零内容判断(终稿否决清单 #5)——
//      同一段答案文本,账本 0 条时拒、账本非空时放,判据与文本无关;
//   ② 不过闸时回执必须带**精确差额 + 可执行的下一步**,而不是一句「请先检索」——
//      否则模型只会一路撞 MAX_TOOL_ROUNDS(终稿 P1 风险表已点名这条)。

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { builtinRegistry } from "./registry.ts";
import { ingest, loadLedger, stats } from "../evidence/ledger.ts";
import { redactSubmittedAnswer } from "../turn/turnLoop.ts";

const submit = builtinRegistry.get("SubmitAnswer")!;
const declare = builtinRegistry.get("DeclareInsufficient")!;

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "delivery-gate-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const ctx = () => ({ workDir, allowBash: false, net: "none" as const, addDirs: [] });
const ANSWER = "水稻耐盐性研究近年集中在 HKT 转运蛋白与 SOS 通路两条主线上。";

/** 走真实咽喉点写账本(与生产同一条路径,不手搓 jsonl)。 */
function search(q: string, ids: string[]) {
  const items = ids.map((id) => ({ id, source: "olx", title: "T-" + id, doi: `10.1234/${id}` }));
  return ingest(workDir, 1, "mcp__minicod__search_papers", { query: q }, { items, total: 4242 });
}

describe("SubmitAnswer", () => {
  test("已注册,描述写足「什么时候会被拒」,且不泄漏上游真名", () => {
    expect(submit.parallelSafe).toBe(true);
    expect(submit.description).toContain("REJECTED");
    for (const n of ["Semantic Scholar", "OpenAlex", "PubMed"]) expect(submit.description).not.toContain(n);
  });

  test("账本为空 → 拒绝,并给出精确差额(0 条 / 一次检索都没发生)", async () => {
    const r = await submit.run({ answer: ANSWER }, ctx());
    expect(r.isError).toBe(true);
    const t = r.content[0]!.text;
    expect(t).toContain("账本为 0 条");
    expect(t).toContain("一次检索都没有发生过");
    // 可执行的下一步:两条路都必须点名,否则模型只会原样重发直到撞轮上限
    expect(t).toContain("mcp__");
    expect(t).toContain("DeclareInsufficient");
    // 面向用户的脱敏摘要(P1-12 双轨制)不含内部词
    expect(r.userMessage).toBeTruthy();
    expect(r.userMessage).not.toContain("SubmitAnswer");
  });

  test("被拒时列出已执行的检索清单(「换个说法再搜一遍」现原形)", async () => {
    // 检索发生过但一条题录都没入账(空结果):账本仍是 0 → 仍然拒,但差额说得清
    await ingest(workDir, 1, "mcp__minicod__search_papers", { query: "salt tolerance" }, { items: [], total: 0 });
    const r = await submit.run({ answer: ANSWER }, ctx());
    expect(r.isError).toBe(true);
    const t = r.content[0]!.text;
    expect(t).toContain("q1");
    expect(t).toContain("search_papers");
    expect(t).toContain("salt tolerance");
    expect(t).not.toContain("一次检索都没有发生过");
  });

  test("账本非空 → 放行。判据只与账本计数有关,与答案文本无关", async () => {
    await search("q1", ["W1"]);
    const same = await submit.run({ answer: ANSWER }, ctx());
    expect(same.isError).toBe(false);
    expect(same.content[0]!.text).toContain("已交付");
    // 同一段文本在空账本会话里必被拒 —— 证明判据不是在看文本
    const other = await mkdtemp(join(tmpdir(), "delivery-gate-b-"));
    try {
      const r2 = await submit.run({ answer: ANSWER }, { workDir: other, allowBash: false, net: "none", addDirs: [] });
      expect(r2.isError).toBe(true);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  test("缺 answer(或空串)→ 拒,且不假装交付", async () => {
    await search("q1", ["W1"]);
    expect((await submit.run({}, ctx())).isError).toBe(true);
    expect((await submit.run({ answer: "   " }, ctx())).isError).toBe(true);
  });
});

describe("DeclareInsufficient", () => {
  test("落的是**结构化记录**,不是模型自己写的一句话", async () => {
    const r = await declare.run({ missing: "本平台检索不覆盖该临床指南全文", attempted: "试过两轮 search_papers" }, ctx());
    expect(r.isError).toBe(false);
    const raw = await readFile(join(workDir, "evidence", "ledger.jsonl"), "utf8");
    const row = JSON.parse(raw.trim());
    expect(row.op).toBe("insufficient");
    expect(row.missing).toContain("临床指南");
    expect(row.attempted).toContain("search_papers");
    expect(typeof row.ts).toBe("string");
  });

  test("op 行不污染题录读侧(否决清单 #13:同一本账,不另起台账)", async () => {
    await search("q1", ["W1"]);
    await declare.run({ missing: "缺少中文语料" }, ctx());
    expect((await loadLedger(workDir)).length).toBe(1); // 题录数不变
    expect((await stats(workDir)).total).toBe(1); // research_state 的 ledger_total 不被污染
  });

  test("空账本会话也能声明(诚实出口任何时候都在),并指回普通正文交付", async () => {
    const r = await declare.run({ missing: "该问题无法用平台文献接地" }, ctx());
    expect(r.isError).toBe(false);
    expect(r.content[0]!.text).toContain("不要再调用 SubmitAnswer");
    expect(r.content[0]!.text).toContain("禁止编造");
  });

  test("缺 missing → 拒(声明必须说清缺什么,否则它退化成一句免责声明)", async () => {
    expect((await declare.run({}, ctx())).isError).toBe(true);
  });
});

// 交付后的 history 形状 —— 这条是整个 P1 里最容易悄悄退化的地方:
// 正文若只留在 tool_use.input 里,shadowTurn.ts:50 的「只保 text 块」会在下一次冷重灌时把它丢掉,
// 那就等于我们自己再造了一遍要根治的病灶(证据的生命周期比对话短)。
describe("交付后的 history 形状", () => {
  test("正文以 assistant 文本块存活、tool_use 里只留占位、配对不破", () => {
    const msgs: Anthropic.MessageParam[] = [
      { role: "user", content: "水稻耐盐性研究现状?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "我先查一下。" },
          { type: "tool_use", id: "tu_1", name: "SubmitAnswer", input: { answer: ANSWER } },
        ] as Anthropic.ContentBlockParam[],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: [{ type: "text", text: "已交付" }] }] },
    ];
    redactSubmittedAnswer(msgs, "tu_1");
    msgs.push({ role: "assistant", content: [{ type: "text", text: ANSWER }] });

    const blocks = msgs[1]!.content as unknown as Array<Record<string, unknown>>;
    const tu = blocks.find((b) => b.type === "tool_use")!;
    expect(tu.id).toBe("tu_1"); // 配对键不动 → tool_use ↔ tool_result 仍成对
    expect((tu.input as { answer: string }).answer).not.toContain("耐盐");
    expect(JSON.stringify(msgs[1])).not.toContain("HKT"); // 等长副本确实没了

    // 冷重灌模拟(shadowTurn 只保 text 块):正文必须仍在
    const survives = msgs
      .filter((m) => m.role === "assistant" && Array.isArray(m.content))
      .flatMap((m) => (m.content as unknown as Array<Record<string, unknown>>).filter((b) => b.type === "text"))
      .map((b) => String(b.text))
      .join("\n");
    expect(survives).toContain(ANSWER);
    // 末条是 assistant → 下一条 user 消息接上去不会形成 user-after-user 非法序列
    expect(msgs[msgs.length - 1]!.role).toBe("assistant");
  });
});
