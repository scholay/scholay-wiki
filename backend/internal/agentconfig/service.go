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

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
)

// AgentPusher 抽出最小推送接口,避免 agentconfig 反向依赖 internal/agent 形成
// 循环导入(internal/agent 依赖 agentconfig.AgentConfig 类型)。
type AgentPusher interface {
	PushConfig(ctx context.Context, cfg *AgentConfig) error
}

// Service agent_config 的业务封装。除了 CRUD 还负责在写入后异步把配置推到
// scholar_agent /api/providers(通过注入的 AgentPusher)。
type Service struct {
	repo         *Repository
	agentClient  AgentPusher
	extraClients []AgentPusher // P4a:executor 等次级推送目标(best-effort,不写回 push_status)
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

func (s *Service) GetConfig() (*AgentConfig, error) {
	return s.repo.GetConfig()
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
	err := s.agentClient.PushConfig(ctx, cfg)
	// P4a:同步把同一份 config 推给次级目标(executor),best-effort,不影响 fork 的 push_status。
	for _, ec := range s.extraClients {
		if perr := ec.PushConfig(ctx, cfg); perr != nil {
			slog.Warn("agent config: extra push (executor) failed", "err", perr)
		}
	}
	if err != nil {
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
