// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// peerreview2/handler.go —— REST + SSE 端点。所有写接口要求登录或匿名(带 device cookie)。

package peerreview2

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Handler HTTP 入口
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

const (
	// MaxUploadBytes 上限 20 MiB,与远端默认对齐(超出会被远端 413 拒绝,这里前置兜底)
	MaxUploadBytes = 20 * 1024 * 1024

	queryAnonToken = "anon_token"
)

// ========== 创建 / 列表 / 详情 / 删除 ==========

// CreateConversation POST /conversations
//
// multipart/form-data:
//   - file (PDF, required)
//   - title (optional)
func (h *Handler) CreateConversation(c *gin.Context) {
	if !h.svc.IsConfigured() {
		utils.Error(c, http.StatusServiceUnavailable, ErrNotConfigured.Error())
		return
	}

	// 限制 body 大小
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxUploadBytes+1024)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		utils.BadRequest(c, "缺少 file 字段或文件读取失败: "+err.Error())
		return
	}
	if fileHeader.Size > MaxUploadBytes {
		utils.Error(c, http.StatusRequestEntityTooLarge, "PDF 超过 20 MiB 上限")
		return
	}
	if !strings.EqualFold(getExt(fileHeader.Filename), "pdf") {
		utils.BadRequest(c, "只支持 PDF 文件")
		return
	}

	src, err := fileHeader.Open()
	if err != nil {
		utils.InternalServerError(c, "打开上传文件失败", err)
		return
	}
	defer src.Close()

	pdfBytes, err := io.ReadAll(io.LimitReader(src, MaxUploadBytes+1))
	if err != nil {
		utils.InternalServerError(c, "读取 PDF 失败", err)
		return
	}
	if int64(len(pdfBytes)) > MaxUploadBytes {
		utils.Error(c, http.StatusRequestEntityTooLarge, "PDF 超过 20 MiB 上限")
		return
	}

	userIDPtr := optionalUserID(c)
	anonToken := ""
	if userIDPtr == nil {
		// 匿名:取请求自带的 anon_token(若已有);否则 service 层会生成新 token 并下发
		anonToken = strings.TrimSpace(c.Query(queryAnonToken))
		if anonToken == "" {
			anonToken = strings.TrimSpace(c.PostForm("anon_token"))
		}
	}

	params := &CreateConversationParams{
		UserID:    userIDPtr,
		AnonToken: anonToken,
		DeviceID:  GetDeviceID(c),
		IPUAHash:  GetIPUAHash(c),
		Filename:  fileHeader.Filename,
		Title:     strings.TrimSpace(c.PostForm("title")),
		PDFBytes:  pdfBytes,
	}

	// 通过熔断器调用,远端长时间不稳时自动短路
	out, err := circuitbreaker.PeerReviewBreaker.Execute(func() (any, error) {
		_, resp, err := h.svc.CreateConversationByPDF(c.Request.Context(), params)
		return resp, err
	})
	if err != nil {
		mapAndRespondError(c, err)
		return
	}
	utils.Success(c, out)
}

// GetConversation GET /conversations/:id
func (h *Handler) GetConversation(c *gin.Context) {
	conv, ok := h.requireOwnedConversation(c)
	if !ok {
		return
	}
	// 同步远端状态(失败不阻塞响应)
	_ = h.svc.SyncStatus(c.Request.Context(), conv)
	utils.Success(c, &ConversationDetailResponse{
		ID:                   conv.ID,
		RemoteConversationID: conv.RemoteConversationID,
		Title:                conv.Title,
		PaperFilename:        conv.PaperFilename,
		Status:               conv.Status,
		FinalRecommendation:  conv.FinalRecommendation,
		FinalChars:           conv.FinalChars,
		RemoteThreadID:       conv.RemoteThreadID,
		CreatedAt:            conv.CreatedAt,
		UpdatedAt:            conv.UpdatedAt,
	})
}

