// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package smartsearch 是 scholay 智能搜索 feature 的 thin wrapper:
// 把 agentbridge.FeatureSpec 声明出来 + 把 gin 路由绑到 agentbridge.FeatureBridge 上。
// 业务逻辑 (session 生命周期 / WS 桥接 / 心跳 / system prompt 注入) 都在 agentbridge,
// 本包只做 "这个 feature 长这样" 的声明 + 极薄的 HTTP 翻译层。
//
// v3 演进:
//   原本 systemPrompt 是 Go const 写死在本文件里, 改一次 prompt 必须发版重启。
//   重构后 prompt 入 DB 表 feature_prompts (feature_key='smart_search',
//   slug=PromptSlug, persona='default'), 通过 agentbridge.BySlugPicker 解析,
//   admin 后台改 prompt 不必发版, version+history 表支持审计回滚。
//   见 backend/internal/promptregistry/ 包。
package smartsearch

import (
	"os"
	"strconv"

	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/promptregistry"
)

// FeatureKey 是 agent_sessions.feature_key 的取值, 也用作路由前缀的语义标签,
// 同时是 feature_prompts.feature_key 的取值。
// 改动会让 (1) 历史 mapping 失效 (用户拿不回上轮对话), (2) feature_prompts 表里
// 的种子 row 找不到对应 prompt, 慎改。
const FeatureKey = "smart_search"

// agentName 是 agent 容器内 ~/.claude/agents/scholay-smart-search.yaml 对应的
// subagent。bootstrap 时会 UpsertSkill 推一份当前 prompt 过去, 即便目前主流路
// 还是创建主 agent + WS 注入 prefix。
const agentName = "scholay-smart-search"

// PromptSlug 指向 feature_prompts 表里这条 prompt 的 slug。
// 改名意味着 picker 找不到 prompt → WS 第一帧失败 → 必须配合 migration 同步改。
const PromptSlug = "scholay-smart-search-v1"

// defaultDailyMessageCap 是智能搜索每用户每日 user_message 上限的默认值, 30 是粗估的
// "认真用一天" 的天花板。可以通过 env SMART_SEARCH_DAILY_MESSAGES 覆盖 (0 或负值 → 不限额)。
//
// 计数走 Redis (见 agentbridge.NewRedisDailyCap), 跨实例共享; Redis 不可用时 fail-open。
const defaultDailyMessageCap = 30

// dailyMessageCapFromEnv 读 SMART_SEARCH_DAILY_MESSAGES env, 失败回落默认值。
// 显式区分 "未设置 → 用默认" 和 "设置为 0/负 → 显式关闭限额"。
func dailyMessageCapFromEnv() int {
	raw := os.Getenv("SMART_SEARCH_DAILY_MESSAGES")
	if raw == "" {
		return defaultDailyMessageCap
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return defaultDailyMessageCap
	}
	return n
}

// BuildSpec 构造 smart_search 的 FeatureSpec。
// 必须在 bootstrap 阶段、promptregistry.Service 已初始化后调用。
//
// 用函数而不是 var 的原因: spec 需要持有 promptregistry.Service 引用构造 Picker;
// var 初始化阶段不能依赖运行期的 service 实例。
func BuildSpec(promptSvc *promptregistry.Service) agentbridge.FeatureSpec {
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 智能搜索:基于 Minicod MCP 的学术文献检索助手",
		Picker:                 agentbridge.NewBySlugPicker(promptSvc, FeatureKey, PromptSlug),
		Color:                  "green",
		InjectPromptOnFirstMsg: true, // 主 agent 默认带 Bash/Read, 必须强约束
		AutoApprovePermission:  true, // 只暴露 mcp__minicod__* 只读检索, 无破坏性操作
		// PingInterval: 0 → 走 agentbridge 默认 25s (< agent idleTimeout 60s)

		// 每日 user_message 配额: 卡 agent 上游 (DeepSeek) 的成本; 0/负数 → 不限额
		PreUserMessage: agentbridge.NewRedisDailyCap(FeatureKey, dailyMessageCapFromEnv()),
		// usage 落 slog: docker logs | grep agent_usage 即可看到每轮 token 用量
		OnMessageComplete: agentbridge.NewSlogUsageRecorder(FeatureKey),
	}
}
