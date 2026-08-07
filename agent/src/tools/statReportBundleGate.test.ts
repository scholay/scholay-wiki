import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinRegistry, type ToolCtx } from "./registry.ts";
import { ANALYSIS_DIR } from "../sandbox/reserved.ts";

/**
 * 🔴 StatReport 只能消费引擎保留区里的 bundle —— **行为**测试,不是扫源码。
 *
 * ## 它挡的是什么(2026-08-06 端到端复现过两次)
 *
 * D1 数字锁把 `analysis/` 设成保留区,让模型**写不进** bundle。但此前没有人约束
 * **消费者**:`StatReport` 把模型给的 `bundle` 路径原样拼进 argv、零校验。
 * 于是攻击者根本不碰保留区 ——
 *
 *     Write("cooked.json", <照抄 bundle 结构、数字随便填>)    ← 会话根,模型完全可写
 *     StatReport(bundle="cooked.json", system="cn-core")
 *     ⇒ exit 0,产出真三线表 docx +「t(67.31)=4.106,p<0.001」+ ICMJE 披露。
 *       **全程没有 analysis/ 目录,一次 StatRun 都没跑。** 真实 p 是 0.4653。
 *
 * ## 为什么这几条 case 是这几条
 *
 * 三种绕法各自独立,漏一种闸就等于没有:
 *   · 纯路径      —— 会话根手写(最省事的那条,也是复现用的那条);
 *   · `..` 折算   —— `analysis/../cooked.json` 词法前缀能骗过 `startsWith("analysis/")`;
 *   · 符号链接    —— `ln -s .. analysis/esc` 之后 `analysis/esc/cooked.bundle.json`
 *                    连 `..` 都不出现,只有 canonical 判定(confinePath)拦得住。
 * 外加两条反向 case:**正常路径不能被误伤**(路径闸最常见的翻车形态就是把真活儿也拦了)。
 *
 * ⚠️ 这些 case 全都在**闸之后、spawn 之前**返回,所以本测试不需要容器里的 python/statkit。
 *    真正跑通引擎的那半边由 statkit 侧的 `_assert_engine_bundle` 与 run_tests.py 负责。
 */
describe("StatReport · bundle 必须来自引擎保留区", () => {
  const tool = builtinRegistry.get("StatReport")!;
  let workDir: string;
  const ctx = (): ToolCtx => ({ workDir, allowBash: true, net: "none" });

  const call = async (bundle: string) => {
    const r = await tool.run({ bundle, system: "cn-core" }, ctx());
    const text = r.content.map((c) => c.text).join("");
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { /* 引擎真跑了 */ }
    return { text, parsed, isError: r.isError };
  };

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "statreport-gate-"));
    await mkdir(join(workDir, ANALYSIS_DIR), { recursive: true });
    // 一份"长得像"的伪造 bundle,放在模型可写的会话根。
    await writeFile(join(workDir, "cooked.json"), JSON.stringify({ method: "welch_t" }), "utf8");
    await writeFile(join(workDir, "cooked.bundle.json"), JSON.stringify({ method: "welch_t" }), "utf8");
    // 保留区里一份名字合法的(用来验正常路径不被误伤 —— 它会被放行去 spawn)。
    await writeFile(join(workDir, ANALYSIS_DIR, "abc123.bundle.json"), JSON.stringify({ method: "welch_t" }), "utf8");
    // 符号链接逃逸:analysis/esc -> 会话根
    await symlink("..", join(workDir, ANALYSIS_DIR, "esc")).catch(() => { /* 文件系统不支持就跳过该条 */ });
  });

  afterAll(async () => { await rm(workDir, { recursive: true, force: true }); });

  test("会话根手写的 bundle 被拒(复现用的那条路)", async () => {
    const { parsed } = await call("cooked.json");
    expect(parsed?.reason).toBe("bundle_not_from_engine");
  });

  test("名字对了但不在保留区,照样拒", async () => {
    const { parsed } = await call("cooked.bundle.json");
    expect(parsed?.reason).toBe("bundle_not_from_engine");
  });

  test("`analysis/../` 折算后不在保留区,拒(词法前缀骗不过 canonical 判定)", async () => {
    const { parsed } = await call(`${ANALYSIS_DIR}/../cooked.bundle.json`);
    expect(parsed?.reason).toBe("bundle_not_from_engine");
  });

  test("经保留区内的符号链接逃出去,拒", async () => {
    const { parsed } = await call(`${ANALYSIS_DIR}/esc/cooked.bundle.json`);
    expect(parsed?.reason).toBe("bundle_not_from_engine");
  });

  test("逃出会话目录,拒(且给的是可行动答复而不是崩溃)", async () => {
    const { parsed } = await call("../../etc/passwd.bundle.json");
    expect(parsed?.reason).toBe("bundle_path_rejected");
  });

  test("保留区里但后缀不对,拒(保留区不等于白名单)", async () => {
    await writeFile(join(workDir, ANALYSIS_DIR, "notes.json"), "{}", "utf8");
    const { parsed } = await call(`${ANALYSIS_DIR}/notes.json`);
    expect(parsed?.reason).toBe("bundle_not_from_engine");
  });

  // ── 反向:正常路径不能被误伤 ────────────────────────────────────────────────
  // 判据是「**没有**被路径闸拦下」:后面 spawn statkit 成不成功与本闸无关
  // (本机可能没装 statkit)。所以只断言 reason 不是这两个。
  const passedGate = (parsed: Record<string, unknown> | null) =>
    parsed?.reason !== "bundle_not_from_engine" && parsed?.reason !== "bundle_path_rejected";

  test("StatRun 回的那种路径放行", async () => {
    const { parsed } = await call(`${ANALYSIS_DIR}/abc123.bundle.json`);
    expect(passedGate(parsed)).toBe(true);
  });

  test("带 ./ 前缀的同一份也放行(模型常这么写)", async () => {
    const { parsed } = await call(`./${ANALYSIS_DIR}/abc123.bundle.json`);
    expect(passedGate(parsed)).toBe(true);
  });

  test("jail 内的 /work 绝对路径也放行(模型跑过 Bash 后会学到这个前缀)", async () => {
    const { parsed } = await call(`/work/${ANALYSIS_DIR}/abc123.bundle.json`);
    expect(passedGate(parsed)).toBe(true);
  });

  test("拒绝是可行动答复,不是 isError(否则模型会当工具坏了反复重试)", async () => {
    const { isError } = await call("cooked.json");
    expect(isError).toBe(false);
  });
});
