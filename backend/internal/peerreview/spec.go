// ============================================================================
// 智能审稿 v3 — agentbridge.FeatureSpec
//
// 当前 feature 主要是 server 端自驱动 (POST chat → poll → parse), 不走 WS
// 桥接 pipe, 所以:
//   - FeatureSpec.InjectPromptOnFirstMsg = false (没有"首条 user_message"概念)
//   - FeatureSpec.Picker = nil (业务自管 prompt, service.go 自己持有 4 个
//     PersonaRandomPicker 分别选 alpha / beta / gamma / chief)
//
// 真正的"按 alpha/beta/gamma/chief 各跑一轮"的 prompt 选择在 service.go 里:
//   service.alphaPicker / .betaPicker / .gammaPicker / .chiefPicker
// 都是 agentbridge.PersonaRandomPicker, 数据源是 feature_prompts 表
// (feature_key='peerreview', persona ∈ {alpha,beta,gamma,chief})。
//
// v2 → v3 演进:
//   - v2: systemPrompt 是本文件 Go const + 4 个 reviewer prompt 来自
//     peer_review_skills 表 (本包私有 SkillRepository)
//   - v3: systemPrompt const 删除; 所有 reviewer prompt 改用 feature_prompts 表
//     (通用) + agentbridge.PersonaRandomPicker (通用 picker), 同一套学科匹配 +
//     加权随机 + fallback 链算法
//   - peer_review_skills 表保留不动 (CLAUDE.md "Never DROP TABLE"), 数据已迁,
//     代码不再消费 — 见 DEPRECATED_TABLES.md。
//
// UpsertSkill 路径: spec.Picker=nil 时 agentbridge 跳过推 agent yaml
// (没有"代表性 prompt"可推); peerreview 不依赖 agent 容器内的 yaml 定义,
// 完全靠每轮 ServerSideChat 时把 prompt 当 user_message 发过去。
// ============================================================================

package peerreview

import (
	"scholar-backend/internal/agentbridge"
)

// FeatureKey 是 agent_sessions.feature_key + feature_prompts.feature_key 的取值。
// 一旦改动, (1) 历史 session 的 mapping 失效, 用户在审稿记录里看不到旧工单的
// agent 历史; (2) feature_prompts 里的种子 row 找不到对应 prompt; 慎改。
const FeatureKey = "peerreview"

const agentName = "scholay-peer-review"

// Spec — agentbridge 注册用的 FeatureSpec。
//
// Picker / InjectPromptOnFirstMsg / PreUserMessage / OnMessageComplete 全空:
//   server-driven 路径不走 WS pipe; 配额扣减若需要在 service.Submit 里另外接 (TODO)。
//
// UpsertSkill 在 Picker=nil 时会跳过推 agent yaml, 不会有错误日志。
var Spec = agentbridge.FeatureSpec{
	Key:                    FeatureKey,
	AgentName:              agentName,
	Description:            "Scholay AI 审稿:多视角 (alpha/beta/gamma/chief) 同行评审",
	Picker:                 nil, // 业务自管, 见 service.go 的 alphaPicker 等字段
	InjectPromptOnFirstMsg: false,
	// C14: 审批轴 = auto。peerreview 走 server-side (ws_serverside.go), 只支持 auto 自动裁决。
	PermissionMode: agentbridge.PermissionAuto,
}
