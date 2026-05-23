// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// peerreview2/service.go —— 业务编排:幂等创建会话、远端代理、匿名试用配额、推荐结论解析。

package peerreview2

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Service 审稿 V2 业务层
type Service struct {
	repo   *Repository
	client *Client
}

func NewService(repo *Repository, client *Client) *Service {
	return &Service{repo: repo, client: client}
}

// IsConfigured 远端 API key 是否就绪;未配置时所有写接口直接 503。
func (s *Service) IsConfigured() bool {
	return s.client != nil && s.client.IsConfigured()
}

// ErrNotConfigured key 未配置
var ErrNotConfigured = errors.New("peer-review API 未配置 PEER_REVIEW_API_KEY")

// ErrAccessDenied 用户访问了非自己的会话
var ErrAccessDenied = errors.New("无权访问该会话")

// ErrAnonTrialExhausted 匿名试用今日已用完
var ErrAnonTrialExhausted = errors.New("今日匿名试用已使用,请登录后继续")

// CreateConversationParams 创建会话入参
type CreateConversationParams struct {
	UserID    *uint  // nil 表示匿名
	AnonToken string // 匿名时的现有令牌(可空,首次创建会下发)
	DeviceID  string
	IPUAHash  string
	Filename  string
	Title     string
	PDFBytes  []byte // 已读入内存的 PDF 字节(用于做内容哈希 + 上传)
}

// CreateConversationByPDF 上传 PDF 创建会话(同步等待远端 201/200)。
//
// 流程:
//  1. 匿名用户:校验今日试用配额(1 次/设备)。
//  2. 生成 client_request_id = pr2:{userScope}:{sha256(pdf)[:32]} 用于远端幂等。
//  3. 本地查表:若同 user/anon_token + client_request_id 已存在,直接返回(本地幂等)。
//  4. POST 到远端,201=新建 / 200=幂等命中。
//  5. 本地写一行 pr2_conversations 映射,匿名同时写一行 pr2_anon_trials 试用消费。
func (s *Service) CreateConversationByPDF(ctx context.Context, p *CreateConversationParams) (*PeerReview2Conversation, *CreateConversationResponse, error) {
	if !s.IsConfigured() {
		return nil, nil, ErrNotConfigured
	}
	if len(p.PDFBytes) == 0 {
		return nil, nil, errors.New("PDF 内容为空")
	}

	isAnon := p.UserID == nil
	trialDay := time.Now().Format("2006-01-02")
	if isAnon {
		if p.DeviceID == "" {
			return nil, nil, errors.New("匿名请求缺少设备识别")
		}
		// 匿名首次上传需要先生成 token,后面才能用它构造幂等 scope
		if p.AnonToken == "" {
			p.AnonToken = generateAnonToken()
		}
	}

	// 幂等键:稳定锚定到内容哈希 + 稳定主体身份
	// (登录用户用 user_id;匿名用 device_id,因为 anon_token 在前端可能丢失而重新生成)
	contentHash := hashPDFContent(p.PDFBytes)
	var scope string
	if isAnon {
		scope = "dev:" + p.DeviceID[:min(16, len(p.DeviceID))]
	} else {
		scope = fmt.Sprintf("u%d", *p.UserID)
	}
	clientRequestID := "scholar-pr2:" + scope + ":" + contentHash
	if len(clientRequestID) > 128 {
		clientRequestID = clientRequestID[:128]
	}

	// 本地幂等优先:同 PDF 同主体的请求直接命中本地表,不消耗匿名试用
	if existing, err := s.repo.FindByClientRequestID(p.UserID, p.DeviceID, clientRequestID); err == nil {
		// 命中时把已存在的 anon_token 回传给 caller,前端可继续用同一个会话归属
		anonTokenOut := p.AnonToken
		if isAnon && existing.AnonToken != "" {
			anonTokenOut = existing.AnonToken
		}
		return existing, &CreateConversationResponse{
			ID:                   existing.ID,
			RemoteConversationID: existing.RemoteConversationID,
			Title:                existing.Title,
			PaperFilename:        existing.PaperFilename,
			Status:               existing.Status,
			AnonToken:            anonTokenOut,
			IsIdempotent:         true,
			CreatedAt:            existing.CreatedAt,
		}, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, fmt.Errorf("查询本地幂等记录: %w", err)
	}

	// 真·新审稿前再做匿名配额检查
	if isAnon {
		canTrial, _, err := s.repo.CheckAnonTrialQuota(p.DeviceID, p.IPUAHash, trialDay)
		if err != nil {
			return nil, nil, fmt.Errorf("查询试用配额: %w", err)
		}
		if !canTrial {
			return nil, nil, ErrAnonTrialExhausted
		}
	}

	// 调远端
	pdfReader := newBytesReader(p.PDFBytes)
	remoteRes, err := s.client.CreateConversationByPDF(ctx, p.Filename, pdfReader, p.Title, clientRequestID)
	if err != nil {
		return nil, nil, fmt.Errorf("调用远端创建会话: %w", err)
	}

	// 远端 200=幂等命中(我们之前没存,但远端有);也写本地映射
	conv := &PeerReview2Conversation{
		UserID:               p.UserID,
		AnonToken:            p.AnonToken,
		DeviceID:             p.DeviceID,
		RemoteConversationID: remoteRes.ID,
		RemoteThreadID:       remoteRes.CursorThreadID,
		ClientRequestID:      clientRequestID,
		PaperFilename:        firstNonEmpty(remoteRes.PaperFilename, p.Filename),
		Title:                firstNonEmpty(remoteRes.Title, p.Title),
		Status:               remoteRes.Status,
	}
	if err := s.repo.CreateConversation(conv); err != nil {
		// 并发场景:可能两个请求同时打,远端幂等返回同一个 remote_conversation_id,
		// 本地唯一索引会冲突。退而求其次:再查一次本地。
		if existing, qerr := s.repo.FindByRemoteID(remoteRes.ID); qerr == nil {
			conv = existing
		} else {
			return nil, nil, fmt.Errorf("写入本地映射: %w", err)
		}
	}

	// 匿名:消费试用额度(失败不影响主流程,记 warn)
	if isAnon {
		trial := &PeerReview2AnonTrial{
			DeviceID:       p.DeviceID,
			IPUAHash:       p.IPUAHash,
			TrialDay:       trialDay,
			AnonToken:      p.AnonToken,
			ConversationID: conv.ID,
			ConsumedAt:     time.Now(),
		}
		if err := s.repo.ConsumeAnonTrial(trial); err != nil {
			slog.Warn("pr2 consume anon trial failed", "err", err, "device_id", p.DeviceID)
		}
	}

	resp := &CreateConversationResponse{
		ID:                   conv.ID,
		RemoteConversationID: conv.RemoteConversationID,
		Title:                conv.Title,
		PaperFilename:        conv.PaperFilename,
		Status:               conv.Status,
		IsIdempotent:         remoteRes.IsIdempotent,
		CreatedAt:            conv.CreatedAt,
	}
	if isAnon {
		resp.AnonToken = p.AnonToken
	}
	return conv, resp, nil
}

