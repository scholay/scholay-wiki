import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { snapshotOut, emitArtifacts, derivedName } from "./artifacts.ts";
import type { EventSink } from "./types.ts";

// 「编辑了却改不到」的回归(2026-08-07 修 R1)。
//
// 生产实测:agent_artifacts 里有 14 条 `-N` 后缀副本,与基名成对同存、内容不同
// (yoyo_long.csv 903B @01:10:42 与 yoyo_long-2.csv 900B @01:12:10 在同一个会话里)。
// 机制:模型/脚本把交付物写在会话根,relocateStrays 用 copyFile 复制进 out/;
// 下一轮源文件重新生成 → 撞上自己上一轮留下的副本 → 排 `-N`。
// 下游 harvest 是 upsert-only、锚是路径 ⇒ 旧卡永远停在第一版,用户看到的是
// 「多了一张新卡,我要改的那张没变」。

function sink(): { frames: any[]; sink: EventSink } {
  const frames: any[] = [];
  return { frames, sink: { frame: (f: any) => frames.push(f) } as unknown as EventSink };
}

let wd = "";
beforeEach(async () => { wd = await mkdtemp(join(tmpdir(), "reloc-")); });
afterEach(async () => { await rm(wd, { recursive: true, force: true }); });

describe("derivedName", () => {
  test("会话根文件保持原名(最常见情形,用户要看到他预期的名字)", () => {
    expect(derivedName("报告.docx")).toBe("报告.docx");
  });
  test("带目录的取末几级,名字自解释", () => {
    expect(derivedName("slides/index.html")).toBe("slides-index.html");
    expect(derivedName("a/b/c/report.md")).toBe("b-c-report.md");
  });
  test("不同目录下的同名文件派生出不同名字(否则会互排无意义的 index-2.html)", () => {
    expect(derivedName("slides/index.html")).not.toBe(derivedName("docs/index.html"));
  });
});

describe("relocateStrays 的身份规则", () => {
  test("🔴 同一个源文件反复重新生成 → 恒定映射到同一张卡,内容跟着更新", async () => {
    // 第一轮:根目录写出交付物
    let base = await snapshotOut(wd);
    await writeFile(join(wd, "yoyo_long.csv"), "a,b\n1,2\n", "utf8");
    let s = sink();
    await emitArtifacts(wd, base, s.sink);
    expect(s.frames.map((f) => f.path)).toEqual(["out/yoyo_long.csv"]);

    // 第二轮:同一个源文件被重新生成(内容变了)
    base = await snapshotOut(wd);
    await writeFile(join(wd, "yoyo_long.csv"), "a,b\n1,2\n3,4\n5,6\n", "utf8");
    s = sink();
    await emitArtifacts(wd, base, s.sink);

    // 修复前:这里会是 out/yoyo_long-2.csv(新卡),而 out/yoyo_long.csv 停在第一版。
    expect(s.frames.map((f) => f.path)).toEqual(["out/yoyo_long.csv"]);
    const names = (await readdir(join(wd, "out"))).sort();
    expect(names).toEqual(["yoyo_long.csv"]);

    // 第三轮再来一次,仍然只有一张卡。
    base = await snapshotOut(wd);
    await writeFile(join(wd, "yoyo_long.csv"), "a,b\n9,9\n", "utf8");
    s = sink();
    await emitArtifacts(wd, base, s.sink);
    expect(await readdir(join(wd, "out"))).toEqual(["yoyo_long.csv"]);
  });

  test("out/ 里的字节确实被更新成了最新版(不是只有帧对、文件是旧的)", async () => {
    let base = await snapshotOut(wd);
    await writeFile(join(wd, "报告.md"), "v1", "utf8");
    await emitArtifacts(wd, base, sink().sink);

    base = await snapshotOut(wd);
    await writeFile(join(wd, "报告.md"), "v2-改过了", "utf8");
    await emitArtifacts(wd, base, sink().sink);

    const got = await Bun.file(join(wd, "out", "报告.md")).text();
    expect(got).toBe("v2-改过了"); // 用户下载到的必须是新版
  });

  test("🔴 两个**不同**的源撞到同一个名字时仍然排 -N(不许互相覆盖)", async () => {
    const base = await snapshotOut(wd);
    // 同名但不同源。⚠️ 不能用 index.html —— 它在 ROOT_SKIP_FILES 里,根目录那份根本不会被扫到。
    await writeFile(join(wd, "图表.html"), "root", "utf8");
    await mkdir(join(wd, "sub"), { recursive: true });
    await writeFile(join(wd, "sub", "图表.html"), "sub", "utf8");
    const s = sink();
    await emitArtifacts(wd, base, s.sink);
    const paths = s.frames.map((f) => f.path).sort();
    // 根的保持原名,子目录的带上目录名 —— 两份都在,谁也没被顶掉。
    expect(paths).toEqual(["out/sub-图表.html", "out/图表.html"].sort());
    expect(await Bun.file(join(wd, "out", "图表.html")).text()).toBe("root");
    expect(await Bun.file(join(wd, "out", "sub-图表.html")).text()).toBe("sub");
  });

  test("映射表落在引擎保留区,不出现在交付面", async () => {
    const base = await snapshotOut(wd);
    await writeFile(join(wd, "x.md"), "hi", "utf8");
    const s = sink();
    await emitArtifacts(wd, base, s.sink);
    // 保留区里有表
    expect(await Bun.file(join(wd, "analysis", ".relocate-map.json")).exists()).toBe(true);
    // 但它既不在 out/ 里,也没有变成任何一张卡
    expect(await readdir(join(wd, "out"))).toEqual(["x.md"]);
    expect(s.frames.every((f) => !String(f.path).includes("relocate-map"))).toBe(true);
  });

  test("映射表损坏 → 降级重排,不崩、不丢文件", async () => {
    await mkdir(join(wd, "analysis"), { recursive: true });
    await writeFile(join(wd, "analysis", ".relocate-map.json"), "{ 这不是 JSON", "utf8");
    const base = await snapshotOut(wd);
    await writeFile(join(wd, "y.md"), "hi", "utf8");
    const s = sink();
    await emitArtifacts(wd, base, s.sink);
    expect(s.frames.map((f) => f.path)).toEqual(["out/y.md"]);
  });
});
