// [[E<n>]] 引用句柄 · 交付边界 resolve 闸(2026-08 证据账本 P1)。
//
// 这里锁的是**机理**,不是文案:
//   ① 未入账编号在构建型边界上 = 硬失败(交付物不生成),且失败文本里有可执行的自救指引;
//   ② 展开文本对 Markdown 表格 / HTML / JS 字符串字面量三种容器同时安全
//      (BuildDeck 的正文最终是 bundle 里的字符串字面量,一个引号就白屏);
//   ③ 引用契约只在**账本非空**时注入(老会话无差别注入 = 给模型看自相矛盾的示例)。
// 格式断言刻意写松(只查关键 token),否则改个顿号就要来改测试。

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  expandCitations,
  citationFailureText,
  renderCitationInline,
  renderDigest,
  CITATION_CONTRACT,
  type CitationExpansion,
} from "./render.ts";
import { resolveTextForDelivery, resolveFileForDelivery } from "./deliver.ts";
import { ingest, loadLedger, type EvidenceRecord } from "./ledger.ts";
import { builtinRegistry } from "../tools/registry.ts";
import { snapshotOut, emitArtifacts } from "../turn/artifacts.ts";

const TOOL = "mcp__minicod__search_papers";

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "cite-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** 入账 n 条题录;第 1 条的标题刻意塞满会破坏容器的字符。 */
async function seed(n = 2) {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `W${i + 1}`,
    source: "olx",
    title: i === 0 ? `A "quoted" <b>title</b> with {braces} | pipe \\ backslash [brackets]` : `Paper ${i + 1}`,
    year: 2021,
    doi: `10.1/x${i + 1}`,
    venue: "J Exp Bot",
    authors: [{ name: "Zhang Y" }, { name: "Li M" }, { name: "Wang H" }],
  }));
  await ingest(workDir, 1, TOOL, { query: "seed" }, [{ type: "text", text: JSON.stringify({ items, total: 999 }) }]);
  return loadLedger(workDir);
}

describe("expandCitations —— 唯一展开器", () => {
  test("命中的句柄展开成真题录(作者/标题/期刊/年份/DOI)", async () => {
    const led = await seed(2);
    const r = expandCitations("如 [[E2]] 所述。", led);
    expect(r.missing).toEqual([]);
    expect(r.used).toEqual(["E2"]);
    expect(r.hits).toBe(1);
    expect(r.changed).toBe(true);
    expect(r.text).not.toContain("[[E2]]");
    expect(r.text).toContain("Paper 2");
    expect(r.text).toContain("10.1/x2");
    expect(r.text).toContain("2021");
    expect(r.text).toContain("Zhang Y");
  });

  test("未入账编号:原文原样退回 + missing 列出(半展开的文本绝不落盘)", async () => {
    const led = await seed(1);
    const src = "真的 [[E1]] 与假的 [[E99]]。";
    const r = expandCitations(src, led);
    expect(r.missing).toEqual(["E99"]);
    expect(r.text).toBe(src); // 未做任何替换
    expect(r.changed).toBe(false);
  });

  test("空账本 + 有句柄 = 全部 missing(存量会话不会被静默放行)", () => {
    const r = expandCitations("见 [[E1]]", []);
    expect(r.missing).toEqual(["E1"]);
    expect(r.hits).toBe(1);
  });

  test("无句柄文本零改动、零 used/missing", async () => {
    const led = await seed(1);
    const r = expandCitations("普通正文,没有句柄。", led);
    expect(r).toMatchObject({ hits: 0, used: [], missing: [], changed: false } satisfies Partial<CitationExpansion>);
  });

  test("形态漂移归一:[[e007]] / [[ E1 ]] 都指向 E1", async () => {
    const led = await seed(1);
    for (const h of ["[[e001]]", "[[ E1 ]]", "[[E01]]"]) {
      const r = expandCitations(`x ${h} y`, led);
      expect(r.used).toEqual(["E1"]);
    }
  });

  test("展开文本对 Markdown 表格 / HTML / JS 字符串字面量同时安全", async () => {
    const led = await seed(1); // E1 的标题里塞了 " < > { } | \ [ ]
    const r = expandCitations("[[E1]]", led);
    for (const bad of ['"', "'", "`", "\\", "<", ">", "{", "}", "[", "]", "|", "\n"]) {
      expect(r.text).not.toContain(bad);
    }
    // 真的能塞进 JS 字符串字面量而不炸(BuildDeck 的 bundle 就是这个形状)。
    const js = `const s = "见 ${r.text}";`;
    expect(() => new Function(js)).not.toThrow();
  });

  test('onMissing="mark":未入账编号就地变成可见破引用标记,不留原句柄', async () => {
    const led = await seed(1);
    const r = expandCitations("见 [[E1]] 与 [[E42]]。", led, { onMissing: "mark" });
    expect(r.changed).toBe(true);
    expect(r.text).toContain("未入账引用 E42");
    expect(r.text).not.toContain("[[E42]]");
    expect(r.text).toContain("10.1/x1"); // 命中的那条照常展开
  });

  test("行内形态不含 E 编号(交付给用户的文件里只留可独立核验的书目事实)", async () => {
    const led = await seed(1);
    expect(renderCitationInline(led[0]!)).not.toContain("E1");
  });

  test("3 人以上作者缩成「第一作者 等」(账本行与行内形态同一套口径)", async () => {
    const led = await seed(1);
    expect(renderCitationInline(led[0]!)).toContain("Zhang Y 等");
  });
});

