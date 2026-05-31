// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package feedback

import (
	"database/sql"
	"time"

	"gorm.io/gorm"
)

// Repository 反馈仓库
type Repository struct {
	db *gorm.DB
}

// NewRepository 创建反馈仓库
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Create 创建反馈
func (r *Repository) Create(feedback *Feedback) error {
	return r.db.Create(feedback).Error
}

// GetByID 根据ID获取反馈
func (r *Repository) GetByID(id uint) (*Feedback, error) {
	var feedback Feedback
	err := r.db.First(&feedback, id).Error
	if err != nil {
		return nil, err
	}
	return &feedback, nil
}

// Update 更新反馈
func (r *Repository) Update(feedback *Feedback) error {
	return r.db.Save(feedback).Error
}

// Delete 软删除反馈(填 deleted_at,30 天后由清理任务硬删)
func (r *Repository) Delete(id uint) error {
	return r.db.Model(&Feedback{}).Where("id = ?", id).
		Update("deleted_at", time.Now()).Error
}

// notDeletedScope 排除已软删反馈
func notDeletedScope(db *gorm.DB) *gorm.DB {
	return db.Where("deleted_at IS NULL")
}

// List 获取反馈列表(默认排除已软删)
func (r *Repository) List(req *FeedbackListRequest) (*FeedbackListResponse, error) {
	var feedbacks []Feedback
	var total int64

	query := r.db.Model(&Feedback{}).Scopes(notDeletedScope)

	// 状态筛选
	if req.Status != "" {
		query = query.Where("status = ?", req.Status)
	}

	// 分类筛选
	if req.Category != "" {
		query = query.Where("category = ?", req.Category)
	}

	// 邮箱筛选
	if req.Email != "" {
		query = query.Where("email LIKE ?", "%"+req.Email+"%")
	}

	// 关键词搜索（搜索内容和邮箱）
	if req.Keyword != "" {
		query = query.Where("content LIKE ? OR email LIKE ?", "%"+req.Keyword+"%", "%"+req.Keyword+"%")
	}

	// 日期范围筛选
	if req.StartDate != "" {
		query = query.Where("created_at >= ?", req.StartDate+" 00:00:00")
	}
	if req.EndDate != "" {
		query = query.Where("created_at <= ?", req.EndDate+" 23:59:59")
	}

	// 指派筛选
	if req.Unassigned {
		query = query.Where("assigned_to IS NULL")
	} else if req.AssignedTo != nil {
		query = query.Where("assigned_to = ?", *req.AssignedTo)
	}

	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	// 分页
	offset := (req.Page - 1) * req.PageSize
	// id DESC tiebreaker：避免同时间反馈在 OFFSET 分页中漏页/重复
	if err := query.Order("created_at DESC, id DESC").Offset(offset).Limit(req.PageSize).Find(&feedbacks).Error; err != nil {
		return nil, err
	}

	return &FeedbackListResponse{
		List:     feedbacks,
		Total:    total,
		Page:     req.Page,
		PageSize: req.PageSize,
	}, nil
}

// GetStats 获取反馈统计(排除已软删)
func (r *Repository) GetStats() (*FeedbackStats, error) {
	var stats FeedbackStats

	q := r.db.Model(&Feedback{}).Scopes(notDeletedScope)

	if err := q.Count(&stats.Total).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&Feedback{}).Scopes(notDeletedScope).Where("status = ?", StatusPending).Count(&stats.Pending).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&Feedback{}).Scopes(notDeletedScope).Where("status = ?", StatusProcessed).Count(&stats.Processed).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&Feedback{}).Scopes(notDeletedScope).Where("status = ?", StatusReplied).Count(&stats.Replied).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&Feedback{}).Scopes(notDeletedScope).Where("status = ?", StatusClosed).Count(&stats.Closed).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&Feedback{}).Scopes(notDeletedScope).
		Where("assigned_to IS NULL AND status IN ?", []FeedbackStatus{StatusPending, StatusProcessed}).
		Count(&stats.Unassigned).Error; err != nil {
		return nil, err
	}

	// 平均首响时长(分钟)
	var avg sql.NullFloat64
	r.db.Raw(`
		SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, first_response_at))
		FROM feedbacks
		WHERE deleted_at IS NULL AND first_response_at IS NOT NULL
	`).Scan(&avg)
	if avg.Valid {
		stats.AvgFirstResponseMinutes = avg.Float64
	}

	// 当前最久未响应反馈
	var oldestPendingMin sql.NullInt64
	r.db.Raw(`
		SELECT TIMESTAMPDIFF(MINUTE, MIN(created_at), NOW())
		FROM feedbacks
		WHERE deleted_at IS NULL AND first_response_at IS NULL
		  AND status IN ('pending','processed')
	`).Scan(&oldestPendingMin)
	if oldestPendingMin.Valid {
		stats.OldestPendingMinutes = oldestPendingMin.Int64
	}

	return &stats, nil
}

// UpdateAssignee 更新反馈指派
func (r *Repository) UpdateAssignee(id uint, assignedTo *uint) error {
	return r.db.Model(&Feedback{}).Where("id = ?", id).
		Update("assigned_to", assignedTo).Error
}

// UpdateInternalNotes 更新内部备注
func (r *Repository) UpdateInternalNotes(id uint, notes string) error {
	return r.db.Model(&Feedback{}).Where("id = ?", id).
		Update("internal_notes", notes).Error
}

