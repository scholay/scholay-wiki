// chunk 级证据层 + 「读过原文」留痕(2026-08-01 架构评估 Phase 0)。
//
// 🔴 这里钉死的是一条**语义边界**,填错了比不做更糟:
//      has_fulltext = 手上**有**正文        (段落已入库 / 全文文件已登记)
//      read_marks   = 模型**读过**
//    若把 has_fulltext 直接由 read_marks 派生(那是最容易犯的"最小修法"),
//    render.ts 的中间那档「有全文未读」**永远不可能出现** —— 三档做成两档,
//    而且没有任何红灯。所以本文件专门有一条测试断言三档同时可达。
//
// 另一条:段落绑定必须**宁可漏不可错**。给一条题录挂上别人的段落,会让模型写出
// "看起来有出处"的错误数字 —— 比明显编造更难发现,正是这条基座要消灭的东西。

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ingest, loadLedger, markRead, resolveEidForPath } from "./ledger.ts";
import { appendPassagesUnlocked, countPassages, getPassages, passageEids } from "./passages.ts";
import { parsePassagesFromToolResult } from "./parse.ts";

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "passages-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** 带 snippet 正文的检索结果(minicod 的 snippets 信封形态)。 */
function searchWithSnippets() {
  return {
    items: [
      {
        id: "W1",
        source: "olx",
        title: "Sleep and cognition",
        doi: "10.1234/w1",
        text: "Participants slept 6.2 h on average (SD 1.1).",
        section: "Methods",
      },
      {
        id: "W2",
        source: "olx",
        title: "Exercise and memory",
        doi: "10.1234/w2",
        snippet: "The intervention improved recall by 12% (p = 0.03).",
      },
    ],
    total: 2,
  };
}

describe("span 提取", () => {
  test("从 snippet 抽出正文与章节,并绑到题录身份", () => {
    const ps = parsePassagesFromToolResult(searchWithSnippets());
    expect(ps.length).toBe(2);
    expect(ps[0]!.text).toContain("6.2 h");
    expect(ps[0]!.section).toBe("Methods");
    expect(ps[0]!.key).not.toBe(ps[1]!.key); // 两条不同论文 → 不同身份键
  });

  test("认不出题录身份的正文一律丢弃(绑错比不绑更糟)", () => {
    // 只有正文、没有任何论文体征 → normalizePaper 认不出 → 必须跳过
    const ps = parsePassagesFromToolResult({ items: [{ text: "some floating text with no identity" }] });
    expect(ps).toEqual([]);
  });

  test("没有正文字段的纯题录不产段落", () => {
    const ps = parsePassagesFromToolResult({ items: [{ id: "W9", source: "olx", title: "No body", doi: "10.1/x" }] });
    expect(ps).toEqual([]);
  });
});

describe("passages.jsonl", () => {
  test("检索入账时段落自动落库,并把 has_fulltext 翻真", async () => {
    await ingest(workDir, 1, "mcp__minicod__search_papers", { query: "sleep" }, searchWithSnippets());

    expect(await countPassages(workDir)).toBe(2);
    const led = await loadLedger(workDir);
    expect(led.length).toBe(2);
    // 🔴 这是「账本只到摘要级」被打破的那一刻
    expect(led.every((r) => r.has_fulltext)).toBe(true);
    expect(await passageEids(workDir)).toEqual(new Set(led.map((r) => r.id)));
  });

  test("段落挂在正确的 E 编号上(不串行)", async () => {
    await ingest(workDir, 1, "mcp__minicod__search_papers", { query: "q" }, searchWithSnippets());
    const led = await loadLedger(workDir);
    const sleep = led.find((r) => r.title?.includes("Sleep"))!;
    const got = await getPassages(workDir, [sleep.id]);
    expect(got.length).toBe(1);
    expect(got[0]!.text).toContain("6.2 h");
  });

  test("重复检索到同一 snippet 不重复落盘", async () => {
    await ingest(workDir, 1, "mcp__minicod__search_papers", { query: "a" }, searchWithSnippets());
    await ingest(workDir, 2, "mcp__minicod__search_papers", { query: "b" }, searchWithSnippets());
    expect(await countPassages(workDir)).toBe(2);
  });

  test("关键词过滤(EvidenceGet 的 fields=passages 用)", async () => {
    await ingest(workDir, 1, "mcp__minicod__search_papers", { query: "q" }, searchWithSnippets());
    const hit = await getPassages(workDir, [], { q: "recall" });
    expect(hit.length).toBe(1);
    expect(hit[0]!.text).toContain("12%");
  });

  test("同一 eid 的段落数有上限(段落是支撑论断,不是堆料)", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ eid: "E1", text: "passage " + i }));
    await appendPassagesUnlocked(workDir, rows);
    expect((await getPassages(workDir, ["E1"])).length).toBeLessThanOrEqual(8);
  });
});

