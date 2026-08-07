// 帧顺序与留痕不变式 —— 2026-08「P0 指标可采集性」核验查出的两个必补项(B / C)。
//
// 🔴 这两条不变式的共同性质:**破坏它们不会有任何红灯**。
//    前端照常渲染、用户照常拿到答案、测试照常全绿 —— 只有 journal 里悄悄少一块数据,
//    而那块数据要等到几周后有人跑指标 SQL 才会发现,那时那段生产数据已经永久缺失。
//    正因为没有自然的失败信号,才必须用测试把它钉住。
//
// ── 必补 B:research_state 必须先于 error 帧发出 ────────────────────────────────
//    backend 一收到 error 就 endTurn() → currentTurnID = 0(hub.go:1222),
//    而 journal 的 tee 有 `if tid != 0` 守卫(hub.go:1616)⇒ error **之后**到达的
//    research_state 被静默丢弃。受害的正是 round_cap / 预算耗尽 / 上游失败这几类轮,
//    它们的 gate_blocked、queries 一个字都进不了库 —— 而「模型试图不取证就交付」的
//    直接计数恰恰最该在这些轮里量化。
//    实现手法是「sendError 只登记、finally 单点收口」,顺序由**结构**保证而不是靠调用点纪律。
//
// ── 必补 C:预检索命中必须发 evidence_appended ─────────────────────────────────
//    预检索刻意**不走 runTools**(走它要手搓 tool_use 进 history = 伪造模型的动作),
//    因此一帧 tool_result 都不产生。而 journal 侧算「DOI 接地率」正是拿正文里的 DOI
//    去比对本纪元 EvToolResult 的内容 ⇒ 不发这一帧,预检索送达的**真论文**会被算成
//    模型编造的,**方向单一地把北极星指标压低**。
//
// 【为什么是源码级断言而不是行为测试】
//    turnLoop 没有端到端 harness(驱动它要连 LLM 流、工具注册表、MCP 三套 mock),
//    而这两条不变式的本质就是**发帧点在源码里的先后与存在性**。源码级断言在这里不是妥协:
//    它精确对应要防的那个改动(有人"顺手"把 sendError 改回当场发帧)。
//    判据刻意保持粗粒度(不解析 AST):细粒度解析器会随代码结构演进而坏掉,
//    坏掉的守卫最后都会被注释掉 —— 那比没有守卫更糟。

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "turnLoop.ts"), "utf8");

describe("journal 留痕不变式", () => {
  test("守卫自证:确实读到了 turnLoop 源码(截空会让下面全部假绿)", () => {
    expect(SRC.length).toBeGreaterThan(10_000);
    expect(SRC).toContain("const sendError = (");
    expect(SRC).toContain('type: "research_state"');
  });

  test("B① sendError 只登记、不当场发帧", () => {
    const start = SRC.indexOf("const sendError = (");
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf("\n  };", start);
    expect(end).toBeGreaterThan(start);
    const body = SRC.slice(start, end);

    expect(
      body.includes("sink.frame"),
      "\nsendError 又开始当场发 error 帧了。\n" +
        "后果:backend 收到 error 立刻 endTurn() → currentTurnID=0,随后到达的 research_state\n" +
        "被 tee 的 `if tid != 0` 静默丢弃 ⇒ round_cap / 预算耗尽轮的 gate_blocked、queries 永久不入库。\n" +
        "正确做法:只置 terminalSent + 登记 pendingError,由 finally 单点收口按序发出。\n",
    ).toBe(false);
    expect(body).toContain("pendingError");
  });

  test("B② error 帧的发送点排在 research_state 之后", () => {
    const rs = SRC.indexOf('type: "research_state"');
    const err = SRC.indexOf('sink.frame({ type: "error"');
    expect(rs).toBeGreaterThan(-1);
    expect(
      err,
      "\n找不到 error 帧的发送点(sink.frame({ type: \"error\")。\n" +
        "若是改了写法,请同步更新本断言 —— 但**先确认顺序仍然是 research_state 在前**。\n",
    ).toBeGreaterThan(-1);
    expect(
      err > rs,
      "\nerror 帧现在排在 research_state **之前**发了 —— 这正是必补 B 要根治的顺序。\n" +
        "backend 收到 error 就把 currentTurnID 清零,之后的 research_state 进不了 journal。\n" +
        "前端仍然收得到(广播在 tee 之前),所以这个回归**肉眼完全看不出来**。\n",
    ).toBe(true);
  });

  test("C 预检索命中必须发 evidence_appended,且带得出标识符", () => {
    const hit = SRC.indexOf('prefetch.status === "hit"');
    expect(
      hit,
      "\n预检索命中分支不见了 —— 若是重构,请确认它仍然会发 evidence_appended 帧。\n",
    ).toBeGreaterThan(-1);
    const seg = SRC.slice(hit, hit + 800);

    expect(
      seg.includes('type: "evidence_appended"'),
      "\n预检索命中后不再发 evidence_appended 帧。\n" +
        "后果:预检索**刻意不走 runTools**,所以它不产生任何 tool_result;\n" +
        "而 journal 侧判「这个 DOI 是不是真检索来的」用的就是 EvToolResult ⇒\n" +
        "引擎替模型检索到的**真论文**会被判成编造,单向压低北极星 V2。\n",
    ).toBe(true);
    // 只有计数不够:算接地率要的是**标识符**能不能对上。
    expect(seg).toContain("dois");
    expect(seg).toContain("paper_ids");
  });
});

