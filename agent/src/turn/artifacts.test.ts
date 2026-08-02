// 2026-07 线上审计:成果交付 diff 面扩到会话根目录(越界写入的交付物不再丢失)+ 中间态降噪。
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotOut, diffOut, emitArtifacts, type OutSnapshot } from "./artifacts.ts";
import type { EventSink } from "./types.ts";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "artifacts-test-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function collectSink(frames: Record<string, unknown>[]): EventSink {
  return {
    frame(f) {
      frames.push(f);
    },
    error() {},
    requestPermission: () => Promise.resolve(false),
  };
}

describe("artifacts(成果交付 diff)", () => {
  test("./out/ 原语义不变:新增文件按顶层名声明", async () => {
    const baseline = await snapshotOut(workDir);
    await mkdir(join(workDir, "out"), { recursive: true });
    await writeFile(join(workDir, "out", "report.md"), "# 报告");
    const decls = diffOut(baseline, await snapshotOut(workDir));
    expect(decls).toEqual([
      { name: "report.md", path: "out/report.md", kind: "file", mime: "text/markdown", size: expect.any(Number) },
    ]);
  });

  test("越界写入的可交付文件被捕获(线上 26 条丢失场景):slides/index.html、work/x.md、根级 csv", async () => {
    const baseline = await snapshotOut(workDir);
    await mkdir(join(workDir, "slides"), { recursive: true });
    await writeFile(join(workDir, "slides", "index.html"), "<h1>deck</h1>");
    await mkdir(join(workDir, "work"), { recursive: true });
    await writeFile(join(workDir, "work", "综述.md"), "…");
    await writeFile(join(workDir, "数据.csv"), "a,b");
    const decls = diffOut(baseline, await snapshotOut(workDir));
    const byPath = new Map(decls.map((d) => [d.path, d]));
    expect(byPath.get("slides/index.html")?.name).toBe("index.html");
    expect(byPath.get("work/综述.md")?.name).toBe("综述.md");
    expect(byPath.get("数据.csv")?.mime).toBe("text/csv");
    expect(decls.length).toBe(3);
  });

  test("排除面:uploads/references/隐藏文件/非交付扩展名/根级工作文件(document.md 等)不上抛", async () => {
    const baseline = await snapshotOut(workDir);
    await mkdir(join(workDir, "uploads"), { recursive: true });
    await writeFile(join(workDir, "uploads", "论文.md"), "附件物料");
    await mkdir(join(workDir, "references"), { recursive: true });
    await writeFile(join(workDir, "references", "引用.md"), "引用物料");
    await writeFile(join(workDir, "document.md"), "prism 主稿");
    await writeFile(join(workDir, "index.html"), "boltslides 幻灯源码");
    await writeFile(join(workDir, ".draft.md"), "隐藏草稿");
    await writeFile(join(workDir, "notes.txt"), "非交付扩展名");
    expect(diffOut(baseline, await snapshotOut(workDir))).toEqual([]);
    // 子目录同名文件不受根级排除影响(slides/index.html 仍是越界交付物)
    await mkdir(join(workDir, "slides"), { recursive: true });
    await writeFile(join(workDir, "slides", "index.html"), "<p>x</p>");
    const decls = diffOut(baseline, await snapshotOut(workDir));
    expect(decls.map((d) => d.path)).toEqual(["slides/index.html"]);
  });

  test("基线内未变更的文件不重复上抛", async () => {
    await mkdir(join(workDir, "slides"), { recursive: true });
    await writeFile(join(workDir, "slides", "old.html"), "旧");
    const baseline = await snapshotOut(workDir);
    await writeFile(join(workDir, "新增.md"), "本轮新增");
    const decls = diffOut(baseline, await snapshotOut(workDir));
    expect(decls.map((d) => d.path)).toEqual(["新增.md"]);
  });

  test("中间态降噪:同轮 X.docx 与 X.docx.md 并存时 .docx.md 不上抛;孤儿 .docx.md 照常上抛", async () => {
    const baseline = await snapshotOut(workDir);
    await mkdir(join(workDir, "out"), { recursive: true });
    await writeFile(join(workDir, "out", "报告.docx"), "docx-bytes");
    await writeFile(join(workDir, "out", "报告.docx.md"), "# markdown 中间稿");
    await writeFile(join(workDir, "out", "孤儿.docx.md"), "# 无成品的中间稿");
    const decls = diffOut(baseline, await snapshotOut(workDir));
    const paths = decls.map((d) => d.path).sort();
    expect(paths).toEqual(["out/孤儿.docx.md", "out/报告.docx"]); // UTF-16 码位序:孤(U+5B64) < 报(U+62A5)
  });

  test("emitArtifacts 帧结构不变 + 落点纠偏:越界交付物复制进 out/ 后再上抛", async () => {
    const baseline = await snapshotOut(workDir);
    await mkdir(join(workDir, "slides"), { recursive: true });
    await writeFile(join(workDir, "slides", "index.html"), "<h1>x</h1>");
    const frames: Record<string, unknown>[] = [];
    await emitArtifacts(workDir, baseline, collectSink(frames));
    // backend 产物链路只认 out/<basename>(artifact.go artifactRelPath / artifact_harvest.go),
    // 故越界条目必须被搬进 out/ 再上抛,否则用户拿到的是点了 404 的卡。
    expect(frames).toEqual([
      { type: "artifact", name: "index.html", path: "out/index.html", kind: "file", mime: "text/html", size: expect.any(Number) },
    ]);
    expect(await readFile(join(workDir, "out", "index.html"), "utf8")).toBe("<h1>x</h1>");
  });

  test("落点纠偏 · 同名不覆盖:out/ 已有同名成品时越界文件加后缀", async () => {
    await mkdir(join(workDir, "out"), { recursive: true });
    const baseline = await snapshotOut(workDir);
    await writeFile(join(workDir, "out", "报告.md"), "out 里的正品");
    await mkdir(join(workDir, "草稿"), { recursive: true });
    await writeFile(join(workDir, "草稿", "报告.md"), "越界的另一份");
    const frames: Record<string, unknown>[] = [];
    await emitArtifacts(workDir, baseline, collectSink(frames));
    const paths = frames.map((f) => f.path).sort();
    expect(paths).toEqual(["out/报告-2.md", "out/报告.md"]);
    expect(await readFile(join(workDir, "out", "报告.md"), "utf8")).toBe("out 里的正品"); // 正品未被覆盖
    expect(await readFile(join(workDir, "out", "报告-2.md"), "utf8")).toBe("越界的另一份");
  });

  // 2026-07 审查 [4]/[18]:上一条用例里 out/报告.md 是在 baseline **之后**写的,所以它在 decls 里、
  // 也就在 taken 里 —— 恰好绕开了缺口。真实的跨轮场景是「上一轮已交付、本轮未变」→ 不进 diff。
  test("落点纠偏 · 跨轮不覆盖:baseline 之前就存在的 out/ 交付物不被越界同名文件顶掉", async () => {
    await mkdir(join(workDir, "out"), { recursive: true });
    await writeFile(join(workDir, "out", "报告.md"), "上一轮的正品"); // 已交付,本轮不再变更
    const baseline = await snapshotOut(workDir);
    await mkdir(join(workDir, "草稿"), { recursive: true });
    await writeFile(join(workDir, "草稿", "报告.md"), "本轮越界的另一份");
    const frames: Record<string, unknown>[] = [];
    await emitArtifacts(workDir, baseline, collectSink(frames));
    expect(frames.map((f) => f.path)).toEqual(["out/报告-2.md"]); // 只发本轮这一张,且已改名
    expect(await readFile(join(workDir, "out", "报告.md"), "utf8")).toBe("上一轮的正品");
    expect(await readFile(join(workDir, "out", "报告-2.md"), "utf8")).toBe("本轮越界的另一份");
  });

  // 2026-07 审查 [8]:400 帧会放大成 400 行 journal + 400 次 copyFile + 400 个 MinIO 对象。
  test("有界:一轮帧数封顶 20,且 relocateStrays 的复制次数一并受限", async () => {
    const baseline = await snapshotOut(workDir);
    await mkdir(join(workDir, "work"), { recursive: true });
    for (let i = 0; i < 25; i++) await writeFile(join(workDir, "work", `d${i}.csv`), "a,b");
    const frames: Record<string, unknown>[] = [];
    await emitArtifacts(workDir, baseline, collectSink(frames));
    expect(frames.length).toBe(20);
    expect((await readdir(join(workDir, "out"))).length).toBe(20); // 只复制了 20 次
  });

  // 2026-07 审查 [8]:整棵跳过原先只在 depth===0 生效,嵌套的依赖/构建目录会吃光文件预算。
  test("有界:依赖/构建/缓存目录在任意层整棵跳过(venv / dist / target / node_modules)", async () => {
    const baseline = await snapshotOut(workDir);
    for (const junk of ["data/venv/lib", "repo/dist", "repo/target/doc", "pkg/node_modules/x", "c/cache"]) {
      await mkdir(join(workDir, junk), { recursive: true });
      await writeFile(join(workDir, junk, "垃圾.md"), "x");
    }
    await mkdir(join(workDir, "work"), { recursive: true });
    await writeFile(join(workDir, "work", "综述.md"), "真交付物");
    const decls = diffOut(baseline, await snapshotOut(workDir));
    expect(decls.map((d) => d.path)).toEqual(["work/综述.md"]);
  });

  test("落点纠偏幂等:搬运产生的 out/ 副本不会在下一轮重复上抛", async () => {
    const baseline = await snapshotOut(workDir);
    await mkdir(join(workDir, "slides"), { recursive: true });
    await writeFile(join(workDir, "slides", "deck.html"), "<h1>v1</h1>");
    await emitArtifacts(workDir, baseline, collectSink([]));
    // 下一轮:基线含已搬运的 out/deck.html,源文件未再变 → 零帧
    const nextBaseline = await snapshotOut(workDir);
    const frames: Record<string, unknown>[] = [];
    await emitArtifacts(workDir, nextBaseline, collectSink(frames));
    expect(frames).toEqual([]);
  });

  test("diffOut 纯函数:目录聚合(zip)语义保留", () => {
    const baseline: OutSnapshot = new Map();
    const current: OutSnapshot = new Map([["out/figures", { size: 10, mtimeMs: 1, kind: "dir" as const }]]);
    const decls = diffOut(baseline, current);
    expect(decls).toEqual([{ name: "figures", path: "out/figures", kind: "dir", mime: "application/zip", size: 10 }]);
  });
});

// 2026-08-02 真实会话回归:引擎保留区不得成为交付物来源。
// 实测症状:evidence/INDEX.md 被当 stray 反复复制成 out/INDEX-3.md / INDEX-4.md……每轮一份。
describe("引擎保留区不作为交付物来源", () => {
  test("evidence/ 下的文件不进 relocate(与保留区拒写是同一条边界的两侧)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./artifacts.ts", import.meta.url), "utf8");
    const i = src.indexOf("const strays = decls.filter(");
    expect(i).toBeGreaterThan(-1);
    const seg = src.slice(i, i + 400);
    expect(
      seg.includes("EVIDENCE_DIR"),
      "\nrelocateStrays 又把 evidence/ 当成可交付的 stray 了。\n" +
        "后果:账本内部文件(INDEX.md)每轮被复制进 out/,污染用户交付面。\n",
    ).toBe(true);
  });
});
