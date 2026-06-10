// ============================================================================
// internal/agentartifact —— agent 成果交付物(已落 MinIO)的元数据 + 访问层。
//
// 字节存 MinIO(bucket = storage.AgentArtifactsBucket()),本表只存元信息。
// 归属沿用 agent_sessions 的 owner_kind/owner_id(见 migration 0014/0025);
// 生命周期 = 会话 TTL:会话 reset/delete 时调 DeleteBySession 拿回 storage_key 删 MinIO。
//
// 设计来源:docs/research/agent-web-delivery/(Phase 1「后端中转落 MinIO」)。
// ============================================================================

package agentartifact

import (
	"crypto/sha256"
	"encoding/hex"
	"time"
)

// Artifact 是 agent_artifacts 表的一行 = 一个已落 MinIO 的 agent 成果交付物。
type Artifact struct {
	ID            uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	OwnerKind     string    `gorm:"column:owner_kind;type:varchar(32);not null;default:user"`
	OwnerID       uint64    `gorm:"column:owner_id;not null;index"`
	FeatureKey    string    `gorm:"column:feature_key;type:varchar(64);not null;default:claw"`
	SessionID     string    `gorm:"column:session_id;type:varchar(191);not null;index"`
	RelPath       string    `gorm:"column:rel_path;type:varchar(512);not null"`
	Filename      string    `gorm:"column:filename;type:varchar(255);not null"`
	Mime          string    `gorm:"column:mime;type:varchar(160);not null;default:''"`
	SizeBytes     int64     `gorm:"column:size_bytes;not null;default:0"`
	ContentSHA256 string    `gorm:"column:content_sha256;type:char(64);not null;default:''"`
	SourceSig     string    `gorm:"column:source_sig;type:varchar(64);not null;default:''"` // size:mtimeMs,收割变更检测
	StorageKey    string    `gorm:"column:storage_key;type:varchar(640);not null;default:''"`
	DedupAnchor   string    `gorm:"column:dedup_anchor;type:char(64);not null;uniqueIndex"`
	Title         string    `gorm:"column:title;type:varchar(255);not null;default:''"`
	Description   string    `gorm:"column:description;type:varchar(1024);not null;default:''"`
	Kind          string    `gorm:"column:kind;type:varchar(16);not null;default:file"`
	CreatedAt     time.Time `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt     time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

// TableName 固定表名,避免 GORM 复数化。
func (Artifact) TableName() string { return "agent_artifacts" }

// DedupAnchorFor 计算 (session, relPath) 的稳定唯一收割键 = sha256(sessionID \0 relPath)。
// 收割时据此 upsert:同一文件再次收割 → 更新同一行,不产生重复。
func DedupAnchorFor(sessionID, relPath string) string {
	sum := sha256.Sum256([]byte(sessionID + "\x00" + relPath))
	return hex.EncodeToString(sum[:])
}
