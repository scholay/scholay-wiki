// 证据账本单测(2026-08 证据账本 P0)。
//
// 这里锁住的是**根因层**的三件事,不是字符串格式:
//   ① 咽喉点必须在 capToolResult 之前(账本比上下文富);
//   ② 同一篇只占一个 id(「换个说法再搜一遍」现原形);
//   ③ 模型可见文本里绝不出现上游真名。
// 格式类断言刻意写得松(只查关键 token),否则改一个顿号就要来改测试,测试会先被放宽再被删。

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ingest,
  ingestPapers,
  annotate,
  loadLedger,
  loadQueries,
  getByIds,
  buildDigest,
  stats,
  markRead,
  materialize,
  normalizeId,
} from "./ledger.ts";
import { parsePapersFromToolResult, evidenceKey } from "./parse.ts";
import { capToolResult } from "../turn/resultCap.ts";

const TOOL = "mcp__minicod__search_papers";

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "evidence-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** 一条最小但形状真实的 minicod search_papers 结果(MCP 文本块信封)。 */
function searchResult(papers: Array<Record<string, unknown>>, total = 256509): unknown {
  return [{ type: "text", text: JSON.stringify({ items: papers, total, offset: 0, limit: 20 }) }];
}

function paper(n: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `W${n}`,
    source: "olx",
    title: `WRKY transcription factors under drought stress ${n}`,
    abstract: "Drought stress reshapes WRKY expression. ".repeat(4),
    year: 2020 + (n % 5),
    doi: `10.1093/jxb/era${n}`,
    venue: "Journal of Experimental Botany",
    citation_count: n,
    authors: [{ id: "A1", name: "Zhang Y" }, { id: "A2", name: "Li M" }],
    ...over,
  };
}

describe("ingest 咽喉点", () => {
  test("检索结果入账:分配 E1..En,queries 记 上游总数/送达/新增", async () => {
    const q = await ingest(workDir, 3, TOOL, { query: "WRKY drought" }, searchResult([paper(1), paper(2)]));
    expect(q.q).toBe("q1");
    expect(q.delivered).toBe(2);
    expect(q.total_upstream).toBe(256509); // 分母:送达 2 ≠ 这个方向只有 2 篇
    expect(q.new_ids).toEqual(["E1", "E2"]);
    expect(q.dup_ids).toEqual([]);

    const recs = await loadLedger(workDir);
    expect(recs.map((r) => r.id)).toEqual(["E1", "E2"]);
    expect(recs[0]!.origin).toBe("retrieval");
    expect(recs[0]!.first_seen).toMatchObject({ turn: 3, tool: TOOL, q: "q1" });
    expect(recs[0]!.doi).toBe("10.1093/jxb/era1");
    expect(recs[0]!.authors).toEqual(["Zhang Y", "Li M"]);
    // 「检索到」≠「读过原文」—— 检索入账恒 false,这是 31 条效应量凭空出现的那条缝
    expect(recs[0]!.has_fulltext).toBe(false);
    expect(recs[0]!.read_marks).toEqual([]);
  });

  test("同一篇再检索一次 → 零新增、全重复,账本条数不变(幂等)", async () => {
    await ingest(workDir, 1, TOOL, { query: "a" }, searchResult([paper(1), paper(2)]));
    const q2 = await ingest(workDir, 2, TOOL, { query: "换个说法再搜一遍" }, searchResult([paper(1), paper(2)]));
    expect(q2.new_ids).toEqual([]);
    expect(q2.dup_ids).toEqual(["E1", "E2"]);
    expect((await loadLedger(workDir)).length).toBe(2);
    expect((await loadQueries(workDir)).length).toBe(2); // 检索次数照记(覆盖度状态)
  });

  test("DOI 优先于源 id:同一篇从两个源返回只占一个 id", async () => {
    await ingest(workDir, 1, TOOL, { query: "a" }, searchResult([paper(1)]));
    const same = paper(1, { id: "S9", source: "stc" }); // 换源换 id,DOI 不变
    const q2 = await ingest(workDir, 2, TOOL, { query: "b" }, searchResult([same]));
    expect(q2.new_ids).toEqual([]);
    expect(q2.dup_ids).toEqual(["E1"]);
  });

  test("DOI 写法差异(https://doi.org/ 前缀、大小写)仍判同一篇", async () => {
    await ingest(workDir, 1, TOOL, { query: "a" }, searchResult([paper(1)]));
    const q2 = await ingest(
      workDir,
      2,
      TOOL,
      { query: "b" },
      searchResult([paper(1, { id: "X", source: "pmd", doi: "https://doi.org/10.1093/JXB/ERA1" })]),
    );
    expect(q2.new_ids).toEqual([]);
  });

  test("非 MCP 工具(Read/Bash)零副作用:不建目录、不写账本", async () => {
    const q = await ingest(workDir, 1, "Read", { file_path: "a.md" }, [{ type: "text", text: "# hi" }]);
    expect(q.delivered).toBe(0);
    await expect(readdir(join(workDir, "evidence"))).rejects.toThrow();
  });

  test("作者 / 高校实体不入账(minicod 76 工具里大量非论文结果)", async () => {
    const authors = [{ type: "text", text: JSON.stringify({ items: [{ id: "A1", source: "olx", name: "Zhang Y", display_name: "Zhang Y" }] }) }];
    const q = await ingest(workDir, 1, "mcp__minicod__search_authors", { query: "zhang" }, authors);
    expect(q.delivered).toBe(0);
    expect((await loadLedger(workDir)).length).toBe(0);
  });

  test("零命中的检索仍记一行流水(覆盖度状态:这个方向搜过了)", async () => {
    const q = await ingest(workDir, 1, TOOL, { query: "unobtainium" }, searchResult([], 0));
    expect(q.delivered).toBe(0);
    expect((await loadQueries(workDir)).length).toBe(1);
  });
});