// ListConversations GET /conversations
func (h *Handler) ListConversations(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	userIDPtr := optionalUserID(c)
	anonToken := strings.TrimSpace(c.Query(queryAnonToken))
	resp, err := h.svc.ListConversations(userIDPtr, anonToken, page, pageSize)
	if err != nil {
		utils.InternalServerError(c, "查询审稿列表失败", err)
		return
	}
	utils.Success(c, resp)
}

// DeleteConversation DELETE /conversations/:id
func (h *Handler) DeleteConversation(c *gin.Context) {
	conv, ok := h.requireOwnedConversation(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteConversation(c.Request.Context(), conv); err != nil {
		utils.InternalServerError(c, "删除审稿会话失败", err)
		return
	}
	utils.Success(c, gin.H{"deleted": true})
}

// ========== Turns / Messages / Follow-up ==========

// ListTurns GET /conversations/:id/turns
func (h *Handler) ListTurns(c *gin.Context) {
	conv, ok := h.requireOwnedConversation(c)
	if !ok {
		return
	}
	turns, err := h.svc.Client().ListTurns(c.Request.Context(), conv.RemoteConversationID)
	if err != nil {
		mapAndRespondError(c, err)
		return
	}
	utils.Success(c, turns)
}

// ListMessages GET /conversations/:id/messages
func (h *Handler) ListMessages(c *gin.Context) {
	conv, ok := h.requireOwnedConversation(c)
	if !ok {
		return
	}
	msgs, err := h.svc.Client().ListMessages(c.Request.Context(), conv.RemoteConversationID)
	if err != nil {
		mapAndRespondError(c, err)
		return
	}
	utils.Success(c, msgs)
}

// SendMessage POST /conversations/:id/messages
func (h *Handler) SendMessage(c *gin.Context) {
	conv, ok := h.requireOwnedConversation(c)
	if !ok {
		return
	}
	var req SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数无效: "+err.Error())
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		utils.BadRequest(c, "content 不能为空")
		return
	}
	out, err := circuitbreaker.PeerReviewBreaker.Execute(func() (any, error) {
		return h.svc.Client().SendMessage(c.Request.Context(), conv.RemoteConversationID, req.Content, req.ClientMsgID)
	})
	if err != nil {
		mapAndRespondError(c, err)
		return
	}
	utils.Success(c, out)
}

// PauseConversation POST /conversations/:id/pause
func (h *Handler) PauseConversation(c *gin.Context) {
	conv, ok := h.requireOwnedConversation(c)
	if !ok {
		return
	}
	if err := h.svc.Client().PauseConversation(c.Request.Context(), conv.RemoteConversationID); err != nil {
		mapAndRespondError(c, err)
		return
	}
	h.svc.MarkStatus(conv.ID, StatusPaused)
	utils.Success(c, gin.H{"status": StatusPaused})
}

// ResumeConversation POST /conversations/:id/resume
func (h *Handler) ResumeConversation(c *gin.Context) {
	conv, ok := h.requireOwnedConversation(c)
	if !ok {
		return
	}
	if err := h.svc.Client().ResumeConversation(c.Request.Context(), conv.RemoteConversationID); err != nil {
		mapAndRespondError(c, err)
		return
	}
	h.svc.MarkStatus(conv.ID, StatusIdle)
	utils.Success(c, gin.H{"status": StatusIdle})
}