describe("citationFailureText —— 硬失败必须可自救", () => {
  test("含缺失 id + 账本有效区间 + EvidenceGet 建议 + 回到本工具", () => {
    const t = citationFailureText(["E9", "E12"], 4, "ExportDocument(文档导出)");
    expect(t).toContain("E9, E12");
    expect(t).toContain("E1–E4");
    expect(t).toContain("EvidenceGet");
    expect(t).toContain("检索工具");
    expect(t).toContain("ExportDocument");
  });

  test("空账本时说清「没有任何可引用的编号」,不给出 E1–E0 这种假区间", () => {
    const t = citationFailureText(["E3"], 0, "BuildDeck(演示稿构建)");
    expect(t).toContain("账本为空");
    expect(t).not.toContain("E1–E0");
  });
});

describe("引用契约注入 —— 按会话有无账本分档", () => {
  test("账本为空 → renderDigest 返回空串,契约一个字都不注入", () => {
    expect(renderDigest([], [])).toBe("");
  });

  test("账本非空 → digest 里带契约(且说清展不开会构建失败)", async () => {
    const led = await seed(1);
    const d = renderDigest(led, []);
    expect(d).toContain(CITATION_CONTRACT);
    expect(CITATION_CONTRACT).toContain("[[E7]]");
    expect(CITATION_CONTRACT).toContain("失败");
  });
});

describe("deliver —— fs 适配层", () => {
  test("无句柄文本走快路径:不读账本(ledgerTotal 保持 0)", async () => {
    await seed(3);
    const r = await resolveTextForDelivery(workDir, "没有句柄");
    expect(r.hits).toBe(0);
    expect(r.ledgerTotal).toBe(0);
  });

  test("有句柄时带回账本条数,供失败文本给有效区间", async () => {
    await seed(3);
    const r = await resolveTextForDelivery(workDir, "见 [[E2]]");
    expect(r.ledgerTotal).toBe(3);
    expect(r.used).toEqual(["E2"]);
  });

  test("读不出来的文件返回 null(跳过闸,而不是误报成引用问题)", async () => {
    expect(await resolveFileForDelivery(workDir, join(workDir, "nope.md"))).toBeNull();
  });
});

