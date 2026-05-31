// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

// SkillUpsertTimeout 是 UpsertSkill 单次推送的总超时, 覆盖 GET 探测 + POST/PUT 一次往返。
const SkillUpsertTimeout = 30 * time.Second

// UpsertSkill 把 FeatureSpec 同步到 scholar_agent /api/agents/<name>:
//   - 从 Picker 取一份代表性 prompt (单 prompt feature 直接取那个; 多变体取一次
//     Pick 结果作为"默认 yaml" 内容)
//   - GET /api/agents/:name 探在不在 → 200 PUT, 404 POST
//   - 幂等: 同一份内容反复推没有副作用 (内容相同时 agent 不会做事)
//
// 失败由 caller 决定是否重试; bootstrap 启动时调一次, 失败只打 warn 不阻塞起服。
//
// 目前 agent 端的 subagent 定义即便推送了, 主流路还是 WS 前缀注入 (见 ws.go);
// 推送 subagent 是为以后切到"创建时绑定 agentType"模式做铺垫, 同时也能在 agent
// 后台被看见做 debug。
//
// 特殊情况: spec.Picker 为 nil (peerreview workflow 类业务自管 prompt) → 跳过
// upsert, 因为没有"代表性 prompt"可推; agent 容器不会有该 feature 的 yaml,
// 业务也不依赖, 不影响功能。
func (b *Bridge) UpsertSkill(ctx context.Context, spec FeatureSpec) error {
	if spec.Key == "" || spec.AgentName == "" {
		return errors.New("agentbridge: spec missing Key or AgentName")
	}
	if spec.Picker == nil {
		slog.Info("agentbridge skill upsert skipped (no picker)",
			"feature", spec.Key, "agent_name", spec.AgentName)
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, SkillUpsertTimeout)
	defer cancel()

	// 拉一份"代表性 prompt"过去:
	//   - BySlugPicker → 唯一那条
	//   - PersonaRandomPicker → 按其策略加权随机一条 (agent yaml 只是 fallback,
	//     真正运行时再 Pick 一次, 所以这里随机选哪条不重要)
	choice, perr := spec.Picker.Pick(ctx, PickInput{})
	if perr != nil {
		slog.Error("agentbridge skill upsert: picker failed",
			"feature", spec.Key, "err", perr)
		return fmt.Errorf("pick prompt for %s: %w", spec.Key, perr)
	}

	body := map[string]any{
		"name":         spec.AgentName,
		"description":  spec.Description,
		"systemPrompt": choice.SystemPrompt,
	}
	if spec.Color != "" {
		body["color"] = spec.Color
	}

	if err := b.client.UpsertAgent(ctx, spec.AgentName, body); err != nil {
		slog.Error("agentbridge skill upsert failed",
			"feature", spec.Key, "agent_name", spec.AgentName, "err", err)
		return fmt.Errorf("upsert agent %s: %w", spec.AgentName, err)
	}
	slog.Info("agentbridge skill upsert succeeded",
		"feature", spec.Key, "agent_name", spec.AgentName,
		"prompt_slug", choice.Slug, "prompt_version", choice.Version)
	return nil
}