// StreamTurn GET /conversations/:id/turns/:turn_id/stream
//
// SSE 透传:从远端按字节读,逐块写到客户端并立即 Flush。
// 终态事件(done/error/cancelled)不会被解析,只透传;但流自然结束后我们尝试同步本地状态。
func (h *Handler) StreamTurn(c *gin.Context) {
	conv, ok := h.requireOwnedConversation(c)
	if !ok {
		return
	}
	turnID := c.Param("turn_id")
	if turnID == "" {
		utils.BadRequest(c, "缺少 turn_id")
		return
	}

	// 上限保护:在请求 ctx 上叠加 10min 超时
	streamCtx, cancel := context.WithTimeout(c.Request.Context(), StreamRequestTimeout)
	defer cancel()

	resp, err := h.svc.Client().OpenTurnStream(streamCtx, conv.RemoteConversationID, turnID)
	if err != nil {
		mapAndRespondError(c, err)
		return
	}
	defer resp.Body.Close()

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, _ := c.Writer.(http.Flusher)
	if flusher != nil {
		flusher.Flush()
	}

	// 流式拷贝:逐行读取 + 立即 Flush + 在事件边界打点
	// 用 bufio.Reader.ReadBytes('\n') 而不是 4KB 块拷贝,这样我们能精确捕获每个 SSE 事件
	// 的到达时间,验证是远端 agent 在批量返回还是我们这边在攒包。
	reader := bufio.NewReaderSize(resp.Body, 4096)
	// 默认关闭逐事件打点(避免生产日志过量)。需要排查时:
	//   header X-PR2-Trace: 1     或
	//   query  ?trace=1
	// 即可在 backend 日志看到每个 SSE 事件的到达时间、字段、大小、preview。
	logEvents := strings.EqualFold(c.GetHeader("X-PR2-Trace"), "1") ||
		c.Query("trace") == "1"
	streamStart := time.Now()
	var blockBuf bytes.Buffer
	eventCount := 0
	for {
		line, rerr := reader.ReadBytes('\n')
		if len(line) > 0 {
			if _, werr := c.Writer.Write(line); werr != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
			if logEvents {
				blockBuf.Write(line)
				// SSE 事件以空行(只含 \n 或 \r\n)分隔
				trimmed := bytes.TrimRight(line, "\r\n")
				if len(trimmed) == 0 && blockBuf.Len() > len(line) {
					eventCount++
					ev := extractEventField(blockBuf.Bytes())
					slog.Info("pr2 sse event arrived",
						"conv_id", conv.ID,
						"turn_id", turnID,
						"seq", eventCount,
						"event", ev,
						"block_bytes", blockBuf.Len(),
						"elapsed_ms", time.Since(streamStart).Milliseconds(),
					)
					blockBuf.Reset()
				}
			}
		}
		if rerr != nil {
			if rerr != io.EOF && streamCtx.Err() == nil {
				slog.Warn("pr2 sse upstream read error", "err", rerr,
					"conv_id", conv.ID, "turn_id", turnID,
					"events_so_far", eventCount)
			}
			break
		}
		if streamCtx.Err() != nil {
			break
		}
	}
	if logEvents {
		slog.Info("pr2 sse stream closed",
			"conv_id", conv.ID,
			"turn_id", turnID,
			"total_events", eventCount,
			"total_ms", time.Since(streamStart).Milliseconds(),
		)
	}

	// 流结束后异步同步状态(不阻塞响应)
	go func(localID uint, remoteID string) {
		bg, bgCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer bgCancel()
		if cv, err := h.svc.repo.FindByLocalID(localID); err == nil {
			_ = h.svc.SyncStatus(bg, cv)
			_ = remoteID
		}
	}(conv.ID, conv.RemoteConversationID)
}

// ========== 匿名试用 / 认领 ==========

// TrialStatus GET /trial-status
func (h *Handler) TrialStatus(c *gin.Context) {
	userIDPtr := optionalUserID(c)
	if userIDPtr != nil {
		// 已登录用户走 quota,不消费匿名额度
		utils.Success(c, &TrialStatusResponse{CanTrial: true, TrialDay: ""})
		return
	}
	resp := h.svc.TrialStatus(GetDeviceID(c), GetIPUAHash(c))
	utils.Success(c, resp)
}

// ClaimAll POST /claim-all
type claimAllRequest struct {
	AnonToken string `json:"anon_token" binding:"required"`
}

