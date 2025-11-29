package feedback

import (
	"encoding/json"
	"fmt"
	"time"

	"scholar-backend/internal/common/utils"
)

// Service 反馈服务
type Service struct {
	repo        *Repository
	emailSender EmailSender
}

// EmailSender 邮件发送接口
type EmailSender interface {
	SendEmail(to, subject, body string) error
}

// NewService 创建反馈服务
func NewService(repo *Repository, emailSender EmailSender) *Service {
	return &Service{
		repo:        repo,
		emailSender: emailSender,
	}
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

	// 为每个反馈填充附件信息到 Attachments 字段（JSON格式）
	for i := range result.List {
		attachments, _ := s.GetAttachments(&result.List[i])
		if len(attachments) > 0 {
			data, _ := json.Marshal(attachments)
			result.List[i].Attachments = string(data)
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

	if err := s.repo.Update(feedback); err != nil {
		return err
	}

	// 发送回复邮件
	if s.emailSender != nil {
		subject := "您的反馈已收到回复 - Scholar"
		body := s.buildReplyEmailBody(feedback, replyContent)
		if err := s.emailSender.SendEmail(feedback.Email, subject, body); err != nil {
			// 记录错误但不影响主流程
			fmt.Printf("Failed to send reply email to %s: %v\n", feedback.Email, err)
		}
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
                <p>© Scholar - 智能学术检索平台</p>
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

// ========== 附件相关方法 ==========

// SaveAttachment 保存附件记录到数据库
func (s *Service) SaveAttachment(attachment *FeedbackAttachment) error {
	return s.repo.CreateAttachment(attachment)
}

// GetAttachmentsByUploadKey 根据上传key获取附件列表
func (s *Service) GetAttachmentsByUploadKey(uploadKey string) ([]FeedbackAttachment, error) {
	return s.repo.GetAttachmentsByUploadKey(uploadKey)
}

// GetAttachmentByID 根据ID获取单个附件（包含文件数据）
func (s *Service) GetAttachmentByID(id uint) (*FeedbackAttachment, error) {
	return s.repo.GetAttachmentByID(id)
}

// CreateFeedbackWithAttachments 创建反馈并关联附件
func (s *Service) CreateFeedbackWithAttachments(email, content *string, userID *uint, username, ip, attachmentsKey string) (*Feedback, error) {
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
			// 记录错误但不影响主流程
			fmt.Printf("Failed to bind attachments to feedback %d: %v\n", feedback.ID, err)
		}
	}

	return feedback, nil
}

// CleanupOrphanAttachments 清理游离附件（未绑定反馈的过期附件），返回删除数量
func (s *Service) CleanupOrphanAttachments(olderThan string) (int64, error) {
	return s.repo.DeleteOrphanAttachments(olderThan)
}

// CleanupExcessOrphanAttachments 清理超出限制的游离附件（保留最新的maxCount个）
func (s *Service) CleanupExcessOrphanAttachments(maxCount int) (int64, error) {
	return s.repo.DeleteExcessOrphanAttachments(maxCount)
}

// GetOrphanAttachmentStats 获取游离附件的统计信息
func (s *Service) GetOrphanAttachmentStats() (count int64, totalSize int64, err error) {
	return s.repo.GetOrphanAttachmentStats()
}

// DeleteFeedbackWithAttachments 删除反馈及其附件
func (s *Service) DeleteFeedbackWithAttachments(id uint) ([]FeedbackAttachment, error) {
	// 先获取附件列表
	attachments, err := s.repo.DeleteAttachmentsByFeedbackID(id)
	if err != nil {
		return nil, err
	}

	// 删除反馈（附件会级联删除）
	if err := s.repo.Delete(id); err != nil {
		return nil, err
	}

	return attachments, nil
}

