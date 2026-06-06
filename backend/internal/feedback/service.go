// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package feedback

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"
)

// ConfigService 配置服务接口（用于获取邮件配置）
type ConfigService interface {
	GetActiveEmailConfig() (*model.EmailConfig, error)
}

// UserRepository 用户仓库接口（用于查询用户信息）
type UserRepository interface {
	FindByID(id uint) (*UserInfo, error)
	FindByIDs(ids []uint) (map[uint]*UserInfo, error)
}

// UserInfo 用户信息（简化版，用于反馈显示）
type UserInfo struct {
	ID        uint    `json:"id"`
	Username  *string `json:"username"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	AvatarURL *string `json:"avatar_url"`
}

// Notifier 站内信通知接口（回复反馈时通知登录用户）。签名对齐 message.MessageServiceAdapter.SendToUser,
// bootstrap 直接把 message 的 adapter 注进来,无需新适配器。匿名反馈无 user_id → 不发站内信(只走邮件)。
type Notifier interface {
	SendToUser(userID uint, title, content string, category string, linkURL, linkText string) error
}

// Service 反馈服务
type Service struct {
	repo          *Repository
	configService ConfigService
	userRepo      UserRepository
	notifier      Notifier
}

// NewService 创建反馈服务
func NewService(repo *Repository) *Service {
	return &Service{
		repo: repo,
	}
}

// SetConfigService 设置配置服务（用于依赖注入）
func (s *Service) SetConfigService(configService ConfigService) {
	s.configService = configService
}

// SetUserRepository 设置用户仓库（用于依赖注入）
func (s *Service) SetUserRepository(userRepo UserRepository) {
	s.userRepo = userRepo
}

// SetNotifier 设置站内信通知器（回复反馈时给登录用户发站内信;允许 nil = 不发）。
func (s *Service) SetNotifier(n Notifier) {
	s.notifier = n
}

// CreateFeedback 创建反馈
func (s *Service) CreateFeedback(req *CreateFeedbackRequest, userID *uint, username, ip string, attachments []Attachment) (*Feedback, error) {
	// 序列化附件
	attachmentsJSON := ""
	if len(attachments) > 0 {
		data, err := json.Marshal(attachments)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize attachments: %v", err)
		}
		attachmentsJSON = string(data)
	}

	// 获取IP归属地
	ipLocation := ""
	if ip != "" {
		loc := utils.ParseIPLocation(ip)
		if loc != nil {
			ipLocation = utils.GetSimpleLocationString(loc)
		}
	}

	feedback := &Feedback{
		Email:       req.Email,
		Content:     req.Content,
		Attachments: attachmentsJSON,
		UserID:      userID,
		Username:    username,
		IP:          ip,
		IPLocation:  ipLocation,
		Status:      StatusPending,
	}

	if err := s.repo.Create(feedback); err != nil {
		return nil, err
	}

	return feedback, nil
}

// GetFeedback 获取反馈详情
func (s *Service) GetFeedback(id uint) (*Feedback, error) {
	feedback, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	// 填充附件信息到 Attachments 字段（JSON格式）
	attachments, _ := s.GetAttachments(feedback)
	if len(attachments) > 0 {
		data, _ := json.Marshal(attachments)
		feedback.Attachments = string(data)
	}

	// 如果有 user_id，查询用户信息填充 username
	if feedback.UserID != nil && s.userRepo != nil {
		if userInfo, err := s.userRepo.FindByID(*feedback.UserID); err == nil && userInfo != nil {
			if userInfo.Username != nil && *userInfo.Username != "" {
				feedback.Username = *userInfo.Username
			}
		}
	}

	// 填充指派人姓名
	if feedback.AssignedTo != nil && s.userRepo != nil {
		if userInfo, err := s.userRepo.FindByID(*feedback.AssignedTo); err == nil && userInfo != nil {
			if userInfo.Username != nil && *userInfo.Username != "" {
				feedback.AssigneeName = *userInfo.Username
			} else if userInfo.Email != nil {
				feedback.AssigneeName = *userInfo.Email
			}
		}
	}

	return feedback, nil
}

// ListFeedbacks 获取反馈列表
func (s *Service) ListFeedbacks(req *FeedbackListRequest) (*FeedbackListResponse, error) {
	// 设置默认值
	if req.Page <= 0 {
		req.Page = 1
	}
	if req.PageSize <= 0 {
		req.PageSize = 20
	}
	result, err := s.repo.List(req)
	if err != nil {
		return nil, err
	}

	// 收集所有需要查询的 user_id (包含反馈者 + 被指派的管理员)
	userIDSet := make(map[uint]struct{})
	for _, fb := range result.List {
		if fb.UserID != nil {
			userIDSet[*fb.UserID] = struct{}{}
		}
		if fb.AssignedTo != nil {
			userIDSet[*fb.AssignedTo] = struct{}{}
		}
	}
	userIDs := make([]uint, 0, len(userIDSet))
	for uid := range userIDSet {
		userIDs = append(userIDs, uid)
	}

	// 批量查询用户信息
	var userMap map[uint]*UserInfo
	if len(userIDs) > 0 && s.userRepo != nil {
		userMap, _ = s.userRepo.FindByIDs(userIDs)
	}

	// 为每个反馈填充附件信息和用户信息
	for i := range result.List {
		// 填充附件
		attachments, _ := s.GetAttachments(&result.List[i])
		if len(attachments) > 0 {
			data, _ := json.Marshal(attachments)
			result.List[i].Attachments = string(data)
		}

		// 填充用户名（如果 username 为空但有 user_id）
		if result.List[i].UserID != nil && userMap != nil {
			if userInfo, ok := userMap[*result.List[i].UserID]; ok && userInfo != nil {
				if userInfo.Username != nil && *userInfo.Username != "" {
					result.List[i].Username = *userInfo.Username
				}
			}
		}

		// 填充指派人姓名
		if result.List[i].AssignedTo != nil && userMap != nil {
			if userInfo, ok := userMap[*result.List[i].AssignedTo]; ok && userInfo != nil {
				if userInfo.Username != nil && *userInfo.Username != "" {
					result.List[i].AssigneeName = *userInfo.Username
				} else if userInfo.Email != nil {
					result.List[i].AssigneeName = *userInfo.Email
				}
			}
		}
	}

	return result, nil
}

// GetStats 获取反馈统计
func (s *Service) GetStats() (*FeedbackStats, error) {
	return s.repo.GetStats()
}

// UpdateStatus 更新反馈状态
func (s *Service) UpdateStatus(id uint, status FeedbackStatus) error {
	return s.repo.UpdateStatus(id, status)
}

// UpdateCategory 更新反馈分类(白名单校验)
func (s *Service) UpdateCategory(id uint, category string) error {
	allowed := map[string]bool{
		CategoryBug: true, CategoryFeature: true, CategoryComplaint: true,
		CategoryPraise: true, CategoryOther: true,
	}
	if !allowed[category] {
		category = CategoryOther
	}
	return s.repo.UpdateCategory(id, category)
}

// ReplyFeedback 回复反馈
func (s *Service) ReplyFeedback(id uint, replyContent, repliedBy string) error {
	feedback, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}

	// 更新反馈信息
	now := time.Now()
	feedback.ReplyContent = replyContent
	feedback.RepliedAt = &now
	feedback.RepliedBy = repliedBy
	feedback.Status = StatusReplied
	if feedback.FirstResponseAt == nil {
		feedback.FirstResponseAt = &now
	}

	if err := s.repo.Update(feedback); err != nil {
		return err
	}

	// 站内信通知:登录用户(有 user_id)才发 —— 可靠、不依赖 SMTP;匿名反馈无账号,只能走下面的邮件。
	// best-effort:失败只记日志,不影响回复主流程(回复已落库)。
	if feedback.UserID != nil && *feedback.UserID != 0 && s.notifier != nil {
		title := "您的反馈已收到回复"
		content := "您之前提交的反馈已由客服回复:\n\n" + replyContent
		if err := s.notifier.SendToUser(*feedback.UserID, title, content, "system", "", ""); err != nil {
			slog.Error("failed to send in-app feedback reply notification", "feedback_id", id, "user_id", *feedback.UserID, "err", err)
		} else {
			slog.Info("in-app feedback reply notification sent", "feedback_id", id, "user_id", *feedback.UserID)
		}
	}

	// 发送回复邮件
	slog.Info("starting email send process for feedback reply", "feedback_id", id, "to", feedback.Email)

	if s.configService != nil {
		slog.Debug("config service available, getting email config")
		emailConfig, err := s.configService.GetActiveEmailConfig()
		if err != nil {
			slog.Error("failed to get email config", "err", err)
		} else if emailConfig == nil {
			slog.Warn("email config is nil (not configured)")
		} else {
			slog.Info("email config loaded", "host", emailConfig.SMTPHost, "port", emailConfig.SMTPPort, "from", emailConfig.FromEmail)

			subject := "您的反馈已收到回复 - Scholay"
			body := s.buildReplyEmailBody(feedback, replyContent)

			config := utils.EmailConfig{
				SMTPHost:     emailConfig.SMTPHost,
				SMTPPort:     emailConfig.SMTPPort,
				SMTPUser:     emailConfig.SMTPUser,
				SMTPPassword: emailConfig.SMTPPassword,
				FromEmail:    emailConfig.FromEmail,
				FromName:     emailConfig.FromName,
			}

			slog.Info("sending reply email", "to", feedback.Email)
			if err := utils.SendEmailWithTLS(config, []string{feedback.Email}, subject, body); err != nil {
				slog.Error("failed to send reply email", "to", feedback.Email, "err", err)
			} else {
				slog.Info("reply email sent successfully", "to", feedback.Email, "feedback_id", id)
			}
		}
	} else {
		slog.Warn("config service not set, skipping reply email", "feedback_id", id)
	}

	return nil
}

// buildReplyEmailBody 构建回复邮件内容
func (s *Service) buildReplyEmailBody(feedback *Feedback, replyContent string) string {
	return fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10a37f, #0d8a6a); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
        .original { background: #fff; padding: 15px; border-left: 4px solid #10a37f; margin: 15px 0; }
        .reply { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin: 0;">您的反馈已收到回复</h2>
        </div>
        <div class="content">
            <p>您好，</p>
            <p>感谢您的反馈，我们已经处理了您的问题。以下是我们的回复：</p>
            
            <h4>您的原始反馈：</h4>
            <div class="original">
                %s
            </div>
            
            <h4>我们的回复：</h4>
            <div class="reply">
                %s
            </div>
            
            <p>如果您还有其他问题，欢迎继续向我们反馈。</p>
            
            <div class="footer">
                <p>此邮件由系统自动发送，请勿直接回复。</p>
                <p>© Scholay - 智能学术检索平台</p>
            </div>
        </div>
    </div>
</body>
</html>
`, feedback.Content, replyContent)
}

