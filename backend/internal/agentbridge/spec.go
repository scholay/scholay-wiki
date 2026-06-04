// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package agentbridge 把 scholar_agent (Scholay 科研助手 daemon) 的会话/WS 接入能力收成一个通用桥。
//
// 设计动机:
//   smartsearch 是 agent 的第一个消费者; 后续 paper-review / latex-writer 等
//   feature 都会重写一遍 "用户↔session 映射 + WS upgrade + JWT 校验 + 心跳 +
//   首条 user_message 注入 system prompt + 自动 approve permission" 这套样板代码。
//   本包把这些抽出来, 每个 feature 只声明一份 FeatureSpec, handler 就是 3-4 行
//   thin wrapper, 业务模块零样板。
//
// 使用方式:
//   1. feature 定义一份 FeatureSpec (key/agent name/system prompt/选项)
//   2. bootstrap: bridge := agentbridge.New(agentClient, repo);
//                 fb := bridge.For(featureSpec)
//   3. feature handler 持有 *FeatureBridge, gin 路由直接挂 fb.HandleWS 等方法
//
// 数据流:
//   POST /<feature>/session         → FeatureBridge.GetOrCreateSession → repo + agent
//   POST /<feature>/session/reset   → FeatureBridge.ResetSession
//   GET  /<feature>/session/messages → FeatureBridge.GetSessionMessages
//   GET  /<feature>/session/context → FeatureBridge.GetContextEstimate
//   GET  /<feature>/ws/:sessionId   → FeatureBridge.HandleWS (JWT query + ownership)
package agentbridge

import (
	"context"
	"time"

	"scholar-backend/internal/agent"
)

// AgentUsage 是 agent message_complete 事件里 usage 字段的 Go 视图,
// 由 OnMessageComplete hook 接收, 供 quota / billing / analytics 消费。
type AgentUsage struct {
	InputTokens         int    `json:"input_tokens"`
	OutputTokens        int    `json:"output_tokens"`
	CacheReadTokens     int    `json:"cache_read_tokens,omitempty"`
	CacheCreationTokens int    `json:"cache_creation_tokens,omitempty"`
	Model               string `json:"model,omitempty"` // 由 pipe 缓存最近一帧 assistant.model 注入
}

// PreUserMessageFn 在每条 user_message 转发到 agent 前同步调用。
// 返回非 nil error → pipe 不转发, 给前端回一个 {type:error,code,message} 帧,
// WS 保持打开 (用户可以下一轮再试)。典型用途: 每日额度卡。
//
// content 是 user_message.content 的原始字符串 (注入 prefix 之前); userID 已经过 JWT 校验。
type PreUserMessageFn func(ctx context.Context, userID uint, content string) error

// OnMessageCompleteFn 在 agent 返回 message_complete 后异步调用 (safego 包起来不会阻塞 pipe)。
// 典型用途: 把 usage 写到日志或账单表, 做事后审计。失败仅打 warn, 不影响业务。
type OnMessageCompleteFn func(ctx context.Context, userID uint, usage AgentUsage)

