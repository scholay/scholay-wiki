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
)

// AccountConfig represents the configuration stored in JSON
type AccountConfig map[string]interface{}

// Value implements driver.Valuer interface for JSON marshaling
func (c AccountConfig) Value() (driver.Value, error) {
	return json.Marshal(c)
}

// Scan implements sql.Scanner interface for JSON unmarshaling
func (c *AccountConfig) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal JSON value: %v", value)
	}
	return json.Unmarshal(bytes, c)
}

// ThirdPartyAccount represents a third-party API account configuration
type ThirdPartyAccount struct {
	ID          uint          `gorm:"primaryKey" json:"id"`
	Name        string        `gorm:"type:varchar(100);not null" json:"name"`
	Type        AccountType   `gorm:"type:varchar(50);not null;index:idx_type_status" json:"type"`
	Config      AccountConfig `gorm:"type:json;not null" json:"config"`
	Status      int           `gorm:"default:1;index:idx_type_status" json:"status"` // 1=active, 0=inactive
	UsageCount  uint64        `gorm:"default:0" json:"usage_count"`
	LastUsedAt  *time.Time    `json:"last_used_at,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
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
type AIModelConfig struct {
	BaseURL string `json:"base_url"`
	APIKey  string `json:"api_key"`
	Model   string `json:"model,omitempty"` // Optional: specific model name
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
