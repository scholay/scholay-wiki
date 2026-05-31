// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// ErrNotFound 是 repository 层把 gorm.ErrRecordNotFound 包了一层语义化错误,
// service 层据此分支决定是 "首次访问 → 创建" 还是其它真异常。
var ErrNotFound = errors.New("agentbridge: session mapping not found")

// SessionRow 是 agent_sessions 表的一行 = 某用户在某 feature 下绑定的 agent session。
//
// 表层 v2 演进 (见 migration 0070): PK 从复合 (user_id, feature_key) 改为代理键 id,
// 让一个 (user_id, feature_key) 可以挂多行 (claw 多会话场景)。
// 单会话 feature (smart_search / peerreview) 由应用层用 GetLatestByUserFeature 取
// "最近一条"并 GetOrCreate 保证只有 1 条, 不再依赖 DB 唯一约束。
// agent_session_id 由 uk_agent_session_id 保证全局唯一。
type SessionRow struct {
	ID             uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	UserID         uint      `gorm:"column:user_id;index"`
	FeatureKey     string    `gorm:"column:feature_key;type:varchar(64);index"`
	AgentSessionID string    `gorm:"column:agent_session_id;type:varchar(64);not null;default:'';uniqueIndex"`
	ResetCount     uint      `gorm:"column:reset_count;not null;default:0"`
	LastAccessedAt time.Time `gorm:"column:last_accessed_at;not null;default:CURRENT_TIMESTAMP"`
	CreatedAt      time.Time `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt      time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

func (SessionRow) TableName() string {
	return "agent_sessions"
}

// Repository agent_sessions 表访问层。
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ─── 单会话兼容路径 (smart_search / peerreview 用) ─────────────────────

// GetLatestByUserFeature — 取 (user, feature) 下最近活跃的一行 (last_accessed_at DESC)。
// 对单会话 feature 等价于"取当前唯一一行"; 对多会话 feature (claw) 等价于"取当前活跃 session"。
// 不存在时返回 ErrNotFound。
//
// 用 last_accessed_at 而不是 updated_at 排序: updated_at 在 reset_count 增加等场景
// 也会动, 跟"最近用过"不严格对齐; last_accessed_at 由业务路径显式 Touch 维护。
func (r *Repository) GetLatestByUserFeature(userID uint, featureKey string) (*SessionRow, error) {
	var row SessionRow
	err := r.db.
		Where("user_id = ? AND feature_key = ?", userID, featureKey).
		Order("last_accessed_at DESC, id DESC").
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &row, nil
}

// Get 是 GetLatestByUserFeature 的别名, 保留旧代码引用 (单会话场景"取当前"等于"取最近").
//
// Deprecated: 单会话 feature 用 GetLatestByUserFeature 更明确, 多会话 feature 应当
// 用 GetByAgentSessionID 按具体 session 取。
func (r *Repository) Get(userID uint, featureKey string) (*SessionRow, error) {
	return r.GetLatestByUserFeature(userID, featureKey)
}

// ─── 多会话路径 (claw 用) ──────────────────────────────────────────────

// ListByUserFeature — 列出 (user, feature) 下的所有 session, 按 last_accessed_at DESC 排序。
// 给 "我的会话列表" 侧边栏用。空结果返回空切片不返 ErrNotFound (这是合法状态)。
func (r *Repository) ListByUserFeature(userID uint, featureKey string) ([]SessionRow, error) {
	var rows []SessionRow
	err := r.db.
		Where("user_id = ? AND feature_key = ?", userID, featureKey).
		Order("last_accessed_at DESC, id DESC").
		Find(&rows).Error
	return rows, err
}

// GetByAgentSessionID — 按 agent session UUID 取行 + ownership check。
// 用于 rename / delete / activate 之前的"确认这个 sessionId 属于此用户"。
func (r *Repository) GetByAgentSessionID(userID uint, featureKey, agentSessionID string) (*SessionRow, error) {
	var row SessionRow
	err := r.db.
		Where("user_id = ? AND feature_key = ? AND agent_session_id = ?", userID, featureKey, agentSessionID).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &row, nil
}

// Touch — 更新 last_accessed_at = NOW(). 用户每次访问/切换某 session 调一次。
// 多次连续 Touch 同一 sessionID 不会击穿 DB (一行 update 极轻), 不用在应用层 debounce。
func (r *Repository) Touch(agentSessionID string) error {
	return r.db.Model(&SessionRow{}).
		Where("agent_session_id = ?", agentSessionID).
		Update("last_accessed_at", time.Now()).Error
}

// DeleteByAgentSessionID — 按 (user, feature, sessionID) 删一行。
// 用于 claw 用户删除某个历史会话。删除前 caller 应当先去 agent 端删 jsonl,
// 再删 DB 行, 避免出现"DB 已删但 agent 端 jsonl 还在"的孤儿 (反过来 ok, agent 自愈)。
func (r *Repository) DeleteByAgentSessionID(userID uint, featureKey, agentSessionID string) error {
	return r.db.
		Where("user_id = ? AND feature_key = ? AND agent_session_id = ?", userID, featureKey, agentSessionID).
		Delete(&SessionRow{}).Error
}

// ─── 写路径 ─────────────────────────────────────────────────────────────

// Create 写一行新 mapping。在多会话语义下, 同 (user, feature) 可以反复 Create
// 创建多个 session; agent_session_id 由 uk_agent_session_id 索引保证全局唯一,
// 重复 sessionId (理论上不会, UUID 冲突概率忽略) 会 fail 让 caller 重试。
func (r *Repository) Create(row *SessionRow) error {
	return r.db.Create(row).Error
}

// UpdateSessionID 重置场景: 把指定 mapping 行的 agent_session_id 换成新的, reset_count + 1。
// 这是单会话语义的 "原地替换" — 给 smart_search / peerreview 的 reset 路径用。
// claw 多会话场景应该走 Create 新增另一行, 不调这个。
func (r *Repository) UpdateSessionID(userID uint, featureKey, newSessionID string) error {
	return r.db.Model(&SessionRow{}).
		Where("user_id = ? AND feature_key = ?", userID, featureKey).
		Updates(map[string]any{
			"agent_session_id": newSessionID,
			"reset_count":      gorm.Expr("reset_count + 1"),
			"last_accessed_at": time.Now(),
		}).Error
}
