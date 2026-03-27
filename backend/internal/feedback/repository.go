// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package feedback

import (
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

// Delete 删除反馈
func (r *Repository) Delete(id uint) error {
	return r.db.Delete(&Feedback{}, id).Error
}

// List 获取反馈列表
func (r *Repository) List(req *FeedbackListRequest) (*FeedbackListResponse, error) {
	var feedbacks []Feedback
	var total int64

	query := r.db.Model(&Feedback{})

	// 状态筛选
	if req.Status != "" {
		query = query.Where("status = ?", req.Status)
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

	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	// 分页
	offset := (req.Page - 1) * req.PageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(req.PageSize).Find(&feedbacks).Error; err != nil {
		return nil, err
	}

	return &FeedbackListResponse{
		List:     feedbacks,
		Total:    total,
		Page:     req.Page,
		PageSize: req.PageSize,
	}, nil
}

// GetStats 获取反馈统计
func (r *Repository) GetStats() (*FeedbackStats, error) {
	var stats FeedbackStats

	// 总数
	if err := r.db.Model(&Feedback{}).Count(&stats.Total).Error; err != nil {
		return nil, err
	}

	// 各状态数量
	if err := r.db.Model(&Feedback{}).Where("status = ?", StatusPending).Count(&stats.Pending).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&Feedback{}).Where("status = ?", StatusProcessed).Count(&stats.Processed).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&Feedback{}).Where("status = ?", StatusReplied).Count(&stats.Replied).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&Feedback{}).Where("status = ?", StatusClosed).Count(&stats.Closed).Error; err != nil {
		return nil, err
	}

	return &stats, nil
}

// UpdateStatus 更新反馈状态
func (r *Repository) UpdateStatus(id uint, status FeedbackStatus) error {
	return r.db.Model(&Feedback{}).Where("id = ?", id).Update("status", status).Error
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

// GetAttachmentsByFeedbackID 根据反馈ID获取附件列表（不包含文件数据）
func (r *Repository) GetAttachmentsByFeedbackID(feedbackID uint) ([]FeedbackAttachment, error) {
	var attachments []FeedbackAttachment
	// 不查询 file_data 字段以提高性能
	err := r.db.Select("id, upload_key, feedback_id, original_name, file_size, file_type, mime_type, is_used, created_at, updated_at").
		Where("feedback_id = ?", feedbackID).Find(&attachments).Error
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