// DeleteFeedback 删除反馈
func (s *Service) DeleteFeedback(id uint) error {
	return s.repo.Delete(id)
}

// AssignFeedback 指派反馈给某管理员(传 nil 表示取消指派),
// 同时若该反馈尚未首次响应,标记为已响应(指派算一次内部处理动作)
func (s *Service) AssignFeedback(id uint, assignedTo *uint) error {
	if err := s.repo.UpdateAssignee(id, assignedTo); err != nil {
		return err
	}
	if assignedTo != nil {
		_ = s.repo.MarkFirstResponseIfNull(id, time.Now())
	}
	return nil
}

// UpdateInternalNotes 更新内部备注
func (s *Service) UpdateInternalNotes(id uint, notes string) error {
	if err := s.repo.UpdateInternalNotes(id, notes); err != nil {
		return err
	}
	// 写备注也算一次内部响应
	_ = s.repo.MarkFirstResponseIfNull(id, time.Now())
	return nil
}

// GetAttachments 获取附件列表（优先从数据库获取，兼容旧的JSON格式）
func (s *Service) GetAttachments(feedback *Feedback) ([]Attachment, error) {
	// 优先从数据库获取附件
	dbAttachments, err := s.repo.GetAttachmentsByFeedbackID(feedback.ID)
	if err == nil && len(dbAttachments) > 0 {
		attachments := make([]Attachment, len(dbAttachments))
		for i, att := range dbAttachments {
			attachments[i] = att.ToAttachment()
		}
		return attachments, nil
	}

	// 兼容旧数据：从JSON字段解析
	if feedback.Attachments == "" {
		return []Attachment{}, nil
	}
	var attachments []Attachment
	if err := json.Unmarshal([]byte(feedback.Attachments), &attachments); err != nil {
		return nil, err
	}
	return attachments, nil
}

