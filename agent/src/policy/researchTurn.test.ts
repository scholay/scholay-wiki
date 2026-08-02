// 取证轮 Router 的规则契约(2026-08 证据账本 P1)。
//
// 这个 Router 是「不做兜底」与「不伤体验」之间的唯一承重件,所以钉的是**规则命中**而不是布尔:
// rule 名会随 research_state 帧进 journal,是 W4 口径陷阱(42.8% 全轮口径不可读)的切分母依据 ——
// 规则名漂了,线上所有按 phase 切出来的比率就全部对不上号。

import { describe, test, expect } from "bun:test";
import { classifyResearchTurn, hasLiteratureIntent, ORCHESTRATION_TOOLS } from "./researchTurn.ts";

const MCP = ["mcp__minicod__search_papers", "mcp__minicod__get_paper"];
const SMART_SEARCH = [...MCP, "Read", "ReadDocument", "TodayDate", "EvidenceGet"]; // 零写面
const CLAW = [...MCP, "Read", "Write", "Edit", "Bash", "Glob", "Grep", "EvidenceGet"];
const PRISM = [...MCP, "Read", "Write", "Edit", "Glob", "Grep", "EvidenceGet"];

const ask = (o: Partial<Parameters<typeof classifyResearchTurn>[0]>) =>
  classifyResearchTurn({ userText: "", ledgerTotal: 0, toolNames: CLAW, interactive: true, ...o });

describe("取证轮 Router", () => {
  test("server-side 任务型(无 taskBudget)一律 chat —— 否决清单 #12「不动 peerreview 的编排」", () => {
    // peerreview 的用户消息是结构化审稿指令,文献意图词满天飞;若被判成取证轮,
    // 它那套严格 JSON 输出协议会被凭空多出来的交付工具搅乱。
    const v = ask({ interactive: false, userText: "请检索该领域文献并给出综述性意见", toolNames: MCP });
    expect(v).toEqual({ phase: "chat", rule: "task_feature" });
  });

  test("没有检索工具 → chat(无处取证,摆闸没有意义)", () => {
    expect(ask({ toolNames: ["Read", "Write"], userText: "帮我找几篇相关论文" }).rule).toBe("no_retrieval_tools");
  });

  test("账本非空 → chat:闸判据是 ledger.count>0,那种轮次上它恒开 = 一条永远绿的规则", () => {
    const v = ask({ ledgerTotal: 3, userText: "再帮我找几篇最新的文献" });
    expect(v).toEqual({ phase: "chat", rule: "ledger_grounded" });
  });

  test("纯检索面 feature(smart_search)默认全开,不看消息形态", () => {
    expect(ask({ toolNames: SMART_SEARCH, userText: "你好" })).toEqual({
      phase: "evidence",
      rule: "retrieval_only_feature",
    });
  });

  test("claw / prism 走消息形态:文献寻求 → evidence", () => {
    for (const tools of [CLAW, PRISM]) {
      expect(ask({ toolNames: tools, userText: "帮我找几篇关于水稻耐盐性的论文" }).phase).toBe("evidence");
      expect(ask({ toolNames: tools, userText: "CRISPR 脱靶效应的研究进展如何" }).rule).toBe("literature_intent");
    }
  });

  test("claw 的正当闲聊 / 写作 / 统计轮仍是 chat —— 否决清单 #11(无条件强制会伤体验)", () => {
    for (const t of [
      "你好",
      "把这段话润色一下,别改意思",
      "用 python 帮我算一下这两组数据的均值",
      "刚才那个表格再加一列",
      "这篇论文讲了什么", // 读稿轮:有文献名词但没有寻求动作
    ]) {
      expect(ask({ userText: t }).phase).toBe("chat");
    }
  });

  test("线上实录的失效样本必须落在 evidence 侧(这几条就是本次改造的靶子)", () => {
    for (const t of [
      "还有哪些论文呢", // 终稿:追问轮 → 零工具 → 凭记忆编
      "你应该使用查询论文的工具来找", // 用户 467:直接下令仍零工具(散文通道饱和的证明)
      "帮我写一个关于深度学习的综述", // 最吃证据的一类请求,却不含任何检索动词
      "你帮我引用的文献都是我的文献库里面的吗,还是你自己检索的", // 用户高频验伪话术
      "近五年关于肠道菌群与抑郁的研究有哪些重要发现",
    ]) {
      expect(ask({ userText: t }).phase).toBe("evidence");
    }
  });

  test("误判方向刻意不对称:宁可把 chat 判成 evidence(多一次检索),不把 evidence 判成 chat", () => {
    // 边界词单独出现就够进 evidence —— 代价是模型多跑一次检索或一次 DeclareInsufficient。
    expect(ask({ userText: "这个方向有哪些代表性研究?" }).phase).toBe("evidence");
    expect(ask({ userText: "有没有证据支持这个说法" }).phase).toBe("evidence");
  });

  test("英文同样命中", () => {
    expect(hasLiteratureIntent("find recent papers on protein folding")).toBe(true);
    expect(hasLiteratureIntent("write me a systematic review outline")).toBe(true);
    expect(hasLiteratureIntent("rename this variable please")).toBe(false);
  });

  test("超长粘贴稿只看前 4000 字符(热路径,且正文不该左右轮次形态)", () => {
    const longPaste = "x".repeat(5000) + " 帮我检索一下相关文献";
    expect(hasLiteratureIntent(longPaste)).toBe(false);
  });

  test("两个交付工具名是单一真源(turnLoop 与 registry 共用同一常量)", () => {
    expect([...ORCHESTRATION_TOOLS].sort()).toEqual(["DeclareInsufficient", "SubmitAnswer"]);
  });
});
