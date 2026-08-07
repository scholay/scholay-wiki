// 2026-07 线上审计:成果交付 diff 面扩到会话根目录(越界写入的交付物不再丢失)+ 中间态降噪。
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { snapshotOut, diffOut, emitArtifacts, type OutSnapshot } from "./artifacts.ts";
import type { EventSink } from "./types.ts";
import { EVIDENCE_DIR } from "../evidence/paths.ts";

// artifacts.ts 里 OUT_DIR 是私有常量;测试侧复述一份(值改了这里会红,正是想要的耦合)。
const OUT_DIR = "out";

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
    // ⏪ 2026-08-07:名字从 `index.html` 变成 `slides-index.html`(源路径派生,见 artifacts.ts derivedName)。
    //    动机不只是好看:`index.html` 这种通用名极易与别处的同名文件互撞,撞了就排出对用户
    //    毫无意义的 `index-2.html`;带上来源目录后名字自解释,且两个不同的源天然不同名。
    expect(frames).toEqual([
      { type: "artifact", name: "slides-index.html", path: "out/slides-index.html", kind: "file", mime: "text/html", size: expect.any(Number) },
    ]);
    expect(await readFile(join(workDir, "out", "slides-index.html"), "utf8")).toBe("<h1>x</h1>");
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
    // ⏪ 2026-08-07:期望值从 `报告-2.md` 变成 `草稿-报告.md`。**安全属性没变**(正品仍未被覆盖),
    //    变的是重名时取什么名字:序号改成**源路径派生**。理由见 artifacts.ts 的 derivedName ——
    //    `报告-2.md` 对用户是个无意义的数字,而 `草稿-报告.md` 自己说明了它来自哪儿。
    expect(paths).toEqual(["out/报告.md", "out/草稿-报告.md"]);
    expect(await readFile(join(workDir, "out", "报告.md"), "utf8")).toBe("out 里的正品"); // 正品未被覆盖
    expect(await readFile(join(workDir, "out", "草稿-报告.md"), "utf8")).toBe("越界的另一份");
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
    // ⏪ 2026-08-07:同上,改名规则换成源路径派生;跨轮不覆盖这条**性质本身**仍被钉着。
    expect(frames.map((f) => f.path)).toEqual(["out/草稿-报告.md"]); // 只发本轮这一张,且已改名
    expect(await readFile(join(workDir, "out", "报告.md"), "utf8")).toBe("上一轮的正品");
    expect(await readFile(join(workDir, "out", "草稿-报告.md"), "utf8")).toBe("本轮越界的另一份");
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
// ⚠️ 本 describe 原先是**源码文本断言**(grep `const strays = decls.filter(` 段内是否含 EVIDENCE_DIR)。
//    那种形态挡不住本节第二条测试暴露的真 bug:过滤条件写对了,但**过滤结果没被用在复制循环里**
//    (`strays` 只喂了「无 stray 就早退」那一行,循环遍历的仍是 `decls`)。
//    源码断言只能证明「那行字写了」,证明不了「那行字起作用」—— 已整体换成走 emitArtifacts 的行为断言。
describe("引擎保留区不作为交付物来源", () => {
  test("只有 evidence/ 一处越界时:不复制、不发帧(早退路径)", async () => {
    await mkdir(join(workDir, EVIDENCE_DIR), { recursive: true });
    await writeFile(join(workDir, EVIDENCE_DIR, "INDEX.md"), "# 账本内部\n");
    const frames: Record<string, unknown>[] = [];
    await emitArtifacts(workDir, new Map(), collectSink(frames));
    await expect(readdir(join(workDir, OUT_DIR))).rejects.toThrow(); // out/ 压根不该被建出来
    const paths = frames.filter((f) => f.type === "artifact").map((f) => String(f.path ?? ""));
    expect(paths.some((p) => p.startsWith(`${EVIDENCE_DIR}/`)), "早退路径同样不得给保留区文件发产物帧").toBe(false);
  });

  test("🔴 同时存在别的越界文件时:evidence/ 仍不得被复制进 out/", async () => {
    // 2026-08-05 回归:这正是上一版修复漏掉的那一半。`strays` 排除了 evidence/,
    // 但它只用于「strays.length === 0 → 早退」;一旦存在任何**别的** stray,早退不成立,
    // 复制循环遍历 `decls`(未过滤)、循环体内只跳过 out/ ⇒ evidence/INDEX.md 照样被复制。
    await mkdir(join(workDir, EVIDENCE_DIR), { recursive: true });
    await writeFile(join(workDir, EVIDENCE_DIR, "INDEX.md"), "# 账本内部\n");
    await writeFile(join(workDir, "notes.md"), "# 真的越界交付物\n");

    const frames: Record<string, unknown>[] = [];
    await emitArtifacts(workDir, new Map(), collectSink(frames));

    const delivered = await readdir(join(workDir, OUT_DIR));
    expect(delivered, "真正的越界交付物应当被搬进 out/").toContain("notes.md");
    expect(
      delivered.filter((f) => f.startsWith("INDEX")),
      "\nevidence/ 又被当成可交付的 stray 了。\n" +
        "后果:账本内部文件(INDEX.md)每轮被复制进 out/,污染用户交付面。\n" +
        "注意:只有当会话里**同时存在别的越界文件**时才复现 —— 只有 evidence/ 一处时走早退路径,看不出来。\n",
    ).toEqual([]);

    const paths = frames.filter((f) => f.type === "artifact").map((f) => String(f.path ?? ""));
    expect(paths.some((p) => p.startsWith(`${EVIDENCE_DIR}/`)), "保留区文件不得出现在产物帧里").toBe(false);
  });
});

