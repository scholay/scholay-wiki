// 执行本轮所有 tool_use(详细设计 §2.4)。permission 由控制面权威裁决(sink.requestPermission);
// 执行器据 featurePolicy 二次把关 + 在 sandbox profile 内执行 + emit tool_result(也回喂 messages[])。
// 失败 tool → tool_result{is_error:true},绝不丢(否则模型卡住)。
//
// 2026-07 审计接线(两处,均在本文件的唯一合流点):
//   · capToolResult:MCP(minicod sanitizer 之后的兜底)与 builtin 统一体积上限 —— 回喂 messages、
//     WS 帧、journal 三个下游同时受益(P0-3 spam 打崩轮)。
//   · userMessage 双轨(P1-12):失败 tool_result 帧带面向用户的脱敏摘要;给模型的全量修复指引
//     仍在 content 里原样回喂(自愈刚需)。userMessage **绝不回喂模型**(消息体不含它)。

import type Anthropic from "@anthropic-ai/sdk";
import { isMcpTool, callMcpTool } from "../mcp/mcpTools.ts";
import { builtinRegistry } from "../tools/registry.ts";
import { toolPermitted } from "../policy/featurePolicy.ts";
import { capToolResult } from "./resultCap.ts";
import { ingest as ingestEvidence, annotate as annotateEvidence } from "../evidence/ledger.ts";
import { log } from "../obs/log.ts";
import type { EventSink, TurnInput } from "./types.ts";

interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export async function runTools(
  toolUses: ToolUse[],
  input: TurnInput,
  sink: EventSink,
  signal?: AbortSignal,
): Promise<Anthropic.ToolResultBlockParam[]> {
  // 用户 stop 后,进行中的工具批直接短路成 aborted(否则串行工具会一路跑完,stop 形同虚设)。
  if (signal?.aborted) {
    return toolUses.map((tu) => errResult(tu.id, "aborted", sink, "已停止"));
  }
  // MCP / parallelSafe built-in 可并发;非 parallelSafe(write/edit/bash)串行,保顺序与互斥。
  const allParallel = toolUses.every((tu) => isMcpTool(tu.name) || builtinRegistry.get(tu.name)?.parallelSafe);
  if (allParallel) {
    return Promise.all(toolUses.map((tu) => runOne(tu, input, sink)));
  }
  const out: Anthropic.ToolResultBlockParam[] = [];
  for (const tu of toolUses) {
    // 每个串行工具前重查 abort:一旦用户中止,剩余工具不再执行,直接回填 aborted。
    if (signal?.aborted) {
      out.push(errResult(tu.id, "aborted", sink, "已停止"));
      continue;
    }
    out.push(await runOne(tu, input, sink));
  }
  return out;
}