describe("账本必须比上下文富(为什么咽喉点在 capToolResult 之前)", () => {
  test("同一份结果:入账 30 条,而经 capToolResult 后模型只看得到更少", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      paper(i + 1, { abstract: "x".repeat(1900) }),
    );
    const raw = searchResult(many);
    const q = await ingest(workDir, 1, TOOL, { query: "wrky" }, raw);
    expect(q.delivered).toBe(30);
    expect((await loadLedger(workDir)).length).toBe(30);

    // 砍后:同一份内容再解析,条数必然更少 —— 若把 ingest 挪到 cap 之后,这些记录就永远不存在。
    const afterCap = parsePapersFromToolResult(capToolResult(raw, TOOL));
    expect(afterCap.length).toBeLessThan(30);
  });

  test("调用点顺序有源码级守卫:runTools 里 ingest 必须出现在 capToolResult 之前", async () => {
    // fileURLToPath 而非 .pathname:仓库路径含非 ASCII(会被百分号编码,readFile 直接 ENOENT)。
    const src = await readFile(fileURLToPath(new URL("../turn/runTools.ts", import.meta.url)), "utf8");
    const iIngest = src.indexOf("ingestEvidence(");
    const iCap = src.indexOf("capToolResult(content");
    expect(iIngest).toBeGreaterThan(0);
    expect(iCap).toBeGreaterThan(0);
    expect(iIngest).toBeLessThan(iCap);
  });
});

describe("品牌遮蔽(铁律:对外只能 Graph / Discovery / Medicine)", () => {
  test("source 落品牌名;账本文件里不出现任何上游真名", async () => {
    await ingest(
      workDir,
      1,
      TOOL,
      { query: "a" },
      searchResult([
        paper(1, { source: "olx" }),
        paper(2, { source: "stc" }),
        paper(3, { source: "pmd", venue: "Indexed in PubMed and Semantic Scholar" }),
      ]),
    );
    const recs = await loadLedger(workDir);
    expect(recs.map((r) => r.source)).toEqual(["Discovery", "Graph", "Medicine"]);

    const text = await readFile(join(workDir, "evidence", "ledger.jsonl"), "utf8");
    expect(text).not.toContain("OpenAlex");
    expect(text).not.toContain("Semantic Scholar");
    expect(text).not.toContain("PubMed");
    expect(text).toContain("Discovery");
  });
});

