package agentattachstore

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrNotFound —— 把 gorm.ErrRecordNotFound 包成语义化错误,handler 据此走 404。
var ErrNotFound = errors.New("agentattachstore: not found")

// Repository agent_attachments 表访问层。
//
// 🔴 全部按 user_id 收窄:附件是用户原始数据(stat_lab 场景可能含 PHI),
// 越权一律当「不存在」而不是「无权限」—— 后者是一个存在性预言机。
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	if db == nil {
		return nil
	}
	return &Repository{db: db}
}

// Upsert 按 uk_agent_att_session_uuid (session_id, attachment_uuid) 幂等写入。
//
// 冲突时只更新「内容/状态」列:身份列(uuid/user/session)按定义不会变,而 created_at
// 要保住 —— 跨会话物化重跑一次不该让附件在「我的文件」里跳到最前面。
func (r *Repository) Upsert(a *Attachment) error {
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "session_id"}, {Name: "attachment_uuid"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"feature_key", "stored_name", "rel_path", "filename", "att_type", "mime",
			"size_bytes", "content_sha256", "storage_key", "origin_id",
			"materialized_at", "updated_at",
		}),
	}).Create(a).Error
}

// GetByUUID 按附件身份取一行(取回端点主入口)。
//
// 同一 uuid 可能在多个会话里有行(跨会话复用),但它们**指向同一份字节** ——
// 取 id 最小的那行(= 原生上传的那一行)即可,不需要调用方关心会话。
// 已软删的行照常返回:调用方要据此回 410「已被删除」,而不是含混的 404。
func (r *Repository) GetByUUID(uuid string, userID uint64) (*Attachment, error) {
	var a Attachment
	err := r.db.Where("attachment_uuid = ? AND user_id = ?", uuid, userID).
		Order("id ASC").First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// GetBySessionUUID 取「这个会话里的这个附件」那一行 —— 自愈判定要的是 per-session 的
// materialized_at / rel_path,不能用 GetByUUID 拿到的别的会话那行。
func (r *Repository) GetBySessionUUID(sessionID, uuid string, userID uint64) (*Attachment, error) {
	var a Attachment
	err := r.db.Where("session_id = ? AND attachment_uuid = ? AND user_id = ?", sessionID, uuid, userID).
		First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// FindLiveByUserSHA 找该用户已存在且未软删、且真的有 MinIO 对象的同内容行(上传去重)。
// 命中即可复用 storage_key、跳过一次 PUT —— 也是「cwd 配额满 → 用户删几个文件再重试」
// 这条路便宜的原因(重试不会重新上传 30MB)。
func (r *Repository) FindLiveByUserSHA(userID uint64, sha string) (*Attachment, error) {
	if sha == "" {
		return nil, ErrNotFound
	}
	var a Attachment
	err := r.db.Where("user_id = ? AND content_sha256 = ? AND storage_key <> '' AND deleted_at IS NULL",
		userID, sha).Order("id ASC").First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// CountRefs 数「除 excludeID 外还有多少行指着这个对象」。
// 内容寻址的必然代价:删一行不等于能删对象。归零才允许 DeleteObject。
func (r *Repository) CountRefs(userID uint64, sha string, excludeID uint64) (int64, error) {
	if sha == "" {
		return 0, nil
	}
	var n int64
	err := r.db.Model(&Attachment{}).
		Where("user_id = ? AND content_sha256 = ? AND id <> ? AND deleted_at IS NULL", userID, sha, excludeID).
		Count(&n).Error
	return n, err
}

// SumBytesByUser 求该用户的耐久占用(per-user 附件配额)。
// 按 DISTINCT content_sha256 求和:跨会话复用同一份文件不重复计费 —— 否则用户在 5 个
// 对话里引用同一份 20MB 数据就被算成 100MB,与「MinIO 只存 1 份」的事实矛盾。
func (r *Repository) SumBytesByUser(userID uint64) (int64, error) {
	var total *int64
	err := r.db.Raw(`SELECT COALESCE(SUM(size_bytes),0) FROM (
	    SELECT content_sha256, MAX(size_bytes) AS size_bytes
	      FROM agent_attachments
	     WHERE user_id = ? AND deleted_at IS NULL AND content_sha256 <> ''
	     GROUP BY content_sha256
	) t`, userID).Scan(&total).Error
	if err != nil || total == nil {
		return 0, err
	}
	return *total, nil
}

// ListBySession 列某会话的全部附件(按上传顺序)。
func (r *Repository) ListBySession(sessionID string, userID uint64) ([]Attachment, error) {
	var rows []Attachment
	err := r.db.Where("session_id = ? AND user_id = ? AND deleted_at IS NULL", sessionID, userID).
		Order("id ASC").Find(&rows).Error
	return rows, err
}

// MarkMaterialized 更新 cwd 副本状态。at=nil 表示「cwd 里已经没有这份文件了」
// (被驱逐 / 被 GC / 推送失败),字节仍在 MinIO,下次用到时重建。
func (r *Repository) MarkMaterialized(id uint64, at *time.Time) error {
	return r.db.Model(&Attachment{}).Where("id = ?", id).
		Updates(map[string]any{"materialized_at": at}).Error
}

// SoftDelete 用户主动永久删除。软删而非硬删:取回端点要能回 410「该文件已被删除」——
// journal 里的 @"path" 是永久的,chip 永远还在,能给出语义化提示才不是「无解释的裂图」。
func (r *Repository) SoftDelete(id uint64, userID uint64) error {
	now := time.Now()
	return r.db.Model(&Attachment{}).
		Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, userID).
		Updates(map[string]any{"deleted_at": now}).Error
}

// DeleteBySession 硬删某会话全部附件行,返回被删的行供调用方做引用计数后删对象。
//
// 为什么删会话要连带删附件(而不是留成「我的文件」):会话是用户心智里的删除边界,
// 留下来会造成「我删了对话、数据却还在平台」的错觉。跨会话被引用的那份字节靠 refcount
// 保护 —— 别的会话的行还在,对象就不会被删。
func (r *Repository) DeleteBySession(sessionID string) ([]Attachment, error) {
	var rows []Attachment
	if err := r.db.Where("session_id = ?", sessionID).Find(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	if err := r.db.Where("session_id = ?", sessionID).Delete(&Attachment{}).Error; err != nil {
		return rows, err
	}
	return rows, nil
}

// GetByID 按行 id 取(文件管理 / 删除入口用)。越权一律 ErrNotFound。
func (r *Repository) GetByID(id uint64, userID uint64) (*Attachment, error) {
	var a Attachment
	err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// ListLiveByUser 列该用户全部未软删的附件行(「我的附件」/ 撞配额时的自救入口)。
//
// **大的排前面**:这个列表唯一的用途是腾空间,而 1 个 28MB 的 PDF 抵得上 300 张截图。
// 按时间排会让用户从最没用的一头开始删。
//
// 不做分页而是给个硬 limit:超过 500 项时列表被截断,顶部的「已用/上限」仍是全量真值,
// 于是「各项之和 = 已用」这条会不成立 —— 可接受,因为按大小降序时被截掉的一定是最小的那批,
// 用户想腾的空间在前几项里就够了。(真有人存了 500+ 个附件再补分页。)
func (r *Repository) ListLiveByUser(userID uint64, limit int) ([]Attachment, error) {
	if limit <= 0 {
		limit = 500
	}
	var rows []Attachment
	err := r.db.Where("user_id = ? AND deleted_at IS NULL", userID).
		Order("size_bytes DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

// LiveStorageKeys 从 keys 里筛出仍被未软删行引用的那些(孤儿 reaper 的判据)。
//
// 🔴 查询失败必须让调用方知道 —— reaper 拿不到答案时**一个都不能删**。
// 返回空集与「查询失败」在这里是两种完全不同的东西:前者意味着整批都是孤儿。
func (r *Repository) LiveStorageKeys(keys []string) ([]string, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	var found []string
	err := r.db.Model(&Attachment{}).
		Where("storage_key IN ? AND deleted_at IS NULL", keys).
		Distinct().Pluck("storage_key", &found).Error
	if err != nil {
		return nil, err
	}
	return found, nil
}

// ListLiveByUUID 列某 uuid 在该用户名下所有未软删的行(删除入口:要逐会话删 cwd 副本)。
func (r *Repository) ListLiveByUUID(uuid string, userID uint64) ([]Attachment, error) {
	var rows []Attachment
	err := r.db.Where("attachment_uuid = ? AND user_id = ? AND deleted_at IS NULL", uuid, userID).
		Order("id ASC").Find(&rows).Error
	return rows, err
}
