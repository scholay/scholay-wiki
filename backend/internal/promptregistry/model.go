// ============================================================================
// Scholay 学术 V1.0
// promptregistry — 通用 AI feature prompt 注册表
//
// 这个模块统一管理所有 AI feature (smart_search / claw / peerreview / ...)
// 的 system_prompt 文本。让运营在 admin 后台改 prompt 不必发版重启。
//
// 关键设计:
//   - Prompt 是 "可独立寻址的素材", 通过 (feature_key, slug) 唯一定位
//   - persona 维度让单 feature 可挂多份 prompt (peerreview 的 alpha/beta/gamma/chief)
//   - applicable_subjects + weight 给 picker 算法用 (学科匹配 + 加权随机)
//   - version + history 表支持改 prompt 时审计 + 回滚
//   - source ENUM('seed','admin') 区分代码种子 vs 后台编辑; 工程师改 seed 时
//     遇 admin 行不覆盖, 保护运营改动
//
// 业务模块用法:
//   - 不直接用 Repository, 走 Service (有 Redis 缓存)
//   - smart_search/claw 类单 prompt feature: service.Resolve(featureKey, slug)
//   - peerreview 类多视角 feature: service.ListByPersona(featureKey, persona) + 业务层自选
//
// 不在本包里干的事:
//   - 不做 picker 算法 (BySlug / PersonaRandom / WeightedRandom) → 那是 agentbridge 的责任
//   - 不做 prompt 注入到 agent (那是 agentbridge.WS handler 的责任)
//   - 不直接给 feature 业务代码用 — feature 走 agentbridge.PromptPicker 解耦
// ============================================================================

package promptregistry

import (
	"encoding/json"
	"time"
)

// Prompt — feature_prompts 表的 ORM 模型 + 业务对象。
//
// ApplicableSubjects 字段对外暴露 string slice (业务友好), DB 存 JSON.
// 通过 SubjectsJSON 字段做中转 (gorm 拉到 JSON 原文, Go 这边 lazy 反序列化)。
type Prompt struct {
	ID         uint64 `gorm:"primaryKey;column:id" json:"id"`
	FeatureKey string `gorm:"column:feature_key;size:64;not null" json:"feature_key"`
	Slug       string `gorm:"column:slug;size:128;not null" json:"slug"`
	Persona    string `gorm:"column:persona;size:32;not null;default:'default'" json:"persona"`

	Name        string  `gorm:"column:name;size:120;not null" json:"name"`
	Description *string `gorm:"column:description;size:500" json:"description,omitempty"`

	// 学科白名单 — DB 存 JSON 数组; 应用层用 Subjects() 解出来。
	// 用 RawMessage 而不是 []string 让 gorm 不去猜怎么 marshal, 我们自己控制。
	SubjectsJSON json.RawMessage `gorm:"column:applicable_subjects;type:json" json:"-"`

	Weight  float32 `gorm:"column:weight;type:decimal(4,2);not null;default:1.00" json:"weight"`
	Enabled bool    `gorm:"column:enabled;not null;default:1" json:"enabled"`

	SystemPrompt string `gorm:"column:system_prompt;type:mediumtext;not null" json:"system_prompt"`

	Version          int     `gorm:"column:version;not null;default:1" json:"version"`
	Source           string  `gorm:"column:source;type:enum('seed','admin');not null;default:'seed'" json:"source"`
	UpdatedByUserID  *uint64 `gorm:"column:updated_by_user_id" json:"updated_by_user_id,omitempty"`

	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (Prompt) TableName() string { return "feature_prompts" }

// Subjects 反序列化 SubjectsJSON 给业务用。空 / 损坏 都返回 nil (= 通用 fallback)。
// picker 算法约定: len(Subjects())==0 表示这条 prompt 对所有学科适用。
func (p *Prompt) Subjects() []string {
	if len(p.SubjectsJSON) == 0 {
		return nil
	}
	var out []string
	if err := json.Unmarshal(p.SubjectsJSON, &out); err != nil {
		return nil
	}
	return out
}

// SetSubjects 把 string slice 序列化进 SubjectsJSON 字段, 给写路径用。
// 空 slice → 显式 JSON "[]" (与 NULL 行为区分: [] 是"运营明确说通用", NULL 是"没设过")。
func (p *Prompt) SetSubjects(subs []string) {
	if subs == nil {
		p.SubjectsJSON = nil
		return
	}
	b, _ := json.Marshal(subs)
	p.SubjectsJSON = b
}

// PromptHistory — feature_prompt_history 表的快照行。每次 Upsert 写改前
// 落一条这里, 用于 admin 后台"查看历史 / 回滚到某版本"。
type PromptHistory struct {
	ID              uint64          `gorm:"primaryKey;column:id" json:"id"`
	PromptID        uint64          `gorm:"column:prompt_id;not null;index" json:"prompt_id"`
	Version         int             `gorm:"column:version;not null" json:"version"`
	Name            string          `gorm:"column:name;size:120;not null" json:"name"`
	SubjectsJSON    json.RawMessage `gorm:"column:applicable_subjects;type:json" json:"applicable_subjects,omitempty"`
	Weight          float32         `gorm:"column:weight;type:decimal(4,2);not null" json:"weight"`
	Enabled         bool            `gorm:"column:enabled;not null" json:"enabled"`
	SystemPrompt    string          `gorm:"column:system_prompt;type:mediumtext;not null" json:"system_prompt"`
	ChangeNote      *string         `gorm:"column:change_note;size:500" json:"change_note,omitempty"`
	ChangedByUserID *uint64         `gorm:"column:changed_by_user_id" json:"changed_by_user_id,omitempty"`
	CreatedAt       time.Time       `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (PromptHistory) TableName() string { return "feature_prompt_history" }
