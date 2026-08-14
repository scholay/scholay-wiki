// Run 引擎的分页信号契约(2026-08 Phase 1)。
//
// 🔴 这两条守的是同一件事的两面,而且**破坏任一面都不会有红灯**:
//
//   ① maxRounds 不下发时,轮上限行为必须与今天**逐字等价**(`?? MAX_TOOL_ROUNDS`)。
//      这是 Phase 1「零回归」的全部保证 —— 一旦有人把默认值改成别的,
//      所有存量的单体对话会在完全不同的轮数上被切断,而没有任何测试会红。
//
//   ② maxRounds 在场时,轮尽必须发 **code="step_incomplete"** 而不是 round_cap。
//      这个字符串是**跨包契约**:backend 的 agentrun/engine.go `isStepIncomplete` 按它判定
//      「这一步只是分页,不是失败」。改了这边不改那边,Run 的每一步都会被当成失败重排队,
//      attempt 很快耗尽 → 整个 Run 判死,而日志里看起来像"模型总是失败"。
//
// 判据用源码级断言:turnLoop 没有端到端 harness(驱动它要连 LLM 流 / 工具注册表 / MCP 三套 mock),
// 而这两条不变式的本质就是**源码里那一行的形状**。

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "turnLoop.ts"), "utf8");

describe("Run 分页信号契约", () => {
  test("守卫自证:确实读到了 turnLoop 源码", () => {
    expect(SRC.length).toBeGreaterThan(10_000);
    expect(SRC).toContain("MAX_TOOL_ROUNDS");
  });

  test("① 轮上限是单点参数化,且默认回落 MAX_TOOL_ROUNDS(零回归的全部保证)", () => {
    expect(
      SRC.includes("input.maxRounds ?? MAX_TOOL_ROUNDS"),
      "\n轮上限不再是 `input.maxRounds ?? MAX_TOOL_ROUNDS` 了。\n" +
        "若改成别的默认值,所有存量单体对话会在不同轮数被切断 —— 静默的行为回归。\n",
    ).toBe(true);
  });

  test("② maxRounds 在场时轮尽发 step_incomplete(跨包契约,backend 按此字符串判分页)", () => {
    const i = SRC.indexOf("input.maxRounds ?? MAX_TOOL_ROUNDS");
    expect(i).toBeGreaterThan(-1);
    const seg = SRC.slice(i, i + 1400);
    expect(
      seg.includes('"step_incomplete"'),
      "\nmaxRounds 在场时不再发 step_incomplete。\n" +
        "后果:backend 的 agentrun 会把每一步的正常分页当成失败重排队,attempt 很快耗尽 → Run 判死,\n" +
        "而日志看起来像「模型总是失败」,极难定位。该字符串与 agentrun/engine.go 的 isStepIncomplete 成对。\n",
    ).toBe(true);
    // 单体路径必须仍然发 round_cap(否则旧前端文案链路断掉)。
    expect(seg).toContain('"round_cap"');
  });

  test("③ 两条分支不能互换:step_incomplete 必须在 maxRounds 在场的分支里", () => {
    const i = SRC.indexOf("input.maxRounds ?? MAX_TOOL_ROUNDS");
    const seg = SRC.slice(i, i + 1400);
    const guard = seg.indexOf("if (input.maxRounds)");
    const paged = seg.indexOf('"step_incomplete"');
    const capped = seg.indexOf('"round_cap"');
    expect(guard).toBeGreaterThan(-1);
    expect(paged).toBeGreaterThan(guard); // 分页在 maxRounds 守卫**之内**
    expect(
      capped > paged,
      "\nround_cap 跑到 step_incomplete 前面了 —— 单体对话会被误判成 Run 的分页。\n",
    ).toBe(true);
  });
});
