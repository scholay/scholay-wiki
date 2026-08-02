// EvidenceGet 工具单测(2026-08 证据账本 P0)。
// 它是 smart_search 的**唯一**读回路(该 feature 禁了 Write/Glob/Grep/Skill),
// 所以「未入账时说未入账」比「返回得漂亮」重要得多 —— 这里锁的是后者。

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { builtinRegistry } from "../tools/registry.ts";
import { ingest } from "./ledger.ts";

const TOOL = "mcp__minicod__search_papers";
const tool = builtinRegistry.get("EvidenceGet")!;

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "evget-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const ctx = () => ({ workDir, allowBash: false, net: "none" as const, addDirs: [] });

async function seed(n = 2) {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `W${i + 1}`,
    source: "olx",
    title: `Paper ${i + 1}`,
    abstract: `Abstract body ${i + 1}`,
    year: 2021,
    doi: `10.1/x${i + 1}`,
    venue: "J Exp Bot",
    authors: [{ name: "Zhang Y" }],
  }));
  await ingest(workDir, 1, TOOL, { query: "seed" }, [{ type: "text", text: JSON.stringify({ items, total: 999 }) }]);
}

describe("EvidenceGet", () => {
  test("已注册,且描述写足「什么时候必须用我」(终稿:18 个 MCP 工具里义务语 0/18)", () => {
    expect(tool).toBeTruthy();
    expect(tool.description).toContain("MUST");
    expect(tool.parallelSafe).toBe(true);
    // 泄漏面:描述会原样进模型上下文,再被转述给用户。
    for (const n of ["Semantic Scholar", "OpenAlex", "PubMed"]) expect(tool.description).not.toContain(n);
  });

  test("空账本 + 无参:如实说空,并指向「先检索」,不编造", async () => {
    const r = await tool.run({}, ctx());
    expect(r.isError).toBe(false);
    expect(r.content[0]!.text).toContain("账本为空");
  });

  test("无参 = 列全账(失忆纪元里重新定位自己的唯一手段)", async () => {
    await seed(3);
    const r = await tool.run({}, ctx());
    const t = r.content[0]!.text;
    expect(t).toContain("E1");
    expect(t).toContain("E3");
    expect(t).toContain("证据账本");
  });

  test("按 id 取回题录含摘要,并懒物化落盘(只落被取用的那条)", async () => {
    await seed(3);
    const r = await tool.run({ ids: ["E2"] }, ctx());
    const t = r.content[0]!.text;
    expect(t).toContain("Paper 2");
    expect(t).toContain("Abstract body 2");
    expect(t).toContain("evidence/E2.md");
    const files = (await readdir(join(workDir, "evidence"))).filter((f) => /^E\d+\.md$/.test(f));
    expect(files).toEqual(["E2.md"]);
  });

  test("形态漂移容忍:[[E1]] / 逗号串 / 小写都能取到", async () => {
    await seed(2);
    const r = await tool.run({ ids: "[[E1]], e2" }, ctx());
    expect(r.content[0]!.text).toContain("Paper 1");
    expect(r.content[0]!.text).toContain("Paper 2");
  });

  test("未入账的 id:显式说未入账 + 给有效区间,绝不凭空造一条", async () => {
    await seed(2);
    const r = await tool.run({ ids: ["E99"] }, ctx());
    const t = r.content[0]!.text;
    expect(t).toContain("未入账");
    expect(t).toContain("E1–E2");
    expect(t).not.toContain("Paper 99");
  });

  test("fields=meta:一行一条,不带摘要、不落盘", async () => {
    await seed(2);
    const r = await tool.run({ ids: ["E1"], fields: "meta" }, ctx());
    expect(r.content[0]!.text).not.toContain("Abstract body 1");
    const files = (await readdir(join(workDir, "evidence"))).filter((f) => /^E\d+\.md$/.test(f));
    expect(files).toEqual([]);
  });
});