// GetConversation 取本地映射并校验权属
func (s *Service) GetConversation(localID uint, userID *uint, anonToken string) (*PeerReview2Conversation, error) {
	conv, err := s.repo.FindByLocalID(localID)
	if err != nil {
		return nil, err
	}
	if !canAccess(conv, userID, anonToken) {
		return nil, ErrAccessDenied
	}
	return conv, nil
}

// ListConversations 登录用户分页 / 匿名按 token 列出
func (s *Service) ListConversations(userID *uint, anonToken string, page, pageSize int) (*ConversationListResponse, error) {
	var (
		items []PeerReview2Conversation
		total int64
		err   error
	)
	switch {
	case userID != nil:
		items, total, err = s.repo.ListByUser(*userID, page, pageSize)
	case anonToken != "":
		items, total, err = s.repo.ListByAnonToken(anonToken)
	default:
		return &ConversationListResponse{Items: []ConversationSummary{}, Page: 1, PageSize: pageSize, TotalPages: 0}, nil
	}
	if err != nil {
		return nil, err
	}

	summaries := make([]ConversationSummary, 0, len(items))
	for _, c := range items {
		summaries = append(summaries, ConversationSummary{
			ID:                  c.ID,
			Title:               c.Title,
			PaperFilename:       c.PaperFilename,
			Status:              c.Status,
			FinalRecommendation: c.FinalRecommendation,
			FinalChars:          c.FinalChars,
			CreatedAt:           c.CreatedAt,
			UpdatedAt:           c.UpdatedAt,
		})
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	totalPages := int(total / int64(pageSize))
	if total%int64(pageSize) != 0 {
		totalPages++
	}
	if page < 1 {
		page = 1
	}
	return &ConversationListResponse{
		Items:      summaries,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}

// SyncStatus 拉远端最新 status 写本地(详情接口、SSE 结束后会触发)。
// 同时尝试解析最新 assistant 消息的推荐结论。
func (s *Service) SyncStatus(ctx context.Context, conv *PeerReview2Conversation) error {
	remote, err := s.client.GetConversation(ctx, conv.RemoteConversationID)
	if err != nil {
		return err
	}
	threadID := ""
	if remote.CursorThreadID != nil {
		threadID = *remote.CursorThreadID
	}
	if threadID != "" && threadID != conv.RemoteThreadID {
		_ = s.repo.UpdateThreadID(conv.ID, threadID)
		conv.RemoteThreadID = threadID
	}

	// 仅在状态变化时尝试解析推荐结论(避免每次列表请求都拉 messages)
	if remote.Status == StatusIdle && conv.FinalRecommendation == "" {
		msgs, mErr := s.client.ListMessages(ctx, conv.RemoteConversationID)
		if mErr == nil {
			rec, chars := extractRecommendation(msgs)
			_ = s.repo.UpdateStatus(conv.ID, remote.Status, rec, chars)
			conv.Status = remote.Status
			conv.FinalRecommendation = rec
			conv.FinalChars = chars
			return nil
		}
	}
	if remote.Status != conv.Status {
		_ = s.repo.UpdateStatus(conv.ID, remote.Status, "", 0)
		conv.Status = remote.Status
	}
	return nil
}

// MarkStatus 直接写本地状态(SSE 终态事件后调用,避免再回拉远端)
func (s *Service) MarkStatus(localID uint, status string) {
	_ = s.repo.UpdateStatus(localID, status, "", 0)
}

// DeleteConversation 同步删本地+远端
func (s *Service) DeleteConversation(ctx context.Context, conv *PeerReview2Conversation) error {
	// 远端先删,失败不阻塞本地(用户视角已"消失",远端 GC 兜底)
	if err := s.client.DeleteConversation(ctx, conv.RemoteConversationID); err != nil {
		slog.Warn("pr2 delete remote failed (continuing with local)",
			"err", err, "remote_id", conv.RemoteConversationID)
	}
	return s.repo.Delete(conv.ID)
}

// ClaimAllByAnonToken 登录后批量认领(委托 repo)
func (s *Service) ClaimAllByAnonToken(userID uint, anonToken string) ([]uint, error) {
	return s.repo.ClaimAllByAnonToken(userID, anonToken)
}

// TrialStatus 返回该设备/IP+UA 的今日匿名试用余额
func (s *Service) TrialStatus(deviceID, ipUAHash string) *TrialStatusResponse {
	day := time.Now().Format("2006-01-02")
	canTrial, existing, err := s.repo.CheckAnonTrialQuota(deviceID, ipUAHash, day)
	resp := &TrialStatusResponse{
		CanTrial: canTrial,
		TrialDay: day,
	}
	if err != nil {
		resp.CanTrial = false
		resp.Reason = "lookup_failed"
		return resp
	}
	if !canTrial && existing != nil {
		resp.ConsumedAt = &existing.ConsumedAt
		resp.Reason = "already_used"
	}
	return resp
}

// Client 暴露给 handler 透传 SSE / 调远端只读接口
func (s *Service) Client() *Client {
	return s.client
}

// ========== 内部辅助 ==========

func canAccess(conv *PeerReview2Conversation, userID *uint, anonToken string) bool {
	if userID != nil && conv.UserID != nil && *conv.UserID == *userID {
		return true
	}
	if userID == nil && anonToken != "" && conv.AnonToken == anonToken {
		return true
	}
	return false
}

// extractRecommendation 从 assistant 消息末尾解析 "## 推荐\n**Accept|Minor|Major|Reject**"
func extractRecommendation(msgs []MessageInfo) (recommendation string, chars int) {
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == "assistant" {
			content := msgs[i].Content
			chars = len([]rune(content))
			recommendation = parseRecommendationFromMarkdown(content)
			return
		}
	}
	return "", 0
}

var recommendRegex = regexp.MustCompile(`(?im)^##\s*推荐\b[\s\S]*?\*\*(Accept|Minor|Major|Reject)\b`)

func parseRecommendationFromMarkdown(content string) string {
	m := recommendRegex.FindStringSubmatch(content)
	if len(m) < 2 {
		// 退路:在末 1500 字符里找
		tail := content
		if len(tail) > 1500 {
			tail = tail[len(tail)-1500:]
		}
		for _, k := range []string{"Reject", "Major", "Minor", "Accept"} {
			if strings.Contains(tail, "**"+k) || strings.Contains(tail, k+"**") {
				return k
			}
		}
		return ""
	}
	return m[1]
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// bytesReader 对 []byte 的轻量包装(避免 import bytes 多带一份)
type bytesReader struct {
	data []byte
	pos  int
}

func newBytesReader(data []byte) io.Reader { return &bytesReader{data: data} }
func (r *bytesReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