describe("digest(每轮注入用)", () => {
  test("空账本 → 空串(调用方什么都不注入)", async () => {
    expect(await buildDigest(workDir)).toBe("");
  });

  test("非空账本:带 id、条数、检索次数、上游总数与 EvidenceGet 可供性", async () => {
    await ingest(workDir, 1, TOOL, { query: "WRKY drought" }, searchResult([paper(1), paper(2)]));
    const d = await buildDigest(workDir);
    expect(d).toContain("E1");
    expect(d).toContain("E2");
    expect(d).toContain("EvidenceGet");
    expect(d).toContain("256509"); // 上游总数进 digest,防「这个方向只有 2 篇」
    expect(d).toContain("仅题录"); // 检索到 ≠ 读过原文
  });

  test("超帽:保留最近的,并显式声明被截了多少、去哪看全的", async () => {
    for (let b = 0; b < 4; b++) {
      const batch = Array.from({ length: 25 }, (_, i) => paper(b * 25 + i + 1));
      await ingest(workDir, b + 1, TOOL, { query: "q" + b }, searchResult(batch));
    }
    const d = await buildDigest(workDir);
    expect(d.length).toBeLessThanOrEqual(6500); // 字符帽(含头尾说明的余量)
    expect(d).toContain("INDEX.md");
    expect(d).toContain("E100"); // 最近入账的在
    expect(d).not.toContain("E1 ·"); // 最早的被截掉(行首形态)
  });
});

describe("读回路 EvidenceGet 依赖的原语", () => {
  test("id 归一:E7 / e7 / 7 / [[E7]] 都指同一条", () => {
    for (const s of ["E7", "e7", "7", "[[E7]]", " E7,"]) expect(normalizeId(s)).toBe("E7");
    expect(normalizeId("nope")).toBe("");
  });

  test("getByIds 取回题录(含摘要),未入账的不会被凭空造出来", async () => {
    await ingest(workDir, 1, TOOL, { query: "a" }, searchResult([paper(1), paper(2)]));
    const got = await getByIds(workDir, ["[[E2]]", "E99"]);
    expect(got.map((r) => r.id)).toEqual(["E2"]);
    expect(got[0]!.abstract).toContain("Drought stress");
  });

  test("懒物化:ingest 不落 E<n>.md;只有被取用过的才落(会话文件数帽是硬约束)", async () => {
    await ingest(workDir, 1, TOOL, { query: "a" }, searchResult([paper(1), paper(2), paper(3)]));
    const before = (await readdir(join(workDir, "evidence"))).filter((f) => /^E\d+\.md$/.test(f));
    expect(before).toEqual([]);

    const paths = await materialize(workDir, await getByIds(workDir, ["E2"]));
    expect(paths).toEqual(["evidence/E2.md"]);
    const after = (await readdir(join(workDir, "evidence"))).filter((f) => /^E\d+\.md$/.test(f));
    expect(after).toEqual(["E2.md"]);
    expect(await readFile(join(workDir, "evidence", "E2.md"), "utf8")).toContain("Discovery");
  });
});

describe("append-only 不变量", () => {
  test("markRead 追加增量行,fold 后可见,原行不动", async () => {
    await ingest(workDir, 1, TOOL, { query: "a" }, searchResult([paper(1)]));
    const before = await readFile(join(workDir, "evidence", "ledger.jsonl"), "utf8");
    expect(await markRead(workDir, "E1", { turn: 4, tool: "ReadDocument", chars: 12000 })).toBe(true);
    const after = await readFile(join(workDir, "evidence", "ledger.jsonl"), "utf8");
    expect(after.startsWith(before)).toBe(true); // 只追加,前缀逐字节不变

    const recs = await loadLedger(workDir);
    expect(recs[0]!.read_marks).toEqual([{ turn: 4, tool: "ReadDocument", chars: 12000 }]);
    expect(await markRead(workDir, "E99", { turn: 4, tool: "Read", chars: 1 })).toBe(false);
  });

  test("半行损坏(容器被杀在写入中途)只丢那一行,不毁整本账", async () => {
    await ingest(workDir, 1, TOOL, { query: "a" }, searchResult([paper(1), paper(2)]));
    const p = join(workDir, "evidence", "ledger.jsonl");
    await writeFile(p, (await readFile(p, "utf8")) + '{"id":"E3","key":"doi:x","ori', "utf8");
    const recs = await loadLedger(workDir);
    expect(recs.map((r) => r.id)).toEqual(["E1", "E2"]);
  });

  test("存量会话(无 evidence/ 目录)读回空账本而不是抛错", async () => {
    expect(await loadLedger(workDir)).toEqual([]);
    expect(await stats(workDir)).toEqual({ total: 0, byOrigin: {}, queries: 0 });
  });
});

