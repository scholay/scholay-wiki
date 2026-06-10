package agentartifact

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrNotFound —— 把 gorm.ErrRecordNotFound 包成语义化错误,handler 据此走 404。
var ErrNotFound = errors.New("agentartifact: not found")

// Repository agent_artifacts 表访问层。
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Upsert 按 dedup_anchor 收割 upsert —— 同一 (session, relPath) 再次收割时更新该行,
// 不产生重复。调用方负责先算好 a.DedupAnchor(= DedupAnchorFor(session, relPath))。
//
// 注意只更新「内容/元信息」列;owner/session/rel_path/created_at 等身份列不动。
func (r *Repository) Upsert(a *Artifact) error {
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "dedup_anchor"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"filename", "mime", "size_bytes", "content_sha256", "source_sig",
			"storage_key", "title", "description", "kind", "updated_at",
		}),
	}).Create(a).Error
}

// GetByID 取一行;不存在 → ErrNotFound。
func (r *Repository) GetByID(id uint64) (*Artifact, error) {
	var a Artifact
	err := r.db.Where("id = ?", id).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// GetByDedup 按收割键取一行(收割时判断是否已存在 / 内容是否变更);不存在 → ErrNotFound。
func (r *Repository) GetByDedup(anchor string) (*Artifact, error) {
	var a Artifact
	err := r.db.Where("dedup_anchor = ?", anchor).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// ListBySession 列某会话的全部交付物(按 created_at 升序,稳定展示顺序)。
func (r *Repository) ListBySession(sessionID string) ([]Artifact, error) {
	var rows []Artifact
	err := r.db.Where("session_id = ?", sessionID).
		Order("created_at ASC, id ASC").
		Find(&rows).Error
	return rows, err
}

// DeleteBySession 删某会话全部交付物行,返回被删行的 storage_key(供调用方删 MinIO 对象)。
// 用于会话 reset/delete 的清理(会话 TTL)。先查后删,保证拿得到 key。
func (r *Repository) DeleteBySession(sessionID string) ([]string, error) {
	var rows []Artifact
	if err := r.db.Select("storage_key").
		Where("session_id = ?", sessionID).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	keys := collectKeys(rows)
	if err := r.db.Where("session_id = ?", sessionID).Delete(&Artifact{}).Error; err != nil {
		return keys, err
	}
	return keys, nil
}

// DeleteStaleBySession 删某会话中 rel_path **不在** keepRelPaths 内的行(= ./out 里已不存在的旧交付物),
// 返回被删行的 storage_key 供删 MinIO。收割对账用:保证 DB/MinIO 与当前 ./out 状态一致。
// keepRelPaths 为空 → 等价 DeleteBySession(整会话清空)。
func (r *Repository) DeleteStaleBySession(sessionID string, keepRelPaths []string) ([]string, error) {
	where := func() *gorm.DB {
		q := r.db.Where("session_id = ?", sessionID)
		if len(keepRelPaths) > 0 {
			q = q.Where("rel_path NOT IN ?", keepRelPaths)
		}
		return q
	}
	var rows []Artifact
	if err := where().Select("storage_key").Find(&rows).Error; err != nil {
		return nil, err
	}
	keys := collectKeys(rows)
	if err := where().Delete(&Artifact{}).Error; err != nil {
		return keys, err
	}
	return keys, nil
}

func collectKeys(rows []Artifact) []string {
	keys := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.StorageKey != "" {
			keys = append(keys, row.StorageKey)
		}
	}
	return keys
}
