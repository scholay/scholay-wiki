// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 上游 Provider 实体(双协议兼容 F0,方案 docs/research/api-format-compat-2026-07/REPORT.md)。
//
// 设计:agent_providers 只放**额外** provider;agent_models.provider_id=0 恒指「默认 provider」
// (= agent_config 现行 scholay-managed 推送链,零改动)。接口格式挂 provider(格式是端点属性):
// 后台加模型选 provider 即隐含 api_format。F0 全默认 anthropic 行为等价;openai 值可保存在
// provider 上,但**挂模型被拒**直到 F3 翻译层启用。
package modelcatalog

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

const (
	APIFormatAnthropic = "anthropic"
	APIFormatOpenAI    = "openai"
)

// AgentProvider 额外上游 provider 一行(表 agent_providers;默认 provider 不在此表)。
type AgentProvider struct {
	ID           uint64     `json:"id" gorm:"primaryKey"`
	Name         string     `json:"name" gorm:"column:name;type:varchar(100);not null;default:''"`
	BaseURL      string     `json:"base_url" gorm:"column:base_url;type:varchar(500);not null;default:''"`
	APIKey       string     `json:"api_key" gorm:"column:api_key;type:varchar(500);not null;default:''"`
	APIFormat    string     `json:"api_format" gorm:"column:api_format;type:varchar(16);not null;default:'anthropic'"`
	// ReasoningReplay(迁移 0067,方言):openai 工具轮回传 reasoning(Kimi 系要求;DeepSeek 回传 400,默认关)。
	ReasoningReplay bool `json:"reasoning_replay" gorm:"column:reasoning_replay;not null;default:false"`
	Enabled      bool       `json:"enabled" gorm:"column:enabled;not null;default:true"`
	PushStatus   string     `json:"push_status" gorm:"column:push_status;type:varchar(16);not null;default:'pending'"`
	PushError    string     `json:"push_error" gorm:"column:push_error;type:varchar(1024);not null;default:''"`
	LastPushedAt *time.Time `json:"last_pushed_at" gorm:"column:last_pushed_at"`
	Notes        string     `json:"notes" gorm:"column:notes;type:varchar(500);not null;default:''"`
	CreatedAt    time.Time  `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt    time.Time  `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (AgentProvider) TableName() string { return "agent_providers" }

// ExecutorKey executor /api/providers 的 upsert 键(默认 provider 恒为 "scholay-managed")。
func (p *AgentProvider) ExecutorKey() string { return fmt.Sprintf("scholay-p%d", p.ID) }

// MaskSensitive GET 响应打码(对齐 agentconfig 手法)。
func (p *AgentProvider) MaskSensitive() *AgentProvider {
	m := *p
	if m.APIKey != "" {
		m.APIKey = utils.MaskedSecretValue
	}
	return &m
}

// ── 仓储 ────────────────────────────────────────────────────────────────────

func (r *Repository) ListProviders() ([]AgentProvider, error) {
	var rows []AgentProvider
	err := r.db.Order("id ASC").Find(&rows).Error
	return rows, err
}

func (r *Repository) GetProviderByID(id uint64) (*AgentProvider, error) {
	var row AgentProvider
	if err := r.db.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *Repository) CreateProvider(p *AgentProvider) error { return r.db.Create(p).Error }

func (r *Repository) UpdateProvider(id uint64, p *AgentProvider) error {
	return r.db.Model(&AgentProvider{}).Where("id = ?", id).Updates(map[string]any{
		"name": p.Name, "base_url": p.BaseURL, "api_key": p.APIKey,
		"api_format": p.APIFormat, "reasoning_replay": p.ReasoningReplay, "enabled": p.Enabled, "notes": p.Notes,
		"push_status": "pending", "push_error": "",
	}).Error
}

func (r *Repository) DeleteProvider(id uint64) error {
	return r.db.Delete(&AgentProvider{}, id).Error
}

func (r *Repository) CountModelsOfProvider(id uint64) int64 {
	var n int64
	r.db.Model(&AgentModel{}).Where("provider_id = ?", id).Count(&n)
	return n
}

func (r *Repository) MarkProviderPush(id uint64, ok bool, reason string) {
	upd := map[string]any{"push_status": "failed", "push_error": reason}
	if ok {
		upd = map[string]any{"push_status": "success", "push_error": "", "last_pushed_at": time.Now()}
	}
	if len(reason) > 1024 {
		upd["push_error"] = reason[:1024]
	}
	_ = r.db.Model(&AgentProvider{}).Where("id = ?", id).Updates(upd).Error
}

// ── 服务层 ──────────────────────────────────────────────────────────────────

// ProviderPusher 把一条额外 provider 推给 agent/executor(bootstrap 注入,内部对每个推送目标
// upsert by ExecutorKey,**绝不 activate** —— activate 语义保留给默认 provider)。
type ProviderPusher func(ctx context.Context, p *AgentProvider) error

// SetProviderPusher 注入推送器。
func (s *Service) SetProviderPusher(fn ProviderPusher) { s.providerPusher = fn }

// ProviderFor 按模型解析其 provider(nil = 默认 provider,走 agent_config 链)。读 30s 快照缓存。
func (s *Service) ProviderFor(modelID string) *AgentProvider {
	m := s.Get(modelID)
	if m == nil || m.ProviderID == 0 {
		return nil
	}
	if p, ok := s.load().providers[m.ProviderID]; ok {
		clone := *p
		return &clone
	}
	return nil
}

// ListProviders admin 列表(打码)。
func (s *Service) ListProviders() ([]AgentProvider, error) {
	rows, err := s.repo.ListProviders()
	if err != nil {
		return nil, err
	}
	out := make([]AgentProvider, 0, len(rows))
	for i := range rows {
		out = append(out, *rows[i].MaskSensitive())
	}
	return out, nil
}

func validateProvider(p *AgentProvider) error {
	p.Name = strings.TrimSpace(p.Name)
	p.BaseURL = strings.TrimSpace(p.BaseURL)
	if p.Name == "" || p.BaseURL == "" {
		return errors.New("名称与 Base URL 必填")
	}
	switch p.APIFormat {
	case APIFormatAnthropic, APIFormatOpenAI:
	case "":
		p.APIFormat = APIFormatAnthropic
	default:
		return errors.New("接口格式只支持 anthropic / openai")
	}
	return nil
}

// CreateProvider / UpdateProvider / DeleteProvider —— CRUD + 缓存失效 + 异步推送。
func (s *Service) CreateProvider(p *AgentProvider) error {
	if err := validateProvider(p); err != nil {
		return err
	}
	if err := s.repo.CreateProvider(p); err != nil {
		return err
	}
	s.invalidate()
	s.pushProviderAsync(p)
	return nil
}

func (s *Service) UpdateProvider(id uint64, p *AgentProvider) error {
	if err := validateProvider(p); err != nil {
		return err
	}
	existing, err := s.repo.GetProviderByID(id)
	if err != nil {
		return errors.New("provider 不存在")
	}
	// api_key 空/遮罩 = 保留旧值(对齐 agentconfig C22 手法)。
	if p.APIKey == "" || p.APIKey == utils.MaskedSecretValue {
		p.APIKey = existing.APIKey
	}
	if err := s.repo.UpdateProvider(id, p); err != nil {
		return err
	}
	s.invalidate()
	p.ID = id
	s.pushProviderAsync(p)
	return nil
}

func (s *Service) DeleteProvider(id uint64) error {
	if n := s.repo.CountModelsOfProvider(id); n > 0 {
		return fmt.Errorf("仍有 %d 个模型挂在该 provider 上,请先改挂或删除模型", n)
	}
	if err := s.repo.DeleteProvider(id); err != nil {
		return err
	}
	s.invalidate()
	return nil
}

func (s *Service) pushProviderAsync(p *AgentProvider) {
	if s.providerPusher == nil || !p.Enabled {
		return
	}
	snapshot := *p
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.providerPusher(ctx, &snapshot); err != nil {
			slog.Warn("modelcatalog: push provider failed", "provider", snapshot.ID, "err", err)
			s.repo.MarkProviderPush(snapshot.ID, false, err.Error())
			return
		}
		s.repo.MarkProviderPush(snapshot.ID, true, "")
	}()
}

