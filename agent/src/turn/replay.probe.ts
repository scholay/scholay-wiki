// 回放探针(一次性验证工具,非生产代码):把真实生产转录喂进第 1-3 批的防线纯函数,
// 量捕获率与误报率。用法:bun run src/turn/replay.probe.ts <ndjson1> [ndjson2 ...]
// 从 agent_turn_events 的 NDJSON dump 重建每轮的 (finalText, messages, toolResults, artifacts-approx),
// 逐轮跑 auditClaims / detectLang+cjkRatio / hasBoxArt / ProtocolLeakGuard / sanitizeMinicodResult。

import type Anthropic from "@anthropic-ai/sdk";
import { auditClaims, hasFindings } from "./verifyClaims.ts";
import { detectLang, cjkRatio, explicitLangRequest, hasBoxArt, stripNoise } from "./lang.ts";
import { ProtocolLeakGuard } from "./leakGuard.ts";
import { sanitizeMinicodResult } from "../mcp/sanitizeMinicod.ts";
import type { ArtifactDecl } from "./artifacts.ts";

const BATCH_MAP: Record<string, string> = { "\\": "\\", n: "\n", t: "\t", "0": "\0", N: "" };
function batchDecode(s: string): string {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length && BATCH_MAP[s[i + 1]] !== undefined) {
      out.push(BATCH_MAP[s[i + 1]]);
      i++;
      continue;
    }
    out.push(s[i]);
  }
  return out.join("");
}

interface TurnRec {
  turnId: number;
  session: string;
  userText: string;
  finalText: string;
  toolResults: { name?: string; content: unknown; isError: boolean }[];
  toolUses: { name: string; input: Record<string, unknown> }[];
  artifacts: ArtifactDecl[];
  boxArtChars: number; // 原始正文里 box-drawing 字符数(审计口径,用于判定"这轮确有字符画")
}

function loadTurns(files: string[]): TurnRec[] {
  const turns = new Map<number, TurnRec>();
  const order: number[] = [];
  const pendName = new Map<string, string>();
  for (const f of files) {
    const text = require("fs").readFileSync(f, "utf8") as string;
    for (const raw of text.split("\n")) {
      const line = raw.replace(/\n$/, "");
      if (!line) continue;
      let o: any;
      try {
        o = JSON.parse(batchDecode(line));
      } catch {
        continue;
      }
      if (o.kind === "turn") {
        if (!turns.has(o.turn_id)) {
          turns.set(o.turn_id, {
            turnId: o.turn_id,
            session: o.session,
            userText: o.user_text || "",
            finalText: "",
            toolResults: [],
            toolUses: [],
            artifacts: [],
            boxArtChars: 0,
          });
          order.push(o.turn_id);
        }
        continue;
      }
      const t = turns.get(o.turn_id);
      if (!t) continue;
      let p = o.payload;
      if (typeof p === "string") {
        try {
          p = JSON.parse(p);
        } catch {
          continue;
        }
      }
      switch (o.ev_type) {
        case "content_delta":
          if (typeof p.text === "string") t.finalText += p.text;
          break;
        case "tool_use":
          t.toolUses.push({ name: p.toolName, input: (p.input as Record<string, unknown>) || {} });
          if (p.toolUseId) pendName.set(p.toolUseId, p.toolName);
          break;
        case "tool_result":
          t.toolResults.push({ name: pendName.get(p.toolUseId), content: p.content, isError: !!p.isError });
          break;
        case "artifact":
          t.artifacts.push({
            path: p.path || p.name,
            name: p.name,
            size: p.size || 0,
            mime: p.mime || "",
            kind: p.kind || "file",
          } as ArtifactDecl);
          break;
      }
    }
  }
  // box-drawing 计数
  const BOX = /[─-▟]/g;
  for (const t of turns.values()) t.boxArtChars = (t.finalText.match(BOX) || []).length;
  return order.map((id) => turns.get(id)!);
}