// ========== 附件相关方法 (走 MinIO) ==========

// UploadAttachment 把单个上传文件流式 PUT 到 MinIO + 写一条 DB 记录, 返回完整附件元数据。
//
// object_key 命名: tmp/<uploadKey>/<random>.<ext> —— tmp/ 前缀让 MinIO ILM 24h
// 自动清理"上传后用户没提交反馈"产生的孤儿对象 (storage.ensureTmpLifecycle 已挂规则)。
// 真正提交反馈时 BindAttachmentsToFeedback 会把 is_used 置 true (object_key 不动,
// 仍是 tmp/<...> —— ILM 也只清未在 DB 关联的, 不影响)。
func (s *Service) UploadAttachment(
	ctx context.Context,
	uploadKey, originalName, mimeType, fileType string,
	body io.Reader, size int64,
) (*FeedbackAttachment, error) {
	bucket := storage.FeedbackAttachmentBucket()
	if bucket == "" {
		return nil, fmt.Errorf("feedback storage not configured")
	}

	ext := strings.ToLower(filepath.Ext(originalName))
	objectID := uuid.New().String()
	objectKey := fmt.Sprintf("tmp/%s/%s%s", uploadKey, objectID, ext)

	if _, err := storage.PutObject(ctx, bucket, objectKey, body, size, storage.PutOptions{
		ContentType: mimeType,
		UserMeta: map[string]string{
			"original-name": originalName,
		},
	}); err != nil {
		return nil, fmt.Errorf("upload to storage: %w", err)
	}

	att := &FeedbackAttachment{
		UploadKey:    uploadKey,
		OriginalName: originalName,
		ObjectKey:    objectKey,
		FileSize:     size,
		FileType:     fileType,
		MimeType:     mimeType,
		IsUsed:       false,
	}
	if err := s.repo.CreateAttachment(att); err != nil {
		// DB 写失败 — 回滚: 把 MinIO 里的对象也删了, 避免永久孤儿。
		// 失败仅 log, lifecycle 兜底 24h 清理。
		if delErr := storage.DeleteObject(ctx, bucket, objectKey); delErr != nil {
			slog.Warn("feedback: rollback minio object failed",
				"object_key", objectKey, "err", delErr)
		}
		return nil, fmt.Errorf("save attachment row: %w", err)
	}
	return att, nil
}

