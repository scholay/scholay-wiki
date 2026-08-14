// 逐帧上报(turn_usage_delta)的结构契约(2026-08)。
//
// 背景:backend 此前对「这一轮花了多少钱」在轮跑完之前一无所知 —— per-call 明细只随终帧
// 一次性回来,所以唯一的调控手段是把预算盖在 user_message 帧上**建议**执行器自己收尾。
// 2026-08-13 线上事故证明建议值在执行器不配合时完全失效:wind-down 按时触发(raw_spent
// 372826 ≥ hard_remaining 270187),模型却继续跑了 21 轮工具,单轮实花是预算的 8.2 倍。
//
// 逐帧上报把「轮内成本」这个数据源补给 backend。这里守的是它**不会被静默削弱**:
//
//   ① 收集点唯一。三个 usage 落点分别是正常轮末、abort 抢救、瞬态重试抢救 ——
//      后两条是异常路径,最容易在后续改动里被漏掉,而漏掉没有任何红灯:
//      硬闸只是少算了一部分成本,表现为「大部分时候管用」,排查时几乎不可能想到这里。
//   ② 帧型字符串是**跨包契约**:backend 的 ws.go extractTurnUsageDelta 按它匹配。
//      改了这边不改那边,硬闸会静默失效(帧被当成未知类型原样广播),而两侧都不会红。
//
// 判据用源码级断言:turnLoop 没有端到端 harness(驱动它要连 LLM 流 / 工具注册表 / MCP 三套
// mock),而这两条不变式的本质就是源码里那几行的形状 —— 与 stepPaging.test.ts 同款手法。

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "turnLoop.ts"), "utf8");

describe("逐帧上报 turn_usage_delta 的结构契约", () => {
  test("守卫自证:确实读到了 turnLoop 源码", () => {
    expect(SRC.length).toBeGreaterThan(10_000);
    expect(SRC).toContain("recordCall");
  });

  test("① calls[] 的唯一写入点是 recordCall —— 不允许任何裸 calls.push 绕过上报", () => {
    // recordCall 自身那一行是唯一合法的 calls.push。多出来的每一处都是一条「不上报的消耗」。
    const pushes = [...SRC.matchAll(/calls\.push\(/g)].length;
    expect(
      pushes,
      "\ncalls.push 出现了 " +
        pushes +
        " 次(应恰好 1 次,即 recordCall 内部那一行)。\n" +
        "多出来的调用点意味着那一次 LLM 消耗**不会**上报给 backend,轮内成本硬闸据此少算 ——\n" +
        "后果是硬闸「大部分时候管用」,而漏掉的恰恰是 abort / 重试这些最贵的异常路径。\n" +
        "请改调 recordCall(...) 而不是 calls.push(...)。\n",
    ).toBe(1);
  });

  test("① 三个 usage 落点全部走 recordCall(正常轮末 + abort 抢救 + 瞬态重试抢救)", () => {
    expect(SRC).toContain("const recordCall = (u: CallUsage) =>"); // 定义在场(箭头函数,不匹配下面的调用式)
    const calls = [...SRC.matchAll(/recordCall\(/g)].length;
    // 恰好 3 个调用点。少了 = 有落点被改回裸 push 或被删掉;多了要确认新落点是真的 LLM 消耗。
    expect(
      calls,
      "\nrecordCall 调用点有 " + calls + " 处(应为 3:正常轮末 + abort 抢救 + 瞬态重试抢救)。\n" +
        "少于 3 = 某条路径的消耗不再上报,硬闸对它失明。\n",
    ).toBe(3);
    // 两条异常路径各自的形状:partialUsage 是它们独有的抢救量,必须经 recordCall 上报。
    const rescues = [...SRC.matchAll(/if \(partialUsage\) recordCall\(/g)].length;
    expect(
      rescues,
      "\nabort / 瞬态重试的 partialUsage 抢救有 " +
        rescues +
        " 处走 recordCall(应为 2)。\n" +
        "这两条路径上的消耗已经真实发生在上游,不上报 = 硬闸对「被中断的昂贵轮」完全失明。\n",
    ).toBe(2);
  });

  test("② 帧型字符串是跨包契约,与 backend ws.go extractTurnUsageDelta 成对", () => {
    expect(
      SRC.includes('type: "turn_usage_delta"'),
      '\n找不到 type: "turn_usage_delta"。\n' +
        "该字符串与 backend/internal/agentbridge/ws.go 的 extractTurnUsageDelta 成对:\n" +
        "改了这边不改那边,帧会被 backend 当成未知类型忽略,轮内成本硬闸静默失效 ——\n" +
        "两侧测试都不会红,只有线上账单会红。\n",
    ).toBe(true);
  });

  test("② 上报的是单次增量,不带会话累计 —— 否则 backend 会双计费", () => {
    const i = SRC.indexOf('type: "turn_usage_delta"');
    expect(i).toBeGreaterThan(-1);
    const frame = SRC.slice(i - 120, i + 200);
    expect(
      frame.includes("session_total"),
      "\nturn_usage_delta 带上了 session_total。\n" +
        "backend 的计费水位去重锚点正是终帧上的 session_total(bridge.go accrueTurnUsage);\n" +
        "delta 帧一旦也带它,这一轮的消耗会被记两遍 —— 用户被扣双份额度。\n" +
        "delta 帧只喂闸门,不进计费链路,必须保持「只有单次 usage」。\n",
    ).toBe(false);
  });
});