func (h *Handler) ClaimAll(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok || userID == 0 {
		utils.Unauthorized(c, "请先登录")
		return
	}
	var req claimAllRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数无效: "+err.Error())
		return
	}
	ids, err := h.svc.ClaimAllByAnonToken(userID, strings.TrimSpace(req.AnonToken))
	if err != nil {
		utils.InternalServerError(c, "认领失败", err)
		return
	}
	utils.Success(c, gin.H{"claimed_ids": ids, "claimed_count": len(ids)})
}

// ========== 公共辅助 ==========

func (h *Handler) requireOwnedConversation(c *gin.Context) (*PeerReview2Conversation, bool) {
	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(c, "id 参数无效")
		return nil, false
	}
	userIDPtr := optionalUserID(c)
	anonToken := strings.TrimSpace(c.Query(queryAnonToken))
	conv, err := h.svc.GetConversation(uint(id64), userIDPtr, anonToken)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.NotFound(c, "会话不存在")
			return nil, false
		}
		if errors.Is(err, ErrAccessDenied) {
			utils.Forbidden(c, "无权访问该会话")
			return nil, false
		}
		utils.InternalServerError(c, "查询会话失败", err)
		return nil, false
	}
	return conv, true
}

// optionalUserID 优先取登录用户;未登录返回 nil。
// 必须用 GetOptionalUserID(silent),GetUserID 会自动写 401 响应,
// 在 OptionalAuth 路由上等于"匿名请求 401 + 接着 200"双 body 灾难。
func optionalUserID(c *gin.Context) *uint {
	if uid, ok := utils.GetOptionalUserID(c); ok && uid != 0 {
		return &uid
	}
	return nil
}

func getExt(filename string) string {
	idx := strings.LastIndex(filename, ".")
	if idx < 0 || idx == len(filename)-1 {
		return ""
	}
	return filename[idx+1:]
}

// extractEventField 从一个完整 SSE 事件块里提取 `event:` 字段值;没有则返回 "message"。
// 顺便也截一下 data 的前 60 字节,便于排查 delta 大小分布。
func extractEventField(block []byte) string {
	scanner := bufio.NewScanner(bytes.NewReader(block))
	scanner.Buffer(make([]byte, 0, 8*1024), 1<<20)
	var event, dataPreview string
	dataLen := 0
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event:") {
			event = strings.TrimSpace(line[6:])
		} else if strings.HasPrefix(line, "data:") {
			d := strings.TrimSpace(line[5:])
			dataLen += len(d)
			if dataPreview == "" {
				if len(d) > 60 {
					dataPreview = d[:60] + "…"
				} else {
					dataPreview = d
				}
			}
		}
	}
	if event == "" {
		event = "message"
	}
	return event + " | data_chars=" + strconv.Itoa(dataLen) + " | preview=" + dataPreview
}

func mapAndRespondError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotConfigured):
		utils.Error(c, http.StatusServiceUnavailable, err.Error())
	case errors.Is(err, ErrAnonTrialExhausted):
		utils.TooManyRequests(c, err.Error())
	case errors.Is(err, ErrAccessDenied):
		utils.Forbidden(c, err.Error())
	case errors.Is(err, gorm.ErrRecordNotFound):
		utils.NotFound(c, "记录不存在")
	case circuitbreaker.IsCircuitBreakerError(err):
		utils.Error(c, http.StatusServiceUnavailable, "审稿服务暂时不可用,请稍后重试")
	default:
		var apiErr *APIError
		if errors.As(err, &apiErr) {
			// 远端 4xx 直接透传 status,body 简要写到 message
			body := apiErr.Body
			if len(body) > 500 {
				body = body[:500]
			}
			c.JSON(apiErr.StatusCode, utils.Response{
				Code:    apiErr.StatusCode,
				Message: "远端审稿服务返回错误: " + body,
			})
			return
		}
		utils.InternalServerError(c, "审稿服务出错", err)
	}
}
