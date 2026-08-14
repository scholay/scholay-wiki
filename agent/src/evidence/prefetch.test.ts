// 取证型预检索 · 执行侧契约(2026-08 证据账本 P1)。
//
// 这里钉四件事,每一件对应改造里一个「错了就白做 / 错了就更坏」的点:
//   1. 触发条件(账本空 + 取证轮)—— shouldPrefetch 是单一真源,turnLoop 与这里共用同一份判据。
//   2. 命中后**账本真的非空**了 —— 这就是整条改造的目的:模型开口时手上有真东西。
//   3. 失败**不阻塞**、且对模型静默 —— note 为空串 = turnLoop 什么都不注入 = 回落到今天的行为。
//   4. 零命中**必须进模型视野** —— renderDigest 在空账本时恒返回 ""(短路),所以这个信号
//      只能由 note 携带;丢了它,模型就会以为「没人查过」。
//
// 上游调用经 callTool 注入(生产恒用 callMcpTool),不联网、不起 MCP 子进程。

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPrefetch, shouldPrefetch, PREFETCH_TOOL } from "./prefetch.ts";
import { buildDigest, loadLedger, loadQueries } from "./ledger.ts";

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "prefetch-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** smart_search / claw 的真实工具面形状(含 search_papers)。 */
const TOOLS = [PREFETCH_TOOL, "mcp__minicod__get_paper", "Read", "EvidenceGet"];

/** 一条形状真实的 minicod search_papers 结果(MCP 文本块信封)。 */
function result(n: number, total = 4242): unknown {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `W${i + 1}`,
    source: "olx",
    title: `Salt tolerance in rice ${i + 1}`,
    year: 2021 + i,
    doi: `10.1234/rice${i + 1}`,
    venue: "Plant Cell",
    authors: [{ id: "A1", name: "Zhang Y" }],
  }));
  return [{ type: "text", text: JSON.stringify({ items, total, offset: 0, limit: 5 }) }];
}

const hit = (n: number) => async () => ({ content: result(n), isError: false });
const upstreamError = async () => ({ content: [{ type: "text", text: "检索服务暂时不可用" }], isError: true });
const throws = async () => {
  throw new Error("socket hang up");
};

const ask = (over: Partial<Parameters<typeof runPrefetch>[0]> = {}) =>
  runPrefetch({
    workDir,
    userText: "帮我找几篇关于水稻耐盐性分子机制的最新论文",
    toolNames: TOOLS,
    turn: 1,
    callTool: hit(5),
    ...over,
  });

describe("取证型预检索 · 触发条件", () => {
  test("单一真源:取证轮 + 账本为空 才预检索", () => {
    expect(shouldPrefetch("evidence", 0)).toBe(true);
    // 账本非空 = 这个会话已经有证据了,再探一枪只是白花钱
    expect(shouldPrefetch("evidence", 3)).toBe(false);
    // 闲聊轮不预检索(否决清单 #11:无条件强制会伤体验)
    expect(shouldPrefetch("chat", 0)).toBe(false);
    expect(shouldPrefetch("chat", 3)).toBe(false);
  });

  test("控制面仍是权威:本轮工具面里没有 search_papers → 不预检索,零调用", async () => {
    let called = 0;
    const r = await ask({
      toolNames: ["Read", "Write", "mcp__minicod__get_journal"],
      callTool: async () => {
        called++;
        return { content: result(5), isError: false };
      },
    });
    expect(r.status).toBe("unavailable");
    expect(called).toBe(0);
    expect(await loadQueries(workDir)).toHaveLength(0);
  });

  test("抽不出主题(纯寒暄/纯 meta)→ no_query,零调用、零账本写入", async () => {
    let called = 0;
    const r = await ask({
      userText: "你好,还有哪些论文呢",
      callTool: async () => {
        called++;
        return { content: result(5), isError: false };
      },
    });
    expect(r.status).toBe("no_query");
    expect(called).toBe(0);
    expect(await loadLedger(workDir)).toHaveLength(0);
  });
});

