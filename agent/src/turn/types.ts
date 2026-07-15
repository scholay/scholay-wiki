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
  maxOutput?: number; // 模型最大完成 token(目录 max_output 随模型帧下发);>0 时与全局上限取小
  contextWindow?: number; // 模型上下文窗口(P0 反应式压缩:上游 context 溢出时按此有界重试压缩)
  vision?: boolean; // 当前模型是否支持图片输入(目录 vision 随模型帧下发);false → 请求前过滤 image 块
  providerName?: string; // F0 多 provider:额外 provider 的 executor 键;缺省 = 默认 active provider
  disallowedTools: string[]; // 控制面 denylist(天花板);执行器只会更严
  appendSystemPrompt?: string; // 规则 + per-user memory,控制面给
  addDirs?: string[]; // --add-dir skill/CLAUDE.md 目录(H6;claw/prism/peerreview 的 per-feature skill)
  workDir: string;
  allowBash: boolean;
  net: SandboxNet;
  // 有界透支预算(SS#2):softRemaining=到日上限还剩多少 token,hardRemaining=到「上限+透支带」还剩多少
  // (均为 raw token 口径,4 类全 1x)。backend 每条 user_message 现算并盖章;模型据 soft 自我配速,
  // 越过 hard 时执行器去工具 + 注入收尾指令让 agent 自己优雅收尾。仅 smart_search/claw/prism 有;
  // peerreview(任务型,必须跑完)不盖 → undefined → 无披露无收尾。
  taskBudget?: { softRemaining: number; hardRemaining: number };
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
