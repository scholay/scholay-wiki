// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"errors"
	"fmt"
	"regexp"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

	// 归属归一 (migration 0014): 实体级会话用 owner_kind/owner_id 锚定到业务实体,
	// 一实体一会话 (uk_owner)。用户级会话 (smart_search / claw 多会话) 两列留 NULL,
	// 多行 (NULL,NULL) 在 uk_owner 下互不冲突。指针类型让 NULL 与 0/'' 区分开。
	OwnerKind *string `gorm:"column:owner_kind;type:varchar(32)"`
	OwnerID   *uint64 `gorm:"column:owner_id"`
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

// FindByAgentSessionID — 仅按 agent session UUID 全局唯一查一行(不带 user/feature 过滤)。
// 给 agent 内网回调用:agent 只知道 sessionId,后端据此反查归属(user_id / feature_key),
// 再把「带外」token 用量(title-gen 等)记到正确的 user/feature 上。
func (r *Repository) FindByAgentSessionID(agentSessionID string) (*SessionRow, error) {
	var row SessionRow
	err := r.db.Where("agent_session_id = ?", agentSessionID).First(&row).Error
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

// ─── 实体级归属路径 (prism / peerreview 用, migration 0014) ───────────────

// GetByOwner — 按 (owner_kind, owner_id) 取该实体当前绑定的会话行。不存在返回 ErrNotFound。
// 供 prism/peerreview 之外想直接按实体反查会话时用 (当前主路径仍读各自业务表的
// agent_session_id 列, 这里是统一归属表的对称读口)。
func (r *Repository) GetByOwner(ownerKind string, ownerID uint64) (*SessionRow, error) {
	var row SessionRow
	err := r.db.
		Where("owner_kind = ? AND owner_id = ?", ownerKind, ownerID).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &row, nil
}

// DeleteByOwner — 按 (owner_kind, owner_id) 删该实体的归属行。实体被删时清理用。
func (r *Repository) DeleteByOwner(ownerKind string, ownerID uint64) error {
	return r.db.
		Where("owner_kind = ? AND owner_id = ?", ownerKind, ownerID).
		Delete(&SessionRow{}).Error
}

// ─── 归属对账(self-heal,给定时 reconcile 用)──────────────────────────────

// OwnerReconcileTarget 描述一个「实体级会话」业务表 → agent_sessions 归属表的对账目标。
// 字段都是代码内常量(非用户输入),由 bootstrap 按 feature 填好传进来。
type OwnerReconcileTarget struct {
	FeatureKey  string // agent_sessions.feature_key,如 "prism" / "peerreview"
	OwnerKind   string // owner_kind,如 "project" / "submission"
	SourceTable string // 业务表名,如 "prism_projects" / "peer_review_submissions"
	SessionCol  string // 业务表里存 agent session id 的列名,通常 "agent_session_id"
}

// identRe 校验表名/列名(防 SQL 注入兜底;实际调用方传的都是代码常量)。
var identRe = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

// ReconcileOwnerSessions 把业务表里「有 agent 会话、但归属表 agent_sessions 缺行/对不上」的
// 实体级会话补写进归属表(self-heal)。纯加法:INSERT … ON DUPLICATE KEY UPDATE,只补漏/纠偏,
// 绝不删除任何行(孤儿清理另议)。返回受影响行数(MySQL 下 insert 计 1、update 计 2,仅供日志参考)。
//
// 这是 best-effort 双写(BindOwnerSession)的兜底对账:运行期某次双写失败只 warn 不阻断,
// 留下「业务表有 session 但归属表缺行」的漂移;本方法周期性扫出来补上,让标准 OwnsSession /
// IssueWSTicket 始终覆盖,从而支撑「对账清零后删 prism Trusted 后门」。
func (r *Repository) ReconcileOwnerSessions(t OwnerReconcileTarget) (int64, error) {
	if !identRe.MatchString(t.SourceTable) || !identRe.MatchString(t.SessionCol) {
		return 0, fmt.Errorf("agentbridge: invalid reconcile identifiers %q/%q", t.SourceTable, t.SessionCol)
	}
	// %[1]s=业务表 %[2]s=session 列;feature_key / owner_kind 走参数。
	// 三个 ? 依次:feature_key 列值、owner_kind 列值、JOIN 的 owner_kind。
	sql := fmt.Sprintf(`
INSERT INTO agent_sessions
  (user_id, feature_key, agent_session_id, owner_kind, owner_id, reset_count, last_accessed_at, created_at, updated_at)
SELECT s.user_id, ?, s.%[2]s, ?, s.id, 0, NOW(), NOW(), NOW()
FROM %[1]s s
LEFT JOIN agent_sessions a ON a.owner_kind = ? AND a.owner_id = s.id
WHERE s.%[2]s IS NOT NULL AND s.%[2]s <> ''
  AND (a.id IS NULL OR a.agent_session_id <> s.%[2]s)
ON DUPLICATE KEY UPDATE
  agent_session_id = VALUES(agent_session_id),
  user_id          = VALUES(user_id),
  last_accessed_at = NOW(),
  updated_at       = NOW()`, t.SourceTable, t.SessionCol)
	res := r.db.Exec(sql, t.FeatureKey, t.OwnerKind, t.OwnerKind)
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}

// UpsertByOwnerEntity — 实体级会话的「按归属唯一键 upsert」。
//
// 关键: 必须按 (owner_kind, owner_id) upsert, 不能用 INSERT IGNORE。
// churn 场景 (peerreview assets 变更 reset / prism recreate) 会换 agent_session_id,
// 若新插一行不动旧行 → 同一实体出现两行 → 撞 uk_owner; 用 ON DUPLICATE KEY UPDATE
// 在同一行原地把 agent_session_id 换掉 (旧 UUID 随之消失, 也不会撞 uk_agent_session_id),
// 既不留孤儿也不破唯一约束。reset_count 在 churn 时 +1。
//
// 这是 prism/peerreview 写自己业务表 agent_session_id 后的「双写」, 让 agent_sessions
// 成为四个 feature 统一的归属表, 标准 OwnsSession 即可覆盖 (无需各 feature 自建后门)。
func (r *Repository) UpsertByOwnerEntity(userID uint, featureKey, ownerKind string, ownerID uint64, agentSessionID string) error {
	now := time.Now()
	row := SessionRow{
		UserID:         userID,
		FeatureKey:     featureKey,
		AgentSessionID: agentSessionID,
		OwnerKind:      &ownerKind,
		OwnerID:        &ownerID,
		LastAccessedAt: now,
	}
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "owner_kind"}, {Name: "owner_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"agent_session_id": agentSessionID,
			"user_id":          userID,
			"reset_count":      gorm.Expr("reset_count + IF(agent_session_id <> ?, 1, 0)", agentSessionID),
			"last_accessed_at": now,
			"updated_at":       now,
		}),
	}).Create(&row).Error
}