describe("取证型预检索 · 命中", () => {
  test("🔴 命中后账本非空 —— 这就是整条改造的目的(模型开口时手上有真东西)", async () => {
    expect(await loadLedger(workDir)).toHaveLength(0); // 开口前:空账本 = 只能凭记忆
    const r = await ask();
    expect(r.status).toBe("hit");
    expect(r.delivered).toBe(5);
    expect(r.newIds).toEqual(["E1", "E2", "E3", "E4", "E5"]);

    const recs = await loadLedger(workDir);
    expect(recs).toHaveLength(5);
    // 走的是与模型自己调工具**完全同一个**咽喉点:origin/去重键/E 编号/流水一致(账本只有一个 writer)
    expect(recs[0]!.origin).toBe("retrieval");
    expect(recs[0]!.doi).toBe("10.1234/rice1");
    expect(recs[0]!.first_seen.tool).toBe(PREFETCH_TOOL);
    // digest 非空 → turnLoop 会把它注入本轮 user 尾部,模型这一轮就看得见
    expect(await buildDigest(workDir)).toContain("E1");
  });

  test("说明块必须声明「不是你调用的工具」—— 否则模型会把账本里凭空多出的题录叙述成「我刚检索过」", async () => {
    const r = await ask();
    expect(r.note).toContain("不是你调用的工具");
    expect(r.note).toContain("水稻耐盐性分子机制"); // 用了哪个检索式,写出来
    expect(r.note).toContain("宽口径探路"); // 不是完整检索,别当覆盖结论用
  });

  test("检索流水记 _by 标记供审计,但**不进模型视野**(渲染层只读 query 一类键)", async () => {
    await ask();
    const [q] = await loadQueries(workDir);
    expect((q!.args as Record<string, unknown>)._by).toBe("engine_prefetch");
    expect(q!.total_upstream).toBe(4242); // 分母照常记:送达 5 ≠ 这个方向只有 5 篇
    expect(await buildDigest(workDir)).not.toContain("engine_prefetch");
  });
});