// FeatureSpec 描述一个 agent 消费者 feature 的全部定制信息。
//
// 这些字段在 bootstrap 阶段静态填好, 之后只读, 跨多个请求复用同一份。
//
// 重要演进 (v2 → v3):
//   - v2: SystemPrompt 是 Go const 字段, 编译期固化, 改 prompt 必须发版重启
//   - v3: 删除 SystemPrompt 字段, 改用 Picker (DB-backed promptregistry)。
//     运营在 admin 后台改 prompt 不必重启, 历史版本可审计可回滚。
//     单 prompt feature (smart_search/claw) 用 BySlugPicker;
//     多视角 feature (peerreview) 用 PersonaRandomPicker (一个 persona 一个 picker)。
type FeatureSpec struct {
	// Key 是 agent_sessions.feature_key 的取值, 全局唯一, 用于
	// (user_id, feature_key) 复合主键。简短的 snake_case, <= 64 字符。
	// 例: smart_search / peerreview / claw。
	// 同时也是 feature_prompts.feature_key 的取值, picker 据此过滤候选池。
	Key string

	// AgentName 是 agent 容器内 ~/.claude/agents/<name>.yaml 对应的 subagent 标识。
	// bootstrap 时通过 Bridge.UpsertSkill 把 (默认 prompt 的 default-persona slug)
	// 内容推到该名字, 让 agent 端持久化一份 subagent 定义。
	//
	// 即便目前主流路是 WS 前缀注入, 推送一份 agent yaml 仍有两个用途:
	//   1) 后续切到"创建 session 时指定 agentType"模式时无需改 bootstrap
	//   2) 在 agent 容器后台能直接看到当前 prompt 内容, 方便 debug
	AgentName string

	// Description 给 agent 端展示用 (POST /api/agents 的 description 字段)。
	Description string

	// Picker — 决定怎么从 promptregistry 选 prompt。
	//
	// nil → 仅当 InjectPromptOnFirstMsg=false 且业务自己管 prompt (不走 agentbridge
	// 注入) 时才允许; 比如 peerreview 走 ServerSideChatStreaming + 业务层逐轮自选,
	// 这时 FeatureSpec.Picker 可以为 nil。
	//
	// 其他情况 nil 会让 WS handler 在首条消息时 ErrPickerNotConfigured fail-fast。
	Picker PromptPicker

	// Color 仅给 agent 端 UI 配色用, 不影响行为; 留空即可。
	Color string

	// InjectPromptOnFirstMsg 控制是否在 WS 桥的首条 user_message 前注入 Picker.Pick()
	// 的结果作为 prefix。目前 smart_search / claw 必须开 (因为创建的是主 agent 不是
	// subagent, 默认带 Bash/Read 全工具集, 不强约束会陷入死循环); 等 agent 端支持
	// 创建 session 时指定 agentType 后, 这个开关就可以下掉。
	//
	// 注意: true 时 Picker 必填; false 时 Picker 可以是 nil (业务自管)。
	InjectPromptOnFirstMsg bool

	// AutoApprovePermission 控制是否在 WS pipe 里拦截 permission_request 自动回
	// allowed=true。只读检索类工具 (mcp__minicod__*) 可以开; 涉及写操作的 feature
	// 必须关并把 permission_request 透传给前端走人工审批。
	AutoApprovePermission bool

	// PingInterval 应用层 keepalive 周期, 必须小于 agent 端 Bun.serve idleTimeout (60s)。
	// 0 时取默认值 (25s)。
	PingInterval time.Duration

	// PreUserMessage 在每条 user_message 转发到 agent 前同步调用, 用于做配额 / 限流。
	// nil → 不做检查直接放行。详见 PreUserMessageFn 定义。
	PreUserMessage PreUserMessageFn

	// OnMessageComplete 在每轮 agent 回答完 (拿到 message_complete) 后异步调用。
	// nil → 不记账 (usage 仅在 agent 端 transcript 留底)。
	OnMessageComplete OnMessageCompleteFn

	// specDeny 见下:取 SessionOptions.DisallowedTools 给后端 permission 二道防线用。
	//
	// SessionOptions 创建该 feature 的 agent session 时透传给 agent.CreateSession,
	// 用于 per-feature 收紧工具集 / 指定 work dir / add-dir。nil → 用 agent 默认(全工具)。
	// 例: Prism 写作设 DisallowedTools=[Bash,Write,Edit,MultiEdit] —— agent 只能产
	// [PRISM_PATCH] 文本, 永不直接落盘真源(文件真源在后端 DB)。
	SessionOptions *agent.CreateSessionOptions
}

// specDeny 取该 feature 会话的显式禁用工具(给后端 permission 二道防线)。无则 nil。
func specDeny(spec FeatureSpec) []string {
	if spec.SessionOptions != nil {
		return spec.SessionOptions.DisallowedTools
	}
	return nil
}

// PingIntervalOrDefault 处理 0 → 25s 的默认值兜底。
func (s FeatureSpec) PingIntervalOrDefault() time.Duration {
	if s.PingInterval > 0 {
		return s.PingInterval
	}
	return 25 * time.Second
}
