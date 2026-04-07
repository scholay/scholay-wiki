// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package thirdparty

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// AccountType represents the type of third-party account
type AccountType string

const (
	AccountTypeSemanticScholar AccountType = "semantic_scholar"
	AccountTypeAIModel         AccountType = "ai_model"
	AccountTypeMinicod         AccountType = "minicod"
)

// ModelLevel represents the AI model capability level
type ModelLevel string

const (
	ModelLevelLow  ModelLevel = "low"
	ModelLevelMid  ModelLevel = "mid"
	ModelLevelHigh ModelLevel = "high"
)

// AccountConfig represents the configuration stored in JSON
type AccountConfig map[string]any

// Value implements driver.Valuer interface for JSON marshaling
func (c AccountConfig) Value() (driver.Value, error) {
	return json.Marshal(c)
}

// Scan implements sql.Scanner interface for JSON unmarshaling
func (c *AccountConfig) Scan(value any) error {
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal JSON value: %v", value)
	}
	return json.Unmarshal(bytes, c)
}

// SlowThresholdMs defines the latency threshold (in ms) for a request to be considered "slow"
const SlowThresholdMs = 1000

// ThirdPartyAccount represents a third-party API account configuration
type ThirdPartyAccount struct {
	ID          uint          `gorm:"primaryKey" json:"id"`
	Name        string        `gorm:"type:varchar(100);not null" json:"name"`
	Type        AccountType   `gorm:"type:varchar(50);not null;index:idx_type_status" json:"type"`
	Config      AccountConfig `gorm:"type:json;not null" json:"config"`
	Status      int           `gorm:"default:1;index:idx_type_status" json:"status"` // 1=active, 0=inactive
	Priority    int           `gorm:"default:0" json:"priority"`                     // 优先级，数字越小优先级越高
	UsageCount  uint64        `gorm:"default:0" json:"usage_count"`
	LastUsedAt  *time.Time    `json:"last_used_at,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`

	// API usage statistics
	TotalRequests     uint64 `gorm:"default:0" json:"total_requests"`       // 总请求次数（含重试）
	SuccessCount      uint64 `gorm:"default:0" json:"success_count"`        // 成功次数
	FailCount         uint64 `gorm:"default:0" json:"fail_count"`           // 失败次数
	TotalLatencyMs    uint64 `gorm:"default:0" json:"total_latency_ms"`     // 成功请求总耗时(ms)
	TotalLatencySqMs  uint64 `gorm:"default:0" json:"total_latency_sq_ms"`  // 耗时平方和(ms²) —— Var = E[X²]-E[X]²
	MaxLatencyMs      uint64 `gorm:"default:0" json:"max_latency_ms"`       // 最大单次耗时(ms)
	SlowCount         uint64 `gorm:"default:0" json:"slow_count"`           // 慢请求次数(>1s)
	SlowTotalLatencyMs uint64 `gorm:"default:0" json:"slow_total_latency_ms"` // 慢请求总耗时(ms)
}

// TableName specifies the table name for GORM
func (ThirdPartyAccount) TableName() string {
	return "third_party_accounts"
}

// SemanticScholarConfig represents the config structure for Semantic Scholar
type SemanticScholarConfig struct {
	APIKey  string `json:"api_key"`
	BaseURL string `json:"base_url,omitempty"` // Optional: custom base URL (e.g., for proxies)
}

// AIModelConfig represents the config structure for AI models
// One account can configure three different model codes for low/mid/high levels
type AIModelConfig struct {
	BaseURL  string `json:"base_url"`
	APIKey   string `json:"api_key"`
	ModelLow string `json:"model_low,omitempty"`  // Model code for low-level tasks
	ModelMid string `json:"model_mid,omitempty"`  // Model code for mid-level tasks
	ModelHigh string `json:"model_high,omitempty"` // Model code for high-level tasks
	
	// 审稿专用模型配置（三审三模型）
	PeerReviewModel1 string `json:"peer_review_model_1,omitempty"` // 审稿人 Alpha 使用的模型
	PeerReviewModel2 string `json:"peer_review_model_2,omitempty"` // 审稿人 Beta 使用的模型
	PeerReviewModel3 string `json:"peer_review_model_3,omitempty"` // 审稿人 Gamma 使用的模型
}

// MinicodConfig represents the config structure for Minicod API
type MinicodConfig struct {
	APIKey  string `json:"api_key"`
	BaseURL string `json:"base_url,omitempty"` // Optional: custom base URL (default: https://open.scholay.com)
}

// GetMinicodConfig extracts Minicod config
func (a *ThirdPartyAccount) GetMinicodConfig() (*MinicodConfig, error) {
	if a.Type != AccountTypeMinicod {
		return nil, fmt.Errorf("account type is not minicod")
	}

	var config MinicodConfig
	configBytes, err := json.Marshal(a.Config)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(configBytes, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// GetSemanticScholarConfig extracts Semantic Scholar config
func (a *ThirdPartyAccount) GetSemanticScholarConfig() (*SemanticScholarConfig, error) {
	if a.Type != AccountTypeSemanticScholar {
		return nil, fmt.Errorf("account type is not semantic_scholar")
	}

	var config SemanticScholarConfig
	configBytes, err := json.Marshal(a.Config)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(configBytes, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// GetAIModelConfig extracts AI model config
func (a *ThirdPartyAccount) GetAIModelConfig() (*AIModelConfig, error) {
	if a.Type != AccountTypeAIModel {
		return nil, fmt.Errorf("account type is not ai_model")
	}

	var config AIModelConfig
	configBytes, err := json.Marshal(a.Config)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(configBytes, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// GetModelCodeByLevel returns the model code for a specific level from AI model config
func (a *ThirdPartyAccount) GetModelCodeByLevel(level ModelLevel) (string, error) {
	config, err := a.GetAIModelConfig()
	if err != nil {
		return "", err
	}

	switch level {
	case ModelLevelLow:
		if config.ModelLow == "" {
			return "", fmt.Errorf("model_low not configured")
		}
		return config.ModelLow, nil
	case ModelLevelMid:
		if config.ModelMid == "" {
			return "", fmt.Errorf("model_mid not configured")
		}
		return config.ModelMid, nil
	case ModelLevelHigh:
		if config.ModelHigh == "" {
			return "", fmt.Errorf("model_high not configured")
		}
		return config.ModelHigh, nil
	default:
		return "", fmt.Errorf("invalid model level: %s", level)
	}
}
