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
  // 2026-08 Phase 1(Run 引擎):本轮的工具轮上限。**不下发时行为与今天逐字等价**
  // (turnLoop 用 `?? MAX_TOOL_ROUNDS`)。在场时轮尽发 code="step_incomplete" 分页信号
  // 而非 round_cap 终结错误 —— 那是 Run 形态的核心收益。
  maxRounds?: number;
  contextWindow?: number; // 模型上下文窗口(P0 反应式压缩:上游 context 溢出时按此有界重试压缩)
  vision?: boolean; // 当前模型是否支持图片输入(目录 vision 随模型帧下发);false → 请求前过滤 image 块
  providerName?: string; // F0 多 provider:额外 provider 的 executor 键;缺省 = 默认 active provider
  disallowedTools: string[]; // 控制面 denylist(天花板);执行器只会更严
  // MCP 正向白名单(去 mcp__minicod__ 前缀的原始工具名)。控制面按 feature 下发,收敛 minicod
  // 0.4.1 的 76 工具到该 feature 真正需要的子集(见 featurePolicy.toolPermitted)。
  // 非空 → 仅这些 MCP 工具可见/可调;空/缺省 → 不限制(向后兼容)。built-in 工具不受它影响。
  allowedMcpTools?: string[];
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
  // 诚实性核验 guard(2026-07 审计 P0-1/P0-2/P1-6)per-feature 旗标:true → turnLoop 轮末跑
  // verifyClaims 核验(引用/交付/通读宣称)。控制面按 feature 下发(claw/prism 开;
  // peerreview 是有界 JSON 任务路不开防误伤)。
  // 🔴 2026-08 证据账本 P0:**已降级为纯观测** —— findings 只落 claim_audit 帧 + slog,
  // **不再注入纠偏轮**(旧注释写的「不过则注入纠偏轮」已不成立)。降级理由见 verifyClaims.ts 头注释:
  // 609 轮只触发 8 次、判据集合与故障形态不相交、且冷重播时会把每条**真实**引用判成未验证 →
  // 逼模型「补齐或更正」而它此时无法查证 → 最省力的服从方式是删掉真引用(净负值)。
  honestyGuard?: boolean;
  // 核验维度按位开关(prism 预备件):honestyGuard=true 时生效,缺省全开。
  // 控制面下发形态 {citations?, delivery?, fullread?};详见 verifyClaims.HonestyChecks。
  honestyChecks?: { citations?: boolean; delivery?: boolean; fullread?: boolean };
}

// EventSink:执行器发出的中性 wire frame(由 Go hub 转发/journal)。
export interface EventSink {
  frame(f: Record<string, unknown>): void;
  error(message: string, code?: string): void;
  // 请求权限裁决(对应 permission_request → permission_response)。
  // 控制面是权威(Go decidePermission);执行器只是据回执阻塞/放行该 tool。
  // 2026-07 审查([16]/[21]):回执可带 userMessage(如「不存在名为 X 的工具,请改用可用工具。」),
  // 此前解析层就把它丢了 → 幻想工具名与真越权同文案,模型误判为权限问题而放弃。
  // 返回 boolean 是向后兼容形态(测试/shadow/conformance 等自动批的 sink 不必改)。
  requestPermission(req: {
    requestId: string;
    toolName: string;
    toolUseId: string;
    input: unknown;
  }): Promise<boolean | PermissionDecision>;
}

// PermissionDecision:控制面裁决结果。userMessage 为控制面给的可见文案,
// 拒绝时同时用作「回喂模型的 tool_result 正文」与「前端展示摘要」。
export interface PermissionDecision {
  allowed: boolean;
  userMessage?: string;
}

export type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };
};
