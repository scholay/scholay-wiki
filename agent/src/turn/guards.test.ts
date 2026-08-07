import { test, expect, describe } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { ProtocolLeakGuard, stripProtocolMarkers, findProtocolMarker, describeLeak } from "./leakGuard.ts";
import { detectPhantomToolNarration, stripRecordEcho, TOOL_RECORD_PREFIX } from "./toolRecord.ts";
import { capToolResult } from "./resultCap.ts";
import {
  extractDois,
  buildEvidenceCorpus,
  auditCitations,
  claimsDelivery,
  sessionHasOutWrite,
  auditFullRead,
  auditClaims,
} from "./verifyClaims.ts";
import { detectLang, langDirective, cjkRatio, explicitLangRequest, hasBoxArt } from "./lang.ts";

// ---------- leakGuard ----------
describe("ProtocolLeakGuard(DSML 泄漏熔断)", () => {
  test("完整 marker 一帧命中:放行前缀、吞掉其后", () => {
    const g = new ProtocolLeakGuard();
    const out = g.feed("正常正文<｜｜DSML｜｜tool_calls>{...协议载荷...}");
    expect(out).toBe("正常正文");
    expect(g.tripped).toBe(true);
    expect(g.feed("后续也全吞")).toBe("");
    expect(g.flush()).toBe("");
  });

  test("marker 被切成 3 帧仍命中(holdback 跨帧)", () => {
    const g = new ProtocolLeakGuard();
    const a = g.feed("结论:<｜｜DS");
    const b = g.feed("ML｜｜tool");
    const c = g.feed("_calls>xxx");
    expect(a + b + c).toBe("结论:");
    expect(g.tripped).toBe(true);
  });

  test("半角变体命中", () => {
    const g = new ProtocolLeakGuard();
    g.feed("x<|DSML|tool_calls>y");
    expect(g.tripped).toBe(true);
  });

  test("正文含孤立 < 的 holdback 在 flush 时放出,不误吞", () => {
    const g = new ProtocolLeakGuard();
    const a = g.feed("a < b 且 x<");
    const b = g.flush();
    expect(a + b).toBe("a < b 且 x<");
    expect(g.tripped).toBe(false);
  });

  test("stripProtocolMarkers 一刀切", () => {
    expect(stripProtocolMarkers("干净部分<｜tool▁calls▁begin｜垃圾")).toBe("干净部分");
    expect(stripProtocolMarkers("无标记原样")).toBe("无标记原样");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
// 生产原文回归(2026-08-07 线上只读取证,docs/research/toolcall-protocol-2026-08/)
//
// 下面每条 fixture 都是 `agent_turn_events.payload.$.text` 的**原样字节**,不是手编的样例。
// 竖线一律写成 ｜ 转义:线上是全角 U+FF5C,而它在编辑器/终端/截图里与 ASCII `|` 肉眼无差 ——
// 上一轮排查正因为信了字形,得出过「名单漏了 ASCII 双竖线」这个错误结论(实测 ASCII 形态 0 次)。
// 写转义是为了让「这里到底是哪个码位」在代码评审时不可能看错。
const F = "｜"; // U+FF5C FULLWIDTH VERTICAL LINE

// 2026-08-07 09:15 · claw · deepseek-v4-pro · turn 2408 ev_seq 44/45(问题截图那一轮)。
// 泄漏被**跨帧切开**:前一帧以 `"</` 收尾,标记体在下一帧 —— 旧实现两帧各自独立扫描、都不命中。
const T2408_A = ` PAF 和 Markov 模型纳入公共卫生决策。"</`;
const T2408_B = `${F}${F}DSML${F}${F}parameter>\n</${F}${F}DSML${F}${F}invoke>\n</${F}${F}DSML${F}${F}tool_calls>`;
// 2026-08-04 16:28 · claw · deepseek-v4-pro · event id=451548(纯闭标签,竖线只在最后一行)
const E451548 = `</parameter>\n</invoke>\n</${F}${F}DSML${F}${F}tool_calls`;
// 2026-08-05 14:56 · claw · deepseek-v4-pro · event id=475341(前面还挂着 Bash heredoc 的尾巴)
const E475341 = `")\nPYEOF\n</parameter>\n</invoke>\n</${F}${F}DSML${F}${F}tool_calls>`;
// 2026-08-06 03:55 · prism · deepseek-v4-pro · event id=491158
const E491158 = `parameter>\n</${F}${F}DSML${F}${F}invoke>\n</${F}${F}DSML${F}${F}tool_calls>`;
// 2026-07-22 20:52 · prism · deepseek-v4-pro · turn 652(护栏上线前的 A 期形态:开标签齐全)
const T652 = `继续获取剩余引用文献。\n\n<${F}${F}DSML${F}${F}tool_calls>\n<${F}${F}DSML${F}${F}invoke name="mcp__minicod__search_papers">\n<${F}${F}DSML${F}${F}parameter name="source" string="true">pubmed</${F}${F}DSML${F}${F}parameter>`;
// 2026-07-25 · prism · deepseek-v4-pro · turn 881 ev 395(开标签在句中)
const T881 = `并理顺逻辑。\n\n<${F}${F}DSML${F}${F}tool_calls>\n<${F}${F}DSML${F}${F}invoke name="`;

describe("ProtocolLeakGuard · 生产原文回归(这次真的能拦住的唯一证据)", () => {
  test("turn 2408 跨帧闭标签:干净前缀照发、标记体一个字节都不下发", () => {
    const g = new ProtocolLeakGuard();
    const a = g.feed(T2408_A);
    const b = g.feed(T2408_B);
    const passed = a + b + g.flush();

    // ① 前一帧的正文照常送达(护栏不能因为收紧就吞掉正常内容)
    expect(a).toBe(` PAF 和 Markov 模型纳入公共卫生决策。"`);
    // ② 标记体全部被吞:用户可见流里不允许出现任何一片
    expect(b).toBe("");
    expect(passed).not.toContain("DSML");
    expect(passed).not.toContain("</");
    expect(passed).not.toContain("tool_calls");
    // ③ 熔断置位 → turnLoop 才会做轮级裁决(作废重打 / 如实报错),否则这一轮会被判成 complete
    expect(g.tripped).toBe(true);
    // ④ 熔断后余下全吞
    expect(g.feed("后面还有更多协议载荷")).toBe("");
  });

  test("三条纯闭标签生产原文:全部熔断,且只放行标记之前的真实正文", () => {
    const cases: Array<[string, string, string]> = [
      // [原文, 应放行, 说明]
      [E451548, "", "整帧就是标记,一个字都不该放行"],
      [E475341, `")\nPYEOF\n`, "Bash heredoc 的尾巴是真正文,要留;`</parameter>` 起熔断"],
      [E491158, "parameter>\n", "上一帧已在 `</｜｜DSML｜｜` 处熔断,本帧单独喂只为覆盖入口"],
    ];
    for (const [raw, expected, why] of cases) {
      const g = new ProtocolLeakGuard();
      const out = g.feed(raw) + g.flush();
      expect(out, why).toBe(expected);
      expect(out).not.toContain("DSML");
      expect(g.tripped).toBe(true);
    }
  });

  test("A 期开标签原文(护栏上线前的形态)仍然熔断 —— 收紧不能把老形态放跑", () => {
    for (const raw of [T652, T881]) {
      const g = new ProtocolLeakGuard();
      const out = g.feed(raw) + g.flush();
      expect(g.tripped).toBe(true);
      expect(out).not.toContain("DSML");
      expect(out).not.toContain("invoke");
    }
    // 正文前缀不被误吞
    expect(new ProtocolLeakGuard().feed(T881)).toBe("并理顺逻辑。\n\n");
  });

  test("逐字节切帧喂入 turn 2408 原文:任意切点都拦得住(分帧不是护栏的漏洞)", () => {
    const whole = T2408_A + T2408_B;
    for (let cut = 1; cut < whole.length; cut++) {
      const g = new ProtocolLeakGuard();
      const out = g.feed(whole.slice(0, cut)) + g.feed(whole.slice(cut)) + g.flush();
      expect(out, `切点 ${cut} 漏了标记`).not.toContain("DSML");
      expect(g.tripped, `切点 ${cut} 未熔断`).toBe(true);
    }
  });

  test("变体族按形状覆盖:开/闭 × 全角单双竖线 × ASCII 竖线 × 竖线整体退化 × 旧特殊 token", () => {
    const variants = [
      `<${F}DSML${F}tool_calls>`, // 官方模型卡规范形(全角单竖线)
      `<${F}${F}DSML${F}${F}tool_calls>`, // 线上实际形(全角双竖线)
      `</${F}${F}DSML${F}${F}invoke>`, // 闭标签(2026-08 唯一还在漏的形态)
      "<|DSML|tool_calls>", // ASCII 单竖线
      "<||DSML||tool_calls>", // ASCII 双竖线(HF discussions/209 记录的退化形)
      "</||DSML||parameter>", // ASCII 双竖线 + 闭标签
      "<DSML tool_calls>", // 竖线整体丢失
      `<${F}tool▁calls▁begin${F}>`, // DeepSeek V3/R1 旧特殊 token
      "<|tool_calls_begin|>",
      "</invoke>", // 竖线全丢后只剩 XML 语法层
      "</function_calls>",
      '<invoke name="Edit">',
      "<tool_call>", // GLM 原生标记
      "<|endoftext|>", // 任意 <｜…｜> 哨兵
    ];
    for (const v of variants) {
      const g = new ProtocolLeakGuard();
      const out = g.feed("正文前缀。" + v + "载荷");
      expect(g.tripped, `变体未被拦下: ${v}`).toBe(true);
      expect(out, `变体 ${v} 放行了标记`).toBe("正文前缀。");
    }
  });

  test("误伤面:正常正文/代码里的类似写法不熔断", () => {
    const benign = [
      "当 a < b 且 b < c 时,有 a < c。",
      "F# 的管道运算符写作 x <| f,组合子写作 <|>。",
      "Dirac 记号 <a|b> 表示内积。",
      "HTML 片段:<div class=\"x\">内容</div>",
      "泛型 Map<String, List<Integer>> 的用法",
      // 刻意不收裸开标签 `<parameter name=`:log4j/Axis 配置真的长这样
      '<parameter name="threshold" value="INFO"/>',
      "比较 1<2 与 3>2",
    ];
    for (const s of benign) {
      const g = new ProtocolLeakGuard();
      const out = g.feed(s) + g.flush();
      expect(g.tripped, `误伤: ${s}`).toBe(false);
      expect(out, `内容被改动: ${s}`).toBe(s);
    }
  });

  test("describeLeak:归因字段能指出是哪一族、以及标记的真实码位(不看字形看字节)", () => {
    const t = new ProtocolLeakGuard();
    const k = new ProtocolLeakGuard();
    expect(describeLeak(t, k)).toBeNull(); // 未熔断 → 无诊断

    t.feed(T2408_A);
    t.feed(T2408_B);
    const d = describeLeak(t, k)!;
    expect(d.channel).toBe("text");
    expect(d.family).toBe("barred_token");
    expect(d.passedChars).toBe(T2408_A.length - 2); // `</` 被扣住未下发
    // 3c=`<` 2f=`/` ff5c=全角竖线 ×2 —— 钉死「线上是 U+FF5C 不是 ASCII 7c」
    expect(d.markerHex.startsWith("3c 2f ff5c ff5c 44 53 4d 4c")).toBe(true);
    expect(d.marker).toContain("DSML");

    // thinking 通路单独熔断时也要归得了因
    const k2 = new ProtocolLeakGuard();
    k2.feed(`推理中<${F}${F}DSML${F}${F}tool_calls>`);
    expect(describeLeak(new ProtocolLeakGuard(), k2)!.channel).toBe("thinking");
  });

  test("findProtocolMarker 取最靠前的一处(多族同时命中时不错位)", () => {
    const hit = findProtocolMarker(`前缀</invoke>\n<${F}${F}DSML${F}${F}tool_calls>`)!;
    expect(hit.index).toBe(2);
    expect(hit.family).toBe("toolcall_xml");
    expect(findProtocolMarker("完全干净的一段正文")).toBeNull();
  });

  test("stripProtocolMarkers 对闭标签同样一刀切(history 消毒与流式判据必须同源)", () => {
    expect(stripProtocolMarkers(`正文${T2408_B}`)).toBe("正文");
    expect(stripProtocolMarkers(E475341)).toBe(`")\nPYEOF\n`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
describe("detectPhantomToolNarration(模型照抄冷重播折叠模板 = 幻影交付)", () => {
  // 2026-08-07 09:15 turn 2408 / 10:17 turn 2417 / 09:19 turn 2409 的正文原文(旧模板)。
  const T2408_TEXT = `【已调用 Read file_path="scheme_v2.md"】返回 2926 字符`;
  const T2417_TEXT = [
    "抱歉,马上处理——先删除摘要列,再导出 Word。",
    "",
    `【已调用 Read file_path="scheme_v2.md" limit="50"】`,
    `【已调用 Bash command="grep -n '方案修改与优化摘要' scheme_v2.md | head -40"】`,
    `【已调用 Read file_path="scheme_v2.md" offset="50" limit="100"】`,
  ].join("\n");
  const T2409_TEXT = "抱歉,还没导出——刚才只完成了修改,现在马上生成。\n\n【已调用 ExportDocument】";

  test("三条生产原文全部命中(这三轮线上 tool_use=0 / artifact=0 / status=complete)", () => {
    expect(detectPhantomToolNarration(T2408_TEXT).count).toBe(1);
    expect(detectPhantomToolNarration(T2417_TEXT).count).toBe(3);
    expect(detectPhantomToolNarration(T2409_TEXT).count).toBe(1);
    expect(detectPhantomToolNarration(T2408_TEXT).samples[0]).toContain("Read");
  });

  // 2026-08-08 结构性根治后:平台**不再产出**任何折行,故这条前缀在生产里没有写入方。
  // 检出仍保留 —— 模型自发写出同形句子时必须抓到(这也是「万一有人把折叠改回来」的兜底)。
  test("第三人称档案句式被模型自发写出时同样命中(换句式 ≠ 不会被模仿)", () => {
    const echoed = `我先看了一下文件:\n${TOOL_RECORD_PREFIX}Read(file_path="a.md") → 返回 2926 字符`;
    expect(detectPhantomToolNarration(echoed).count).toBe(1);
  });

  // §6.1 存量污染:journal 的 content_delta 里躺着 18 轮伪造正文,冷重播原样重灌 = 继续喂 few-shot。
  describe("stripRecordEcho(存量污染清洗:只删行,不动其余正文)", () => {
    test("turn 2417 原文:三条伪造记录行全删,真实第一句完整保留", () => {
      const cleaned = stripRecordEcho(T2417_TEXT);
      expect(detectPhantomToolNarration(cleaned).count).toBe(0);
      expect(cleaned).toBe("抱歉,马上处理——先删除摘要列,再导出 Word。");
    });

    test("整段都是记录行(turn 2408)→ 清空", () => {
      expect(stripRecordEcho(T2408_TEXT)).toBe("");
    });

    test("干净正文原样返回(零改写、零误伤)", () => {
      const s = "我已经读取了 scheme_v2.md 并完成修改,导出的 Word 在下方。";
      expect(stripRecordEcho(s)).toBe(s);
    });

    // 🔴 删而不是替换:替换成「[平台已移除一条工具记录]」本身又是 assistant 通道里的
    //    工具记录描述 = 换个模板继续教(replayHistory 铁律 ①)。
    test("清洗产物里不得残留任何「这里曾有一次工具调用」的痕迹", () => {
      const cleaned = stripRecordEcho(T2409_TEXT);
      expect(cleaned).not.toContain("已移除");
      expect(cleaned).not.toContain("ExportDocument");
      expect(cleaned).toBe("抱歉,还没导出——刚才只完成了修改,现在马上生成。");
    });
  });

  test("旧模板的检出**不能**随模板更新而下线:存量会话上下文里全是它", () => {
    expect(detectPhantomToolNarration(`【已调用 search_papers query="x"】命中 20 条`).count).toBe(1);
  });

  test("正常正文不误报(包括自然语言陈述做过的事)", () => {
    for (const s of [
      "我已经读取了 scheme_v2.md 并完成修改,导出的 Word 在下方。",
      "接下来我会调用检索工具查一下这个方向的综述。",
      "【重要】请注意这里的参数含义。",
      "",
    ]) {
      expect(detectPhantomToolNarration(s).count, s).toBe(0);
    }
  });
});

// ---------- resultCap ----------
describe("capToolResult(payload 上限)", () => {
  test("67k 字符块被截断并带标注", () => {
    const big = "字".repeat(67_000);
    const out = capToolResult([{ type: "text", text: big }]) as Array<{ type: string; text: string }>;
    expect(out[0].text.length).toBeLessThan(21_000);
    expect(out[0].text).toContain("[内容过长已截断:原始 67000 字符");
  });

  test("多块合计超总额时后续块折叠为省略标注", () => {
    const blocks = Array.from({ length: 6 }, () => ({ type: "text", text: "x".repeat(15_000) }));
    const out = capToolResult(blocks) as Array<{ type: string; text: string }>;
    const total = out.reduce((n, b) => n + b.text.length, 0);
    expect(total).toBeLessThan(70_000);
    expect(out[out.length - 1].text).toContain("已省略");
  });

  test("小结果原样返回(引用相等)", () => {
    const blocks = [{ type: "text", text: "ok" }];
    expect(capToolResult(blocks)).toEqual(blocks);
  });

  test("非文本块透传", () => {
    const blocks = [{ type: "image", source: {} }];
    expect(capToolResult(blocks)).toEqual(blocks);
  });

  test("清洗后的大 JSON(>20k)不被钝切成非法 JSON,_sanitizer 保留(审计 [3]/[5])", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ paperId: `p${i}`, title: `T${i}`, abstract: "字".repeat(400) }));
    const json = JSON.stringify({ items, _sanitizer: { coverage_note: "平台检索源(Graph / Discovery / Medicine)…" } });
    expect(json.length).toBeGreaterThan(20_000);
    expect(json.length).toBeLessThan(50_000);
    const out = capToolResult([{ type: "text", text: json }], "mcp__minicod__search_papers") as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(out[0].text); // 仍是合法 JSON(未被 20k 钝切)
    expect(parsed._sanitizer.coverage_note).toContain("Graph / Discovery / Medicine");
    expect(parsed.items.length).toBe(60);
  });

  test("Read/ReadDocument 走自身高上限,不被 20k 钝切;普通工具照旧(审计 [6])", () => {
    const doc = "内容".repeat(60_000); // ~120k 字符
    const kept = capToolResult([{ type: "text", text: doc }], "ReadDocument") as Array<{ type: string; text: string }>;
    expect(kept[0].text.length).toBeGreaterThan(100_000);
    const capped = capToolResult([{ type: "text", text: doc }], "Bash") as Array<{ type: string; text: string }>;
    expect(capped[0].text.length).toBeLessThan(21_000);
  });
});

// ---------- verifyClaims ----------
function userMsg(text: string): Anthropic.MessageParam {
  return { role: "user", content: text };
}
function toolResultMsg(text: string): Anthropic.MessageParam {
  return {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text }] }],
  } as Anthropic.MessageParam;
}
function assistantWrite(path: string, id = "w1"): Anthropic.MessageParam {
  return {
    role: "assistant",
    content: [{ type: "tool_use", id, name: "Write", input: { file_path: path } }],
  } as Anthropic.MessageParam;
}
// 写/导出的 tool_result(is_error 区分成功/失败)——sessionHasOutWrite 只认成功写入(审计 [9])。
function toolResultFor(id: string, isError: boolean): Anthropic.MessageParam {
  return {
    role: "user",
    content: [
      { type: "tool_result", tool_use_id: id, content: [{ type: "text", text: isError ? "failed" : "ok" }], is_error: isError },
    ],
  } as Anthropic.MessageParam;
}
function assistantExport(id = "e1"): Anthropic.MessageParam {
  return {
    role: "assistant",
    content: [{ type: "tool_use", id, name: "ExportDocument", input: { target_format: "pdf" } }],
  } as Anthropic.MessageParam;
}

describe("verifyClaims(诚实性核验)", () => {
  test("编造 DOI 与真实 DOI 混排:只报编造条", () => {
    const msgs = [userMsg("查文献"), toolResultMsg('{"doi":"10.1234/real-one"}')];
    const corpus = buildEvidenceCorpus(msgs);
    const bad = auditCitations("引用 [10.1234/real-one] 与 [10.9999/fake-abc]。", corpus);
    expect(bad).toEqual(["10.9999/fake-abc"]);
  });

  test("用户消息里粘贴的 DOI 不报", () => {
    const msgs = [userMsg("帮我看看 10.5555/user-pasted 这篇")];
    const bad = auditCitations("这篇 10.5555/USER-PASTED 讲的是…", buildEvidenceCorpus(msgs));
    expect(bad).toEqual([]);
  });

  test("旧轮 assistant 文本里的 DOI 不能自洗白(仍报)", () => {
    const msgs: Anthropic.MessageParam[] = [
      userMsg("q"),
      { role: "assistant", content: [{ type: "text", text: "参考 10.7777/self-made" }] } as Anthropic.MessageParam,
      userMsg("继续"),
    ];
    const bad = auditCitations("如前述 10.7777/self-made", buildEvidenceCorpus(msgs));
    expect(bad).toEqual(["10.7777/self-made"]);
  });

  test("DOI 尾部标点剥离", () => {
    expect(extractDois("(10.1000/abc.def)。")).toEqual(["10.1000/abc.def"]);
  });

  test("交付宣称 + 零产物 → mismatch;有产物 → 不报", () => {
    const text = "已为你生成完整文件《综述.md》,可在下方下载。";
    expect(claimsDelivery(text)).toBe(true);
    const f1 = auditClaims(text, [userMsg("q")], [], []);
    expect(f1.deliveryMismatch).toBe(true);
    const f2 = auditClaims(text, [userMsg("q")], [], [{ path: "out/综述.md", name: "综述.md", size: 1, mime: "text/markdown", kind: "file" } as never]);
    expect(f2.deliveryMismatch).toBe(false);
  });

  test("历史有成功 out/ 写入(引用上一轮交付)→ 不报", () => {
    const msgs = [userMsg("q"), assistantWrite("out/旧文件.md"), toolResultFor("w1", false), userMsg("在哪下载?")];
    expect(sessionHasOutWrite(msgs)).toBe(true);
    const f = auditClaims("上一轮生成的《旧文件.md》可在下方下载。", msgs, [], []);
    expect(f.deliveryMismatch).toBe(false);
  });

  test("历史 out/ 写入失败(tool_result is_error)→ 不算已交付(审计 [9])", () => {
    const msgs = [userMsg("q"), assistantWrite("out/旧文件.md"), toolResultFor("w1", true)];
    expect(sessionHasOutWrite(msgs)).toBe(false);
  });

  test("失败的 ExportDocument 不免疫后续 delivery 核验(审计 [9])", () => {
    const msgs = [userMsg("导出 PDF"), assistantExport("e1"), toolResultFor("e1", true)];
    expect(sessionHasOutWrite(msgs)).toBe(false);
    const f = auditClaims("已成功导出 PDF,可在下方下载。", msgs, [], []);
    expect(f.deliveryMismatch).toBe(true);
  });

  test("成功的 ExportDocument 记为已交付", () => {
    const msgs = [userMsg("导出 PDF"), assistantExport("e1"), toolResultFor("e1", false)];
    expect(sessionHasOutWrite(msgs)).toBe(true);
  });

  test("【系统纠偏】指令里的编造 DOI 不能自洗白(仍报;审计 [1]/[7])", () => {
    const corrective = "【系统纠偏】(此消息来自平台自动核验器)以下 DOI 疑似编造:10.9999/fake-abc";
    const msgs: Anthropic.MessageParam[] = [
      userMsg("给我 DOI"),
      { role: "user", content: [{ type: "text", text: corrective }] } as Anthropic.MessageParam,
      userMsg("继续"),
    ];
    const bad = auditCitations("如前 10.9999/fake-abc", buildEvidenceCorpus(msgs));
    expect(bad).toEqual(["10.9999/fake-abc"]);
  });

  // 2026-08 证据账本 P0:引用判据的主语料改成账本 —— 冷重播后 messages 里工具证据已被折成一行摘要,
  // 若仍只读 messages,每条**真实**引用都会被判成编造(旧版在最需要它的路径上是净负值)。
  test("冷重播:真实 DOI 只在账本里(messages 已被折叠)→ 不误报", () => {
    const cold = [
      userMsg("继续写"),
      { role: "assistant", content: [{ type: "text", text: "【已调用 search_papers query=\"ADHD\"】命中 20 条,已入证据账本 E1–E16" }] } as Anthropic.MessageParam,
    ];
    const ledger = [{ id: "E1", doi: "10.1234/real-one", title: "ADHD fMRI" }] as never;
    expect(auditCitations("引用 10.1234/real-one", buildEvidenceCorpus(cold))).toEqual(["10.1234/real-one"]); // 旧口径:误报
    expect(auditCitations("引用 10.1234/real-one", buildEvidenceCorpus(cold, ledger))).toEqual([]); // 新口径:不误报
  });

  test("账本里没有、messages 里也没有的 DOI 仍被观测到", () => {
    const ledger = [{ id: "E1", doi: "10.1234/real-one" }] as never;
    const bad = auditCitations("引用 10.9999/fake-abc", buildEvidenceCorpus([userMsg("q")], ledger));
    expect(bad).toEqual(["10.9999/fake-abc"]);
  });

  test("否定语境不算交付宣称", () => {
    expect(claimsDelivery("抱歉,未能生成文件,导出失败了。")).toBe(false);
    expect(claimsDelivery("如果需要,我可以生成文件供下载。")).toBe(false);
  });

  test("零 Read 却称已通读 → fullReadMismatch", () => {
    const msgs = [userMsg("解读这篇 PDF")];
    expect(auditFullRead("我已通读全文,以下是完整精读。", msgs, msgs)).toBe(true);
  });

  test("本轮 Read 带截断标记仍称通读 → 报;干净 Read → 不报", () => {
    const readUse: Anthropic.MessageParam = {
      role: "assistant",
      content: [{ type: "tool_use", id: "r1", name: "Read", input: { file_path: "a.txt" } }],
    } as Anthropic.MessageParam;
    const truncated = [readUse, toolResultMsg("前半部分…[内容过长已截断:原始 90000 字符,以上为前 20000 字符]")];
    expect(auditFullRead("已通读全文", truncated, truncated)).toBe(true);
    const clean = [readUse, toolResultMsg("完整内容")];
    expect(auditFullRead("已通读全文", clean, clean)).toBe(false);
  });
});

// ---------- lang ----------
describe("lang(语言检测与字符画)", () => {
  test("纯中文 → zh;纯英文 → en;老挝语 → lo", () => {
    expect(detectLang("请帮我梳理这个研究方向的相关文献")).toBe("zh");
    expect(detectLang("Please summarize the recent literature on quantum control methods.")).toBe("en");
    expect(detectLang("ກະລຸນາຊ່ວຍຂ້ອຍວິເຄາະເອກະສານນີ້ແລະສະຫຼຸບເນື້ອຫາສຳຄັນ")).toBe("lo");
  });

  test("粘 3000 词英文材料 + 中文短指令 → zh(尾部窗口+汉字绝对数)", () => {
    const material = Array.from({ length: 600 }, () => "quantum control robust learning").join(" ");
    expect(detectLang(material + "\n\n请把上面这段英文材料总结成中文要点,谢谢,要覆盖方法与结论,并给出研究缺口分析。")).toBe("zh");
  });

  test("弱信号(短语/纯代码)→ und,不注入指令", () => {
    expect(detectLang("ok")).toBe("und");
    expect(detectLang("```python\nprint(1)\n```")).toBe("und");
    expect(langDirective("und")).toBe("");
  });

  test("中文里嵌片假名外来词 → zh(不误判日文;审计 [11])", () => {
    expect(detectLang("帮我找一下关于 ディープラーニング 的最新综述")).toBe("zh");
    expect(detectLang("介绍一下 ソニー 和 トヨタ 两家公司的研发投入")).toBe("zh");
  });

  test("真日文(平假名密集)仍判 ja", () => {
    expect(detectLang("この論文の要点を日本語でまとめてください")).toBe("ja");
  });

  test("短中文追问 → zh 不落 und(审计 [12]);英文引少量 CJK 不误判 zh", () => {
    expect(detectLang("总结一下")).toBe("zh");
    expect(detectLang("换成表格")).toBe("zh");
    expect(detectLang("总结一下这篇")).toBe("zh");
    expect(detectLang("Please translate the phrase into French and explain")).toBe("en");
  });

  test("中英混排学术回复 cjkRatio 正常;整段老挝语 cjkRatio≈0", () => {
    expect(cjkRatio("本文提出了 Transformer 架构的改进方案")).toBeGreaterThan(0.3);
    expect(cjkRatio("ໃບຢັ້ງຢືນການອອກແບບການສຶກສາ overview")).toBeLessThan(0.1);
  });

  test("explicitLangRequest 豁免", () => {
    expect(explicitLangRequest("请用英文写一段 Introduction")).toBe(true);
    expect(explicitLangRequest("帮我写摘要")).toBe(false);
  });

  test("字符画命中:box-drawing 框图 / 纯符号拼图", () => {
    const box = ["┌─────────┐", "│  模块A  │", "└────┬────┘", "     │", "┌────┴────┐", "│  模块B  │", "└─────────┘"].join("\n");
    expect(hasBoxArt(box)).toBe(true);
    const ascii = ["+--------+", "| inputs |", "+---+----+", "    |", "    v", "+---+----+", "| output |", "+--------+"].join("\n");
    expect(hasBoxArt(ascii)).toBe(true);
  });

  test("合法内容不误报:GFM 表格 / mermaid / 真代码分节线 / 单行分隔", () => {
    const table = "| 列A | 列B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";
    expect(hasBoxArt(table)).toBe(false);
    const mermaid = "```mermaid\nflowchart TD\n  A-->B\n  B-->C\n```";
    expect(hasBoxArt(mermaid)).toBe(false);
    const code = "```go\n// ────────── 分节 ──────────\nfunc a() {}\n// ────────── 分节 ──────────\nfunc b() {}\n// ────────── 分节 ──────────\nfunc c() {}\n```";
    expect(hasBoxArt(code)).toBe(false);
    expect(hasBoxArt("上文\n\n---\n\n下文")).toBe(false);
  });
});
