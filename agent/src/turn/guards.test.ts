import { test, expect, describe } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { ProtocolLeakGuard, stripProtocolMarkers } from "./leakGuard.ts";
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