async function runOne(tu: ToolUse, input: TurnInput, sink: EventSink): Promise<Anthropic.ToolResultBlockParam> {
  // 第二道墙:执行器绝不跑控制面 denylist / 结构规则拒绝的工具
  if (!toolPermitted(tu.name, input)) {
    return errResult(tu.id, "tool not permitted: " + tu.name, sink, "该操作暂不可用,已跳过。");
  }
  // 权限裁决(控制面权威):发 permission_request,阻塞等 permission_response
  const requestId = crypto.randomUUID();
  const decision = await sink.requestPermission({
    requestId,
    toolName: tu.name,
    toolUseId: tu.id,
    input: tu.input,
  });
  // 2026-07 审查([16]/[21]):控制面可随回执给一句可自愈的说明(如「不存在名为 X 的工具」),
  // 拒绝时优先用它 —— 既回喂模型(替掉与真越权同文的 permission denied)也作用户侧摘要;
  // 控制面没给则保持原文案。
  const allowed = typeof decision === "boolean" ? decision : decision.allowed;
  const denyMsg = typeof decision === "boolean" ? "" : (decision.userMessage ?? "").trim();
  if (!allowed) {
    return errResult(
      tu.id,
      denyMsg || "permission denied: " + tu.name,
      sink,
      denyMsg || "该操作未获授权,已跳过。",
    );
  }

  try {
    let content: unknown;
    let isError = false;
    let userMessage: string | undefined;
    if (isMcpTool(tu.name)) {
      const r = await callMcpTool(tu.name, (tu.input ?? {}) as Record<string, unknown>);
      content = r.content;
      isError = r.isError;
    } else {
      const t = builtinRegistry.get(tu.name);
      if (!t) {
        return errResult(tu.id, "unknown tool: " + tu.name, sink, "该操作暂不可用。");
      }
      const r = await t.run((tu.input ?? {}) as Record<string, unknown>, {
        workDir: input.workDir,
        allowBash: input.allowBash,
        net: input.net,
        addDirs: input.addDirs ?? [], // Skill 工具据此定位 guides/<name>/SKILL.md
        turn: turnOf(input), // read_mark 用;与 ledger.ingest 同源,避免两处各算一份而对不上
      });
      content = r.content;
      isError = r.isError;
      userMessage = (r as { userMessage?: string }).userMessage;
    }
    // ── 证据账本咽喉点(2026-08 证据账本 P0 / 终稿 §五 P0-b)────────────────────
    // 🔴 位置就是这里,**capToolResult 之前**:sanitizeMinicod 已把 20 条砍到 16,cap 还会再砍一刀。
    //    账本必须比上下文富 —— 那正是它存在的意义(上下文会被裁、会被驱逐、重灌时被整段丢弃;
    //    账本落会话 cwd,TTL 30 天,扛驱逐与容器重启)。
    // 只对检索类 MCP 工具生效(ingest 内部再判一次前缀);Read/Bash 的结果不是题录,不乱抽。
    // 并发:runTools:37 是 Promise.all 并行批 —— id 分配与 INDEX 覆盖写由 ledger 的单会话锁串行化。
    // fail-soft:账本失败只 warn,绝不影响这条 tool_result(账本是增益,不是新的失败面)。
    if (isMcpTool(tu.name) && !isError) {
      try {
        const q = await ingestEvidence(input.workDir, turnOf(input), tu.name, tu.input ?? {}, content);
        if (q.new_ids.length > 0 || q.dup_ids.length > 0) {
          // 逐条回写 evidence_id + 根上 _evidence 汇总:模型**读到结果的那一刻**就看见 id,
          // 不必等下一轮 digest —— 这是把「引真的」做便宜的第一步。
          content = await annotateEvidence(input.workDir, content, q);
        }
      } catch (e) {
        log.warn("evidence ingest failed", { tool: tu.name, err: String((e as Error)?.message ?? e) });
      }
    }
    content = capToolResult(content, tu.name); // 体积上限:回喂/帧/journal 三下游统一瘦身(工具感知:Read/ReadDocument 走自身高上限)
    if (isError && !userMessage) userMessage = genericToolUserMessage(tu.name);
    sink.frame({
      type: "tool_result",
      toolUseId: tu.id,
      content,
      isError,
      ...(isError && userMessage ? { userMessage } : {}),
    });
    return { type: "tool_result", tool_use_id: tu.id, content: content as Anthropic.ToolResultBlockParam["content"], is_error: isError };
  } catch (e) {
    // 上游异常体可能巨大且含内部细节(P1-12 泄漏放大器)—— 给模型的文本截断,给用户的走兜底摘要。
    const msg = String((e as Error)?.message ?? e).slice(0, 2000);
    return errResult(tu.id, msg, sink, genericToolUserMessage(tu.name));
  }
}

// turnOf:本轮在会话里的序号 —— 执行器无状态,只能从后端喂来的 messages 里数 user 条数。
// ⚠️ window/compact 会裁历史 → 这个值可能回退,故账本侧再做一次单调化(ledger.ingest),
//    且账本的**顺序真源是 id 的追加序**,turn 只作展示。别把它当主键用。
function turnOf(input: TurnInput): number {
  let n = 0;
  for (const m of input.messages ?? []) if (m.role === "user") n++;
  return n;
}

// 按工具名的用户侧兜底摘要(userMessage 缺省时):中文、脱敏、不含内部报错原文。
function genericToolUserMessage(name: string): string {
  if (name.startsWith("mcp__minicod__")) return "文献检索暂时失败,AI 会调整检索方式重试。";
  if (name === "Bash") return "命令执行未成功。";
  if (name === "Read" || name === "ReadDocument" || name === "Grep" || name === "Glob") return "读取内容未成功。";
  if (name === "Write" || name === "Edit") return "写入内容未成功。";
  if (name === "ExportDocument") return "文档导出未成功。";
  return "该步骤未成功,AI 会尝试其它方式。";
}

function errResult(
  toolUseId: string,
  msg: string,
  sink: EventSink,
  userMessage?: string,
): Anthropic.ToolResultBlockParam {
  const content = [{ type: "text" as const, text: msg }];
  sink.frame({
    type: "tool_result",
    toolUseId,
    content,
    isError: true,
    ...(userMessage ? { userMessage } : {}),
  });
  return { type: "tool_result", tool_use_id: toolUseId, content, is_error: true };
}