// PushAllProviders 周期自愈:把全部启用的额外 provider 重推(bootstrap 的 executor-config-resync
// 顺带调用;executor recreate 后 ≤60s 恢复,与默认 provider 同一自愈节奏)。
func (s *Service) PushAllProviders(ctx context.Context) {
	if s.providerPusher == nil {
		return
	}
	rows, err := s.repo.ListProviders()
	if err != nil {
		return
	}
	for i := range rows {
		if !rows[i].Enabled {
			continue
		}
		if err := s.providerPusher(ctx, &rows[i]); err != nil {
			slog.Debug("modelcatalog: resync push provider failed", "provider", rows[i].ID, "err", err)
		}
	}
}

// ── admin HTTP ──────────────────────────────────────────────────────────────

// ListProviders GET /admin/model-providers。
func (h *Handler) ListProviders(c *gin.Context) {
	rows, err := h.service.ListProviders()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 provider 失败,请稍后重试")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", rows)
}

// CreateProvider POST /admin/model-providers。
func (h *Handler) CreateProvider(c *gin.Context) {
	var p AgentProvider
	if err := c.ShouldBindJSON(&p); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	p.ID = 0
	if err := h.service.CreateProvider(&p); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", p.MaskSensitive())
}

// UpdateProvider PUT /admin/model-providers/:id。
func (h *Handler) UpdateProvider(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的 provider 编号")
		return
	}
	var p AgentProvider
	if err := c.ShouldBindJSON(&p); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	if err := h.service.UpdateProvider(id, &p); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{"message": "updated"})
}

// DeleteProvider DELETE /admin/model-providers/:id。
func (h *Handler) DeleteProvider(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的 provider 编号")
		return
	}
	if err := h.service.DeleteProvider(id); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{"message": "deleted"})
}