describe("取证型预检索 · 零命中与失败", () => {
  test("🔴 零命中必须进模型视野 —— 空账本时 digest 恒为空,这个信号只能由 note 携带", async () => {
    const r = await ask({ callTool: hit(0) });
    expect(r.status).toBe("empty");
    expect(await buildDigest(workDir)).toBe(""); // ← 证明 digest 这条通道确实带不了这个信号
    expect(r.note).toContain("0 命中");
    // 措辞刻意收窄:一次宽口径单查询**支撑不了**「平台没有这个主题」的覆盖结论。
    // 把它写成覆盖结论 = 我们亲手制造一条新的谎,正是这轮改造要消灭的东西。
    expect(r.note).toContain("不等于该主题没有文献");
  });

  test("中文检索式零命中时追加覆盖披露(平台三源是国际英文库;只出现对外品牌名)", async () => {
    const zh = await ask({ callTool: hit(0) });
    expect(zh.note).toContain("知网");
    expect(zh.note).toContain("Graph / Discovery / Medicine");
    expect(zh.note).not.toContain("Semantic Scholar"); // 上游真名绝不外泄(商务硬约束)
    expect(zh.note).not.toContain("OpenAlex");

    const en = await ask({ userText: "recent papers on protein folding prediction", callTool: hit(0) });
    expect(en.note).toContain("0 命中");
    expect(en.note).not.toContain("知网"); // 英文检索式零命中与中文覆盖无关,不乱扣解释
  });

  test("上游 is_error(含熔断快速失败)→ failed:不入账、不阻塞、对模型静默", async () => {
    const r = await ask({ callTool: upstreamError });
    expect(r.status).toBe("failed");
    expect(r.note).toBe(""); // note 空 = turnLoop 什么都不注入 = 本轮回落到今天的行为
    expect(await loadLedger(workDir)).toHaveLength(0); // 错误正文不是题录
    expect(await loadQueries(workDir)).toHaveLength(0);
  });

  test("上游抛异常(超时/socket 断)→ failed,runPrefetch 永不抛", async () => {
    const r = await ask({ callTool: throws });
    expect(r.status).toBe("failed");
    expect(r.note).toBe("");
  });

  test("🔴 超时有上界:上游卡住时本轮不被拖住,且**放弃的结果不入账**", async () => {
    const prev = process.env.EVIDENCE_PREFETCH_TIMEOUT_MS;
    process.env.EVIDENCE_PREFETCH_TIMEOUT_MS = "40";
    try {
      let settled = false;
      // 永不 resolve 的调用 = 上游 hang(minicod stdio 子进程挂死的真实形态)
      const hang = () => new Promise<{ content: unknown; isError: boolean }>(() => {});
      const t0 = Date.now();
      const r = await ask({ callTool: hang });
      settled = true;
      expect(settled).toBe(true);
      expect(r.status).toBe("failed");
      expect(Date.now() - t0).toBeLessThan(2000); // 确定上界,不是 MCP 那层的 30s
      expect(r.note).toBe(""); // 对模型静默 → 本轮照常进行
      // 迟到的结果绝不悄悄入账:那会与下一轮的 queries 基线打架,把「本轮检索 N 次」变成不可复现的数字
      await new Promise((res) => setTimeout(res, 30));
      expect(await loadQueries(workDir)).toHaveLength(0);
      expect(await loadLedger(workDir)).toHaveLength(0);
    } finally {
      if (prev === undefined) delete process.env.EVIDENCE_PREFETCH_TIMEOUT_MS;
      else process.env.EVIDENCE_PREFETCH_TIMEOUT_MS = prev;
    }
  });

  test("急停阀 EXECUTOR_EVIDENCE_PREFETCH=off:整条路径不存在,零调用零写入", async () => {
    const prev = process.env.EXECUTOR_EVIDENCE_PREFETCH;
    process.env.EXECUTOR_EVIDENCE_PREFETCH = "off";
    try {
      let called = 0;
      const r = await ask({
        callTool: async () => {
          called++;
          return { content: result(5), isError: false };
        },
      });
      expect(r.status).toBe("off");
      expect(called).toBe(0);
      expect(await loadLedger(workDir)).toHaveLength(0);
    } finally {
      if (prev === undefined) delete process.env.EXECUTOR_EVIDENCE_PREFETCH;
      else process.env.EXECUTOR_EVIDENCE_PREFETCH = prev;
    }
  });
});

// 2026-08-02 回归:预检索**必须**传 source。
// 🔴 漏传的后果不是报错,是整条 P1 主路径静默失效:上游恒回 MCP -32602 "source Required",
//    而 runPrefetch 把任何失败折成 status:"failed" 对模型静默 ⇒ 线上跑了整整一段时间没人发现,
//    且会把 V2/V3 指标压向「改造无效」的反向结论。
describe("预检索必传 source(漏传 = 整条主路径静默失效)", () => {
  test("callTool 收到的参数里必须有 source,且是合法 enum", async () => {
    let seen: Record<string, unknown> | null = null;
    const dir = await mkdtemp(join(tmpdir(), "prefetch-src-"));
    try {
      await runPrefetch({
        workDir: dir,
        userText: "帮我找找肠道菌群与抑郁的随机对照试验",
        toolNames: [PREFETCH_TOOL],
        turn: 1,
        callTool: async (_name, args) => {
          seen = args;
          return { content: { items: [] }, isError: false };
        },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    expect(seen, "runPrefetch 没有调用上游").not.toBeNull();
    const src = (seen as unknown as Record<string, unknown>).source;
    expect(
      src,
      "\n预检索没传 source —— search_papers 的 source 是 Required enum,\n" +
        "漏传会让上游恒回 -32602,而失败对模型静默 ⇒ P1 主路径 100% 失效且无人知晓。\n",
    ).toBeDefined();
    expect(["semantic", "openalex", "pubmed"]).toContain(src as string);
  });
});