// OpenAttachment 从 MinIO 流式打开附件 — caller 负责 Close 第一个返回值。
func (s *Service) OpenAttachment(ctx context.Context, id uint) (io.ReadCloser, *FeedbackAttachment, error) {
	att, err := s.repo.GetAttachmentByID(id)
	if err != nil {
		return nil, nil, err
	}
	if att.ObjectKey == "" {
		return nil, att, fmt.Errorf("attachment %d has no object_key (legacy data, please re-upload)", id)
	}
	bucket := storage.FeedbackAttachmentBucket()
	rc, _, err := storage.GetObject(ctx, bucket, att.ObjectKey)
	if err != nil {
		return nil, att, fmt.Errorf("open from storage: %w", err)
	}
	return rc, att, nil
}

// GetAttachmentsByUploadKey 拿同一上传批次的全部附件 (DB 元数据, 不读 MinIO)。
func (s *Service) GetAttachmentsByUploadKey(uploadKey string) ([]FeedbackAttachment, error) {
	return s.repo.GetAttachmentsByUploadKey(uploadKey)
}

// GetAttachmentByID 仅取 DB 元数据 (不读 MinIO body); 想拿文件流走 OpenAttachment。
func (s *Service) GetAttachmentByID(id uint) (*FeedbackAttachment, error) {
	return s.repo.GetAttachmentByID(id)
}

