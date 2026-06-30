// turn 执行的输入/输出契约(详细设计 §2.3 / §5.3)。
//
// 无状态:messages[] 由后端喂(history + 本轮 user);执行器不自管 transcript。
// disallowedTools 镜像 agent.CreateSessionOptions.DisallowedTools(控制面的**denylist**);
// 执行器只会据此更严(去工具)、绝不拓宽。结构性规则(Bash 需 allowBash、路径限 cwd)叠加其上。

import type Anthropic from "@anthropic-ai/sdk";
import type { Tier } from "../config/models.ts";

export type SandboxNet = "open" | "none";

export interface TurnInput {
  sessionId: string;
  clientTurnId?: string;
  messages: Anthropic.MessageParam[]; // 后端喂的 history + 本轮 user
  tier: Tier;
  modelOverride?: string; // 具体 model id(peerreview set_runtime_config{modelId} 切模型);优先于 tier
  disallowedTools: string[]; // 控制面 denylist(天花板);执行器只会更严
  appendSystemPrompt?: string; // 规则 + per-user memory,控制面给
  addDirs?: string[]; // --add-dir skill/CLAUDE.md 目录(H6;claw/prism/peerreview 的 per-feature skill)
  workDir: string;
  allowBash: boolean;
  net: SandboxNet;
}

// EventSink:执行器发出的中性 wire frame(由 Go hub 转发/journal)。
export interface EventSink {
  frame(f: Record<string, unknown>): void;
  error(message: string, code?: string): void;
  // 请求权限裁决(对应 permission_request → permission_response)。
  // 控制面是权威(Go decidePermission);执行器只是据回执阻塞/放行该 tool。
  requestPermission(req: {
    requestId: string;
    toolName: string;
    toolUseId: string;
    input: unknown;
  }): Promise<boolean>;
}

export type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };
};