// ── 2026-08-07 追加:round_discarded 必须能自证「为什么被作废」 ──────────────────────
//
// 线上 39 条 round_discarded 的 payload 是 `{"type":"round_discarded"}` —— 只有 type,零原因。
// 归因只能靠「同轮碰巧还有一个 error 帧」去 join;而作废后**重打成功**的那 8 轮连 error 帧都没有,
// 于是「这一轮为什么闪了一下重来」在库里永久无解。这跟必补 B/C 是同一类问题:
// 破坏它不会有红灯(前端照常渲染、用户照常拿到答案),只有跑指标 SQL 的人几周后发现数据答不上话。
//
// 两个发射点原因完全不同(传输层瞬态 vs 内容层协议泄漏),必须各自可辨。
describe("round_discarded 归因不变式", () => {
  test("两个发射点都带 reason,且取值互不相同", () => {
    // 判据刻意保持粗粒度(不解析 AST):细粒度解析器会随代码结构演进而坏掉,坏掉的守卫最后
    // 都会被注释掉 —— 那比没有守卫更糟(与本文件顶部同一条纪律)。
    const emits = [...SRC.matchAll(/type:\s*"round_discarded"/g)].length;
    expect(emits, "\nround_discarded 发射点数量变了,请同步本断言并确认每个发射点都带 reason。\n").toBe(2);

    expect(
      SRC.includes('reason: "protocol_leak"'),
      "\nDSML 熔断路的 round_discarded 丢了 reason。\n" +
        "后果:journal 里这一轮与「瞬态流错误重放」长得一模一样,协议泄漏的真实发生率不可测。\n",
    ).toBe(true);
    expect(
      SRC.includes('reason: "transient_stream_error"'),
      "\n瞬态重放路的 round_discarded 丢了 reason。\n",
    ).toBe(true);
  });

  test("协议泄漏路必须带变体族与码位(新变体出现时唯一的读数)", () => {
    const i = SRC.indexOf('reason: "protocol_leak"');
    expect(i).toBeGreaterThan(-1);
    const seg = SRC.slice(i, i + 400);
    expect(
      seg.includes("markerFamily") && seg.includes("markerHex"),
      "\n协议泄漏的 round_discarded 不再带 markerFamily / markerHex。\n" +
        "判据已从字面量名单换成**形状族**,这两个字段是「哪一族在动 / 标记的真实码位是什么」的唯一读数。\n" +
        "没有它们,下一次变体漂移只能靠再做一次线上全量取证才能发现。\n",
    ).toBe(true);
  });

  test("熔断日志必须带 marker_family / marker_hex / will_retry", () => {
    const i = SRC.indexOf('log.warn("DSML protocol leak intercepted"');
    expect(i).toBeGreaterThan(-1);
    const seg = SRC.slice(i, i + 700);
    for (const k of ["marker_family", "marker_hex", "will_retry", "has_tool_use"]) {
      expect(seg.includes(k), `\n熔断日志少了 ${k} —— docker logs 上就归不了因。\n`).toBe(true);
    }
  });
});