// CreateFeedbackWithAttachments 创建反馈并关联附件
// category 可为空字符串，留给 GORM 用列默认值 "other"。
func (s *Service) CreateFeedbackWithAttachments(email, content *string, category string, userID *uint, username, ip, attachmentsKey string) (*Feedback, error) {
	// 获取IP归属地
	ipLocation := ""
	if ip != "" {
		loc := utils.ParseIPLocation(ip)
		if loc != nil {
			ipLocation = utils.GetSimpleLocationString(loc)
		}
	}

	feedback := &Feedback{
		Email:      *email,
		Content:    *content,
		Category:   category, // 空字符串 → GORM 列默认 "other"
		UserID:     userID,
		Username:   username,
		IP:         ip,
		IPLocation: ipLocation,
		Status:     StatusPending,
	}

	// 创建反馈
	if err := s.repo.Create(feedback); err != nil {
		return nil, err
	}

	// 如果有附件key，绑定附件到反馈
	if attachmentsKey != "" {
		if err := s.repo.BindAttachmentsToFeedback(attachmentsKey, feedback.ID); err != nil {
			slog.Error("failed to bind attachments to feedback", "feedback_id", feedback.ID, "err", err)
		}
	}

	return feedback, nil
}

// CleanupOrphanAttachments 清理游离附件 — 未绑定反馈、创建超过 olderThan 时间。
// 先拿 object_key 列表, 删 MinIO 对象, 再删 DB 行。返回删除条数。
func (s *Service) CleanupOrphanAttachments(olderThan string) (int64, error) {
	// 先查出待删的对象 keys (DB 删除后 row 没了, 拿不到 object_key)
	var orphans []FeedbackAttachment
	if err := s.repo.GetDB().
		Where("feedback_id IS NULL AND created_at < ?", olderThan).
		Find(&orphans).Error; err != nil {
		return 0, err
	}
	if len(orphans) == 0 {
		return 0, nil
	}
	s.deleteAttachmentObjects(orphans)
	return s.repo.DeleteOrphanAttachments(olderThan)
}

// CleanupExcessOrphanAttachments 保留最新 maxCount 个游离附件, 多余的清掉 (MinIO + DB)。
func (s *Service) CleanupExcessOrphanAttachments(maxCount int) (int64, error) {
	// 复用 repo 现有逻辑前先拿到 object_keys
	var totalCount int64
	if err := s.repo.GetDB().Model(&FeedbackAttachment{}).
		Where("feedback_id IS NULL").Count(&totalCount).Error; err != nil {
		return 0, err
	}
	if totalCount <= int64(maxCount) {
		return 0, nil
	}
	deleteCount := totalCount - int64(maxCount)

	var excess []FeedbackAttachment
	if err := s.repo.GetDB().
		Where("feedback_id IS NULL").
		Order("created_at ASC").
		Limit(int(deleteCount)).
		Find(&excess).Error; err != nil {
		return 0, err
	}
	if len(excess) == 0 {
		return 0, nil
	}
	s.deleteAttachmentObjects(excess)
	return s.repo.DeleteExcessOrphanAttachments(maxCount)
}

// GetOrphanAttachmentStats 获取游离附件的统计信息
func (s *Service) GetOrphanAttachmentStats() (count int64, totalSize int64, err error) {
	return s.repo.GetOrphanAttachmentStats()
}

// DeleteFeedbackWithAttachments 删反馈 + 关联附件 (MinIO 对象 + DB 行)。
func (s *Service) DeleteFeedbackWithAttachments(id uint) ([]FeedbackAttachment, error) {
	attachments, err := s.repo.DeleteAttachmentsByFeedbackID(id)
	if err != nil {
		return nil, err
	}
	s.deleteAttachmentObjects(attachments)

	if err := s.repo.Delete(id); err != nil {
		return nil, err
	}
	return attachments, nil
}

// deleteAttachmentObjects 批量删 MinIO 对象。失败只 log, DB 已经/会清, 残留对象由 ILM 兜底。
func (s *Service) deleteAttachmentObjects(atts []FeedbackAttachment) {
	bucket := storage.FeedbackAttachmentBucket()
	if bucket == "" {
		return
	}
	keys := make([]string, 0, len(atts))
	for _, a := range atts {
		if a.ObjectKey != "" {
			keys = append(keys, a.ObjectKey)
		}
	}
	if len(keys) == 0 {
		return
	}
	ctx, cancel := ctxutil.With(ctxutil.NormalIO)
	defer cancel()
	_ = storage.DeleteObjects(ctx, bucket, keys, func(key string, err error) {
		slog.Warn("feedback: delete minio object failed",
			"bucket", bucket, "key", key, "err", err)
	})
}