describe("ExportDocument 交付边界闸", () => {
  const tool = builtinRegistry.get("ExportDocument")!;
  const ctx = () => ({ workDir, allowBash: false, net: "none" as const, addDirs: [] });

  test("未入账句柄 → 硬失败,且 pandoc 之前就拦下(out/ 里不生成任何文件)", async () => {
    await seed(1);
    await writeFile(join(workDir, "doc.md"), "# 稿\n见 [[E1]] 和 [[E77]]。\n", "utf8");
    const r = await tool.run({ source_path: "doc.md", target_format: "docx" }, ctx());
    expect(r.isError).toBe(true);
    const t = r.content[0]!.text;
    expect(t).toContain("E77");
    expect(t).toContain("EvidenceGet");
    expect(t).toContain("E1–E1");
    expect(r.userMessage).toBeTruthy();
    // 硬失败 = 交付物不存在。
    await expect(readFile(join(workDir, "out", "doc.docx"))).rejects.toThrow();
  });

  test("句柄全部命中 → 不拦,且不改模型的源文件(下一轮还要按句柄改稿)", async () => {
    await seed(1);
    const src = "# 稿\n见 [[E1]]。\n";
    await writeFile(join(workDir, "doc.md"), src, "utf8");
    const r = await tool.run({ source_path: "doc.md", target_format: "docx" }, ctx());
    // pandoc 在测试环境可能不存在 —— 只断言"没有被引用闸拦住",不断言导出成功。
    if (r.isError) expect(r.content[0]!.text).not.toContain("EvidenceGet");
    expect(await readFile(join(workDir, "doc.md"), "utf8")).toBe(src);
  });
});

describe("artifacts 发帧前展开", () => {
  const sink = () => {
    const frames: Record<string, unknown>[] = [];
    return {
      frames,
      sink: {
        frame: (f: Record<string, unknown>) => frames.push(f),
        error: () => {},
        requestPermission: async () => true,
      },
    };
  };

  test("out/ 里的 .md 交付物就地展开成真题录,帧里的 size 跟着更新", async () => {
    const led = await seed(2);
    const base = await snapshotOut(workDir);
    await mkdir(join(workDir, "out"), { recursive: true });
    await writeFile(join(workDir, "out", "report.md"), "结论见 [[E2]]。\n", "utf8");
    const { frames, sink: s } = sink();
    await emitArtifacts(workDir, base, s as never);

    const onDisk = await readFile(join(workDir, "out", "report.md"), "utf8");
    expect(onDisk).not.toContain("[[E2]]");
    expect(onDisk).toContain("10.1/x2");
    const f = frames.find((x) => x.path === "out/report.md")!;
    expect(f).toBeTruthy();
    expect(f.size).toBe(Buffer.byteLength(onDisk, "utf8"));
    expect(led.length).toBe(2);
  });

  test("未入账句柄 → 落盘文件里是可见破引用标记(伪造的句柄绝不会变成像真的题录)", async () => {
    await seed(1);
    const base = await snapshotOut(workDir);
    await mkdir(join(workDir, "out"), { recursive: true });
    await writeFile(join(workDir, "out", "r.md"), "见 [[E1]] 与 [[E99]]。\n", "utf8");
    const { sink: s } = sink();
    await emitArtifacts(workDir, base, s as never);
    const onDisk = await readFile(join(workDir, "out", "r.md"), "utf8");
    expect(onDisk).toContain("未入账引用 E99");
    expect(onDisk).not.toContain("[[E99]]");
  });

  test("二进制交付物(.docx)不被读改 —— 它的闸在生成时刻", async () => {
    await seed(1);
    const base = await snapshotOut(workDir);
    await mkdir(join(workDir, "out"), { recursive: true });
    const bin = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x5b, 0x5b, 0x45, 0x31, 0x5d, 0x5d]);
    await writeFile(join(workDir, "out", "a.docx"), bin);
    const { sink: s } = sink();
    await emitArtifacts(workDir, base, s as never);
    expect(Buffer.compare(await readFile(join(workDir, "out", "a.docx")), bin)).toBe(0);
  });
});

describe("账本 record 形态回归(展开器依赖的字段)", () => {
  test("展开只用账本里真的存在的字段,缺字段不崩", () => {
    const r: EvidenceRecord = {
      id: "E5",
      key: "t:x",
      origin: "user_text",
      first_seen: { turn: 1, tool: "x" },
      has_fulltext: false,
      read_marks: [],
    };
    expect(renderCitationInline(r)).toBe("(E5)"); // 一个字段都没有时退回 id,不产出空括号
    expect(expandCitations("[[E5]]", [r]).missing).toEqual([]);
  });
});
