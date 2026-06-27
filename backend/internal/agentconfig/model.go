// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentconfig

import (
	"time"

	"scholar-backend/internal/common/utils"
)

// PushStatus 枚举: pending (刚保存, 推送中或未推) / success (上一次推成功) / failed (上一次推失败)。
// 主要给 admin 后台显示用; backend 读它没有分支判断, 只 SET。
const (
	PushStatusPending = "pending"
	PushStatusSuccess = "success"
	PushStatusFailed  = "failed"
)

// AgentConfig 通用 agent 服务 (scholar_agent 容器) 的模型与端点配置 (单行)。
// backend 在启动时和 admin 更新后会读取这张表并推送到 agent 的 /api/providers。
//
// PushStatus / LastPushedAt / PushError 由 Service.pushAsync 在每次推送结束后写回,
// admin GET 时透传给前端 — 让管理员一眼看到 "改了但没生效" 的故障态。
type AgentConfig struct {
	ID            uint       `json:"id" gorm:"primaryKey"`
	BaseURL       string     `json:"base_url" gorm:"column:base_url;type:varchar(500);not null;default:''"`
	APIKey        string     `json:"api_key" gorm:"column:api_key;type:varchar(500);not null;default:''"`
	MainModel     string     `json:"main_model" gorm:"column:main_model;type:varchar(200);not null;default:''"`
	HaikuModel    string     `json:"haiku_model" gorm:"column:haiku_model;type:varchar(200);not null;default:''"`
	SonnetModel   string     `json:"sonnet_model" gorm:"column:sonnet_model;type:varchar(200);not null;default:''"`
	OpusModel     string     `json:"opus_model" gorm:"column:opus_model;type:varchar(200);not null;default:''"`
	Enabled       bool       `json:"enabled" gorm:"column:enabled;not null;default:false"`
	PushStatus    string     `json:"push_status" gorm:"column:push_status;type:varchar(16);not null;default:'pending'"`
	LastPushedAt  *time.Time `json:"last_pushed_at" gorm:"column:last_pushed_at"`
	PushError     string     `json:"push_error" gorm:"column:push_error;type:varchar(1024);not null;default:''"`
	CreatedAt     time.Time  `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt     time.Time  `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

// TableName 指定表名 (单行配置,沿用 wechat_official_config 命名风格)。
func (AgentConfig) TableName() string {
	return "agent_config"
}

// MaskSensitiveData 返回一个把敏感字段 (api_key) 打码后的副本,
// 用于 GET 响应,避免明文 token 落到前端。
func (c *AgentConfig) MaskSensitiveData() *AgentConfig {
	masked := *c
	masked.APIKey = maskString(c.APIKey)
	return &masked
}

// maskString 全遮罩(对齐全站 utils.MaskedSecretValue 单一真源),不再回吐密钥首尾 4 位明文。
// 配套:UpdateConfig 的「遮罩=保留旧值」判定比对 MaskSensitiveData() 的输出,自洽不受格式影响。
func maskString(s string) string {
	if s == "" {
		return ""
	}
	return utils.MaskedSecretValue
}
