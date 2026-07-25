// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentconfig

import (
	"context"
	"log/slog"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
)

// AgentPusher 抽出最小推送接口,避免 agentconfig 反向依赖 internal/agent 形成
// 循环导入(internal/agent 依赖 agentconfig.AgentConfig 类型)。
type AgentPusher interface {
	PushConfig(ctx context.Context, cfg *AgentConfig) error
}

// SlotProvider 模型槽位提供者(模型目录化 P1:internal/modelcatalog 实现)。
// 推送 agent 前用它把 4 个槽位换成绑定表解析值(main/sonnet/opus=system.main,haiku=system.fast);
// nil 或返回空 = 沿用 agent_config 列(P1 起列被冻结为迁移时值,行为=现状)。
type SlotProvider interface {
	ResolveSlots() (main string, fast string)
}

// Service agent_config 的业务封装。除了 CRUD 还负责在写入后异步把配置推到
// scholar_agent /api/providers(通过注入的 AgentPusher)。
type Service struct {
	repo         *Repository
	agentClient  AgentPusher
	extraClients []AgentPusher // P4a:executor 等次级推送目标(best-effort,不写回 push_status)
	slots        SlotProvider  // 模型目录化 P1:槽位值来源(nil=用列值)
}

// AddExtraAgentClient 追加次级推送目标(如 clean-room executor)。SyncOnce / 配置变更时一并推,
// best-effort、不写回 push_status(状态留给主 fork)。bootstrap 在配置 executor 时调用。
func (s *Service) AddExtraAgentClient(client AgentPusher) {
	if client != nil {
		s.extraClients = append(s.extraClients, client)
	}
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: NewRepository(db)}
}

// SetAgentClient 在 bootstrap 跨域注入时调用;nil 视为禁用推送(单测可省略)。
func (s *Service) SetAgentClient(client AgentPusher) {
	s.agentClient = client
}

// SetSlotProvider 注入模型槽位提供者(bootstrap 接 modelcatalog.Service)。
func (s *Service) SetSlotProvider(p SlotProvider) { s.slots = p }

func (s *Service) GetConfig() (*AgentConfig, error) {
	return s.repo.GetConfig()
}

// GetEffectiveConfig 返回「推送口径」的配置:连接字段照抄,4 个槽位按 SlotProvider(绑定表)覆盖。
// bootstrap 的 executor-config-resync 周期重推必须用它(否则 executor 拿到的是冻结的旧列值)。
func (s *Service) GetEffectiveConfig() (*AgentConfig, error) {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return nil, err
	}
	return s.effectiveConfig(cfg), nil
}

// effectiveConfig 用绑定表解析值覆盖槽位(拷贝,不动原对象)。SlotProvider 为 nil 或解析全空
// 时沿用列值 —— fresh install 未配置目录时行为与现状一致。
func (s *Service) effectiveConfig(cfg *AgentConfig) *AgentConfig {
	if s.slots == nil {
		return cfg
	}
	main, fast := s.slots.ResolveSlots()
	if main == "" && fast == "" {
		return cfg
	}
	out := *cfg
	if main != "" {
		out.MainModel, out.SonnetModel, out.OpusModel = main, main, main
		if fast == "" {
			fast = main
		}
	}
	if fast != "" {
		out.HaikuModel = fast
	}
	return &out
}

// RepushAsync 用当前落库配置触发一次异步推送(模型目录/绑定变更后由 modelcatalog 调用)。
func (s *Service) RepushAsync() {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		slog.Warn("agent config repush: load config failed", "err", err)
		return
	}
	s.pushAsync(cfg)
}

// UpdateConfig 先落库,成功后异步推送 agent;HTTP 响应不等推送结果。
// Enabled=false 时只落库,不推送(见 pushAsync)。
func (s *Service) UpdateConfig(config *AgentConfig) error {
	if err := s.repo.UpdateConfig(config); err != nil {
		return err
	}
	s.pushAsync(config)
	return nil
}

// SyncOnce 启动时调用一次:读 DB → 推 agent。失败只打日志,不影响 backend 起服。
// 同时把 push_status / last_pushed_at / push_error 写回 agent_config 一行让 admin 看得到。
func (s *Service) SyncOnce(ctx context.Context) error {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return err
	}
	if !cfg.Enabled {
		slog.Info("agent config disabled, skip startup sync")
		return nil
	}
	if s.agentClient == nil {
		slog.Warn("agent config sync: no agent client injected, skip")
		return nil
	}
	return s.pushAndRecord(ctx, cfg)
}

func (s *Service) pushAsync(cfg *AgentConfig) {
	if s.agentClient == nil {
		return
	}
	if !cfg.Enabled {
		slog.Info("agent config disabled, skip push")
		return
	}
	snapshot := *cfg
	safego.Go("agent-config-push", func() {
		ctx, cancel := ctxutil.With(ctxutil.NormalIO)
		defer cancel()
		_ = s.pushAndRecord(ctx, &snapshot)
	})
}

// pushAndRecord 是 PushConfig + 把结果写回 push_status 字段族的共享路径。
// 不抛错: 内部用 slog 记两侧失败 (推送本身的失败已被 PushConfig 打过日志, 这里仅
// 在 status 写回失败时打 warn)。返回 err 只是为了让 SyncOnce 的签名保持兼容。
func (s *Service) pushAndRecord(ctx context.Context, cfg *AgentConfig) error {
	// 模型目录化 P1:推送口径的槽位由绑定表解析(effectiveConfig),连接字段照抄。
	eff := s.effectiveConfig(cfg)
	err := s.agentClient.PushConfig(ctx, eff)
	// P4a:同步把同一份 config 推给次级目标(executor),best-effort,不影响 fork 的 push_status。
	for _, ec := range s.extraClients {
		if perr := ec.PushConfig(ctx, eff); perr != nil {
			slog.Warn("agent config: extra push (executor) failed", "err", perr)
		}
	}
	if err != nil {
		// P5(2026-07):熔断打开导致的短路(circuit breaker is open / too many requests)是**内部 sentinel**,
		// 不是端点本身出错——常见于「另一类调用(如 skill 501)连坐熔断」的窗口期(拆断路器后已大幅减少)。
		// 不把它写成端点级 push_error,避免自愈后状态成为无人刷新的孤儿假报警(徽章已改读实时健康探测)。
		if circuitbreaker.IsCircuitBreakerError(err) {
			slog.Warn("agent config: push short-circuited by breaker (not an endpoint failure), skip MarkPushFailed", "err", err)
			return err
		}
		if markErr := s.repo.MarkPushFailed(err.Error()); markErr != nil {
			slog.Warn("agent config: mark push failed status write failed",
				"err", markErr, "push_err", err)
		}
		return err
	}
	if markErr := s.repo.MarkPushSuccess(time.Now()); markErr != nil {
		slog.Warn("agent config: mark push success status write failed", "err", markErr)
	}
	return nil
}