// 把一轮重建成 verifyClaims 需要的 messages[](全会话简化:用户文本 + tool_result + 本轮 assistant)。
// 为求"证据语料"完整,把同会话早于本轮的所有 tool_result 也纳入(近似 allMsgs)。
function buildMessages(session: TurnRec[], upto: number): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];
  for (const t of session) {
    if (t.turnId > upto) break;
    msgs.push({ role: "user", content: t.userText || "(empty)" });
    if (t.toolResults.length) {
      msgs.push({
        role: "user",
        content: t.toolResults.map((r, i) => ({
          type: "tool_result" as const,
          tool_use_id: `t${t.turnId}_${i}`,
          content: r.content as Anthropic.ToolResultBlockParam["content"],
          is_error: r.isError,
        })),
      });
    }
    // assistant tool_use(供 sessionHasOutWrite 判定)
    if (t.toolUses.length) {
      msgs.push({
        role: "assistant",
        content: t.toolUses.map((u) => ({ type: "tool_use" as const, id: "u", name: u.name, input: u.input })),
      });
    }
    if (t.finalText) msgs.push({ role: "assistant", content: [{ type: "text", text: t.finalText }] });
  }
  return msgs;
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: bun run replay.probe.ts <ndjson...>");
    process.exit(1);
  }
  const all = loadTurns(files);
  const bySession = new Map<string, TurnRec[]>();
  for (const t of all) {
    if (!bySession.has(t.session)) bySession.set(t.session, []);
    bySession.get(t.session)!.push(t);
  }

  const hits = {
    honesty: [] as string[],
    dsml: [] as string[],
    lang: [] as string[],
    box: [] as string[],
    boxMissed: [] as string[],
    sanitizeSpam: [] as string[],
    sanitizeTrunc: [] as string[],
  };
  let turnsWithText = 0;

  for (const [sid, session] of bySession) {
    for (const t of session) {
      const tag = `${sid.slice(0, 8)}#${t.turnId}`;
      if (t.finalText.trim()) turnsWithText++;

      // 诚实性
      const msgs = buildMessages(session, t.turnId);
      const turnMsgs = msgs.slice(Math.max(0, msgs.length - 3)); // 近似本轮
      const f = auditClaims(t.finalText, msgs, turnMsgs, t.artifacts);
      if (hasFindings(f)) {
        hits.honesty.push(
          `${tag} dois=${f.unverifiedDois.length}${f.deliveryMismatch ? " delivery" : ""}${f.fullReadMismatch ? " fullread" : ""}` +
            (f.unverifiedDois.length ? ` [${f.unverifiedDois.slice(0, 3).join(",")}]` : ""),
        );
      }

      // 语言(期望 zh:用户消息判 zh 且正文 >300 且 cjk<0.1)
      const exp = detectLang(t.userText);
      if (exp === "zh" && !explicitLangRequest(t.userText)) {
        const vis = stripNoise(t.finalText);
        if (vis.length > 300 && cjkRatio(vis) < 0.1) hits.lang.push(`${tag} cjk=${cjkRatio(vis).toFixed(2)}`);
      }

      // 字符画:防线检出 vs 审计口径(boxArtChars>10)
      const detected = hasBoxArt(t.finalText);
      if (detected) hits.box.push(tag);
      if (t.boxArtChars > 10 && !detected) hits.boxMissed.push(`${tag} boxChars=${t.boxArtChars}`);

      // DSML:防线是流式的,这里用整段 feed 一次模拟(真实是分帧,holdback 已单测)
      const g = new ProtocolLeakGuard();
      const passed = g.feed(t.finalText) + g.flush();
      if (g.tripped) hits.dsml.push(`${tag} passed=${g.passedChars}/${t.finalText.length}`);

      // sanitizeMinicod:对每个 minicod tool_result 跑,看 spam/截断触发
      for (const r of t.toolResults) {
        if (!r.name?.startsWith("mcp__minicod__") || r.isError) continue;
        const query = String(t.toolUses.find((u) => u.name === r.name)?.input?.query ?? "");
        const before = JSON.stringify(r.content).length;
        const out = sanitizeMinicodResult(r.name, { query }, r.content);
        const after = JSON.stringify(out).length;
        const outStr = JSON.stringify(out);
        if (outStr.includes("spam_dropped")) hits.sanitizeSpam.push(`${tag} ${before}->${after}`);
        else if (outStr.includes("truncated") && before > after + 100) hits.sanitizeTrunc.push(`${tag} ${before}->${after}`);
      }
    }
  }

  const N = all.length;
  console.log(`\n===== 回放:${N} 轮(${bySession.size} 会话),${turnsWithText} 轮有可见正文 =====\n`);
  const show = (label: string, arr: string[]) => {
    console.log(`【${label}】命中 ${arr.length} 轮`);
    for (const x of arr.slice(0, 40)) console.log("   " + x);
    if (arr.length > 40) console.log(`   … +${arr.length - 40} more`);
    console.log();
  };
  show("诚实性核验(编造DOI/幻影交付/假通读)", hits.honesty);
  show("字符画检出", hits.box);
  show("字符画漏检(审计口径 boxChars>10 但防线未检出)", hits.boxMissed);
  show("语言纠偏(中文用户/正文CJK<0.1)", hits.lang);
  show("DSML 泄漏熔断", hits.dsml);
  show("minicod spam 剔除", hits.sanitizeSpam);
  show("minicod 截断", hits.sanitizeTrunc);
}

main();