describe("并发(runTools 的 Promise.all 并行批)", () => {
  test("同轮并发 ingest:id 不重复、不丢条", async () => {
    const batches = [
      searchResult([paper(1), paper(2)]),
      searchResult([paper(3), paper(4)]),
      searchResult([paper(5), paper(2)]), // 与第一批有重叠
    ];
    await Promise.all(batches.map((b, i) => ingest(workDir, 1, TOOL, { query: "q" + i }, b)));
    const recs = await loadLedger(workDir);
    const ids = recs.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // 无重复 id
    expect(recs.length).toBe(5); // paper(2) 只占一条
    expect(new Set(recs.map((r) => r.key)).size).toBe(5);
  });
});

describe("tool_result 回写", () => {
  test("逐条挂 evidence_id + 根上 _evidence 汇总", async () => {
    const raw = searchResult([paper(1), paper(2)]);
    const q = await ingest(workDir, 1, TOOL, { query: "a" }, raw);
    const out = (await annotate(workDir, raw, q)) as Array<{ type: string; text: string }>;
    const data = JSON.parse(out[0]!.text);
    expect(data.items.map((p: { evidence_id?: string }) => p.evidence_id)).toEqual(["E1", "E2"]);
    expect(data._evidence).toMatchObject({ query_id: "q1", new: 2, dup: 0, ledger_total: 2 });
  });

  test("零命中 / 非法内容 → 原样返回(fail-closed,绝不让账本弄坏检索结果)", async () => {
    const junk = [{ type: "text", text: "not json at all" }];
    const q = await ingest(workDir, 1, TOOL, { query: "a" }, junk);
    expect(await annotate(workDir, junk, q)).toBe(junk);
  });

  test("回写不得吃掉 sanitizer 的 _sanitizer 块(中文覆盖披露是商务硬约束)", async () => {
    const raw = [
      {
        type: "text",
        text: JSON.stringify({
          items: [paper(1)],
          total: 5,
          _sanitizer: { coverage_note: "平台检索源(Graph / Discovery / Medicine)…不含知网", spam_dropped: 2 },
        }),
      },
    ];
    const q = await ingest(workDir, 1, TOOL, { query: "中文查询" }, raw);
    const out = (await annotate(workDir, raw, q)) as Array<{ text: string }>;
    const data = JSON.parse(out[0]!.text);
    expect(data._sanitizer.coverage_note).toContain("不含知网");
    expect(data._sanitizer.spam_dropped).toBe(2);
    expect(data.items[0].evidence_id).toBe("E1");
  });
});

describe("origin(回答「是我文献库的还是你检索的」)", () => {
  test("user_text 入账:可用,但与检索接地分开计数", async () => {
    await ingest(workDir, 1, TOOL, { query: "a" }, searchResult([paper(1)]));
    await ingestPapers(
      workDir,
      parsePapersFromToolResult(searchResult([paper(2)])),
      "user_text",
      { turn: 2, tool: "user_message" },
    );
    const s = await stats(workDir);
    expect(s.total).toBe(2);
    expect(s.byOrigin).toEqual({ retrieval: 1, user_text: 1 });
    const d = await buildDigest(workDir);
    expect(d).toContain("用户提供");
  });
});

describe("身份键", () => {
  test("无 DOI 无 id 时回落标题+年份哈希(user_text origin 的常态)", () => {
    const a = evidenceKey({ title: "A Study of X", year: 2021, paperId: "", sourceCode: "stc", doi: undefined });
    const b = evidenceKey({ title: "a  study   of x!", year: 2021, paperId: "", sourceCode: "stc", doi: undefined });
    expect(a).toBe(b);
    expect(a.startsWith("t:")).toBe(true);
  });
});

// 目录存在但为空(GC 后半态)也不能炸。
test("evidence/ 存在但无文件 → 空账本", async () => {
  await mkdir(join(workDir, "evidence"), { recursive: true });
  expect(await loadLedger(workDir)).toEqual([]);
  expect(await buildDigest(workDir)).toBe("");
});