describe("读过原文留痕", () => {
  test("resolveEidForPath 只认 evidence/E<n>.md,其余一律不猜", () => {
    expect(resolveEidForPath(workDir, "evidence/E7.md")).toBe("E7");
    expect(resolveEidForPath(workDir, join(workDir, "evidence/E12.md"))).toBe("E12");
    // 认不出的一律 null —— 绝不 basename 模糊匹配
    expect(resolveEidForPath(workDir, "references/paper-33.md")).toBeNull();
    expect(resolveEidForPath(workDir, "evidence/notes.md")).toBeNull();
    expect(resolveEidForPath(workDir, "out/report.md")).toBeNull();
    expect(resolveEidForPath(workDir, "/etc/passwd")).toBeNull();
  });

  test("markRead 写进去、loadLedger 折得出来", async () => {
    await ingest(workDir, 1, "mcp__minicod__search_papers", { query: "q" }, searchWithSnippets());
    const id = (await loadLedger(workDir))[0]!.id;
    expect(await markRead(workDir, id, { turn: 2, tool: "Read", chars: 500 })).toBe(true);
    const rec = (await loadLedger(workDir)).find((r) => r.id === id)!;
    expect(rec.read_marks.length).toBe(1);
    expect(rec.read_marks[0]!.tool).toBe("Read");
  });

  test("markRead 对不存在的 id 返回 false(不凭空造记录)", async () => {
    expect(await markRead(workDir, "E999", { turn: 1, tool: "Read", chars: 1 })).toBe(false);
  });

  test("🔴 三档必须同时可达 —— has_fulltext 若由 read_marks 派生,中间那档会永远消失", async () => {
    // 仅题录:无段落、无 read_mark
    await ingest(workDir, 1, "mcp__minicod__search_papers", { query: "q" }, {
      items: [{ id: "W9", source: "olx", title: "Bare record", doi: "10.9/x" }],
      total: 1,
    });
    // 有全文:带 snippet 的两条
    await ingest(workDir, 1, "mcp__minicod__search_papers", { query: "q2" }, searchWithSnippets());

    const led = await loadLedger(workDir);
    const bare = led.find((r) => r.title === "Bare record")!;
    const withText = led.find((r) => r.title?.includes("Sleep"))!;
    await markRead(workDir, withText.id, { turn: 2, tool: "Read", chars: 10 });

    const after = await loadLedger(workDir);
    const a = after.find((r) => r.id === bare.id)!;
    const b = after.find((r) => r.id === withText.id)!;
    const c = after.find((r) => r.title?.includes("Exercise"))!;

    expect([a.has_fulltext, a.read_marks.length]).toEqual([false, 0]); // 仅题录
    expect([c.has_fulltext, c.read_marks.length]).toEqual([true, 0]); // 有全文未读 ← 关键的中间档
    expect([b.has_fulltext, b.read_marks.length > 0]).toEqual([true, true]); // 已读全文
  });
});