// MarkFirstResponseIfNull 仅当 first_response_at 为 NULL 时才写入
func (r *Repository) MarkFirstResponseIfNull(id uint, t time.Time) error {
	return r.db.Exec(`UPDATE feedbacks SET first_response_at = ? WHERE id = ? AND first_response_at IS NULL`, t, id).Error
}

// UpdateStatus 更新反馈状态
func (r *Repository) UpdateStatus(id uint, status FeedbackStatus) error {
	return r.db.Model(&Feedback{}).Where("id = ?", id).Update("status", status).Error
}

// UpdateCategory 更新反馈分类
func (r *Repository) UpdateCategory(id uint, category string) error {
	return r.db.Model(&Feedback{}).Where("id = ?", id).Update("category", category).Error
}

// ========== 附件相关方法 ==========

// CreateAttachment 创建附件记录
func (r *Repository) CreateAttachment(attachment *FeedbackAttachment) error {
	return r.db.Create(attachment).Error
}

// GetAttachmentsByUploadKey 根据上传key获取附件列表
func (r *Repository) GetAttachmentsByUploadKey(uploadKey string) ([]FeedbackAttachment, error) {
	var attachments []FeedbackAttachment
	err := r.db.Where("upload_key = ?", uploadKey).Find(&attachments).Error
	return attachments, err
}

// GetAttachmentsByFeedbackID 根据反馈ID获取附件列表 (含 object_key, 用于下载/删除)。
// 文件本体走 MinIO, DB 全字段都是元数据, 没有 file_data BLOB 之类的大列了。
func (r *Repository) GetAttachmentsByFeedbackID(feedbackID uint) ([]FeedbackAttachment, error) {
	var attachments []FeedbackAttachment
	err := r.db.Where("feedback_id = ?", feedbackID).Find(&attachments).Error
	return attachments, err
}

// GetAttachmentByID 根据ID获取单个附件（包含文件数据）
func (r *Repository) GetAttachmentByID(id uint) (*FeedbackAttachment, error) {
	var attachment FeedbackAttachment
	err := r.db.First(&attachment, id).Error
	if err != nil {
		return nil, err
	}
	return &attachment, nil
}

// BindAttachmentsToFeedback 将附件绑定到反馈
func (r *Repository) BindAttachmentsToFeedback(uploadKey string, feedbackID uint) error {
	return r.db.Model(&FeedbackAttachment{}).
		Where("upload_key = ?", uploadKey).
		Updates(map[string]any{
			"feedback_id": feedbackID,
			"is_used":     true,
		}).Error
}

// DeleteOrphanAttachments 删除游离附件（未绑定反馈且创建超过指定时间的），返回删除数量
func (r *Repository) DeleteOrphanAttachments(olderThan string) (int64, error) {
	// 删除 feedback_id IS NULL 且创建时间超过指定时间的附件
	result := r.db.Where("feedback_id IS NULL AND created_at < ?", olderThan).Delete(&FeedbackAttachment{})
	return result.RowsAffected, result.Error
}

// DeleteExcessOrphanAttachments 删除超出限制的游离附件（保留最新的maxCount个）
func (r *Repository) DeleteExcessOrphanAttachments(maxCount int) (int64, error) {
	// 获取游离附件总数（feedback_id IS NULL）
	var totalCount int64
	if err := r.db.Model(&FeedbackAttachment{}).Where("feedback_id IS NULL").Count(&totalCount).Error; err != nil {
		return 0, err
	}

	// 如果未超过限制，不需要删除
	if totalCount <= int64(maxCount) {
		return 0, nil
	}

	// 计算需要删除的数量
	deleteCount := totalCount - int64(maxCount)

	// 获取需要删除的附件ID（最旧的）
	var idsToDelete []uint
	if err := r.db.Model(&FeedbackAttachment{}).
		Select("id").
		Where("feedback_id IS NULL").
		Order("created_at ASC").
		Limit(int(deleteCount)).
		Pluck("id", &idsToDelete).Error; err != nil {
		return 0, err
	}

	// 删除这些附件
	if len(idsToDelete) > 0 {
		result := r.db.Where("id IN ?", idsToDelete).Delete(&FeedbackAttachment{})
		return result.RowsAffected, result.Error
	}

	return 0, nil
}

// GetOrphanAttachmentStats 获取游离附件的统计信息
func (r *Repository) GetOrphanAttachmentStats() (count int64, totalSize int64, err error) {
	err = r.db.Model(&FeedbackAttachment{}).
		Where("feedback_id IS NULL").
		Count(&count).Error
	if err != nil {
		return
	}

	// 获取总大小
	var result struct {
		TotalSize int64
	}
	err = r.db.Model(&FeedbackAttachment{}).
		Select("COALESCE(SUM(file_size), 0) as total_size").
		Where("feedback_id IS NULL").
		Scan(&result).Error
	totalSize = result.TotalSize
	return
}

// GetDB 暴露 gorm 句柄 — 给 service 内部偶尔需要自己拼 query (如附件清理) 用。
func (r *Repository) GetDB() *gorm.DB {
	return r.db
}

// DeleteAttachmentsByFeedbackID 删除反馈相关的所有附件记录
func (r *Repository) DeleteAttachmentsByFeedbackID(feedbackID uint) ([]FeedbackAttachment, error) {
	var attachments []FeedbackAttachment
	// 先查询要删除的附件
	err := r.db.Where("feedback_id = ?", feedbackID).Find(&attachments).Error
	if err != nil {
		return nil, err
	}
	
	// 删除数据库记录
	if len(attachments) > 0 {
		err = r.db.Where("feedback_id = ?", feedbackID).Delete(&FeedbackAttachment{}).Error
	}
	
	return attachments, err
}

