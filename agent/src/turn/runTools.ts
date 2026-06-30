// 执行本轮所有 tool_use(详细设计 §2.4)。permission 由控制面权威裁决(sink.requestPermission);
// 执行器据 featurePolicy 二次把关 + 在 sandbox profile 内执行 + emit tool_result(也回喂 messages[])。
// 失败 tool → tool_result{is_error:true},绝不丢(否则模型卡住)。

import type Anthropic from "@anthropic-ai/sdk";
import { isMcpTool, callMcpTool } from "../mcp/mcpTools.ts";
import { builtinRegistry } from "../tools/registry.ts";
import { toolPermitted } from "../policy/featurePolicy.ts";
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
): Promise<Anthropic.ToolResultBlockParam[]> {
  // MCP / parallelSafe built-in 可并发;非 parallelSafe(write/edit/bash)串行,保顺序与互斥。
  const allParallel = toolUses.every((tu) => isMcpTool(tu.name) || builtinRegistry.get(tu.name)?.parallelSafe);
  if (allParallel) {
    return Promise.all(toolUses.map((tu) => runOne(tu, input, sink)));
  }
  const out: Anthropic.ToolResultBlockParam[] = [];
  for (const tu of toolUses) out.push(await runOne(tu, input, sink));
  return out;
}

async function runOne(tu: ToolUse, input: TurnInput, sink: EventSink): Promise<Anthropic.ToolResultBlockParam> {
  // 第二道墙:执行器绝不跑控制面 denylist / 结构规则拒绝的工具
  if (!toolPermitted(tu.name, input)) {
    return errResult(tu.id, "tool not permitted: " + tu.name, sink);
  }
  // 权限裁决(控制面权威):发 permission_request,阻塞等 permission_response
  const requestId = crypto.randomUUID();
  const allowed = await sink.requestPermission({
    requestId,
    toolName: tu.name,
    toolUseId: tu.id,
    input: tu.input,
  });
  if (!allowed) return errResult(tu.id, "permission denied: " + tu.name, sink);

  try {
    let content: unknown;
    let isError = false;
    if (isMcpTool(tu.name)) {
      const r = await callMcpTool(tu.name, (tu.input ?? {}) as Record<string, unknown>);
      content = r.content;
      isError = r.isError;
    } else {
      const t = builtinRegistry.get(tu.name);
      if (!t) {
        return errResult(tu.id, "unknown tool: " + tu.name, sink);
      }
      const r = await t.run((tu.input ?? {}) as Record<string, unknown>, {
        workDir: input.workDir,
        allowBash: input.allowBash,
        net: input.net,
      });
      content = r.content;
      isError = r.isError;
    }
    sink.frame({ type: "tool_result", toolUseId: tu.id, content, isError });
    return { type: "tool_result", tool_use_id: tu.id, content: content as Anthropic.ToolResultBlockParam["content"], is_error: isError };
  } catch (e) {
    return errResult(tu.id, String((e as Error)?.message ?? e), sink);
  }
}

function errResult(toolUseId: string, msg: string, sink: EventSink): Anthropic.ToolResultBlockParam {
  const content = [{ type: "text" as const, text: msg }];
  sink.frame({ type: "tool_result", toolUseId, content, isError: true });
  return { type: "tool_result", tool_use_id: toolUseId, content, is_error: true };
}