// ── 交付闸的调用时机(2026-08-06 P1)──────────────────────────────────────────
//
// 🔴 闸原本跑在 `snapshotOut` 之前,而 numcheck **只扫 out/**。
//    模型最常见的落点是会话根(`Write("MBI分析结果.docx")`)—— 那份文件在闸跑的时候
//    还不在 out/ 里,随后才被 `relocateStrays` 搬进去 ⇒ **交付当轮 100% 免检**,
//    而分析交付通常就发生在最后一轮。
//
// 这条是**结构不变量**(照 tools/statRunSemaphore.test.ts 的形态):断言两个调用在
// emitArtifacts 里的先后。之所以不写成行为测试:闸要真跑得起 statkit 才有观察点,
// 而单测环境里没有 —— 那样写出来的会是一条永远绿的规则。
// ⚠️ 扫源码前**必须剥注释**:本段注释里就出现了 relocateStrays 与 runDeliveryGate
//    两个词,不剥的话顺序判定会被自己的解释文字带偏(同款坑在 statkitPaths.test.ts 撞过)。
describe("结构不变量 · 交付闸在 relocateStrays 之后", () => {
  const src = readFileSync(join(import.meta.dir, "artifacts.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const body = src.slice(src.indexOf("export async function emitArtifacts"));

  test("锚点:两个调用都还在(改名/删除即红)", () => {
    expect(body).toContain("relocateStrays(");
    expect(body).toContain("runDeliveryGate(");
  });

  test("闸跑在搬运之后 —— 否则它看不见刚被搬进 out/ 的交付物", () => {
    expect(body.indexOf("runDeliveryGate(")).toBeGreaterThan(body.indexOf("relocateStrays("));
  });

  test("被隔离的产物不发帧(用返回值过滤,不靠时序)", () => {
    expect(body).toContain("quarantined");
    // 发帧循环必须遍历过滤后的列表,而不是 relocateStrays 的原始返回
    expect(body).toMatch(/for \(const d of shipped\)/);
  });
});

// ── 异常终止轮也必须过交付闸(2026-08-06 P1)──────────────────────────────────
//
// 🔴 交付闸此前只挂在 `emitArtifacts` 里,而它被 `!terminalSent` 守着 ⇒
//    六个 sendError 调用点(round_cap / budget / upstream / empty_turn …)整轮跳过闸。
//    而 backend 的产物收割是 on-list 的 `ListWorkspaceFiles(out/)`,**与帧无关**:
//    文件照样被收割、照样能下载。闸恰好在「模型最可能乱写」的那类轮上全面失效 ——
//    模型第 20 轮手写一份含自编 p 值的 docx、第 24 轮触 round_cap,闸一次都没跑。
//
// 判据同上一族:结构不变量(闸要真跑得起 statkit 才有行为观察点,单测环境没有)。
// 扫源码前剥注释 —— 本段注释里就写着 terminalSent 与 runDeliveryGate。
describe("结构不变量 · 异常终止轮不跳过交付闸", () => {
  const src = readFileSync(join(import.meta.dir, "turnLoop.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  test("turnLoop 直接引用了交付闸(不只经 emitArtifacts)", () => {
    expect(src).toContain("runDeliveryGate");
  });

  test("`!terminalSent` 的 else 支里跑闸 —— 异常轮的产物也要被检查", () => {
    // 取 finally 里那一段:`if (!terminalSent && outBaseline) { emitArtifacts } else if (outBaseline) { gate }`
    const i = src.indexOf("if (!terminalSent && outBaseline)");
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 1200);
    expect(seg).toContain("else if (outBaseline)");
    expect(seg.indexOf("runDeliveryGate")).toBeGreaterThan(seg.indexOf("else if (outBaseline)"));
  });
});
