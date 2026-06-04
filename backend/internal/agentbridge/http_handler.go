// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

// 通用 HTTP handler 模板 —— smart_search / claw / 未来其它 agent-backed feature 的 5 个 HTTP
// session 端点 (GetSession / ResetSession / GetSessionMessages / GetContextEstimate /
// IssueWSTicket) + 1 个 WS 端点 (HandleWS) 都是同形结构,只是错误文案不同。
//
// 旧设计: smartsearch/handler.go 和 claw/handler.go 各自抄一份, 重复 ~100 行;
//   bridge 加新方法 / 改协议时两边都要改, 历史经验证明很容易漏。
//
// 新设计: agentbridge.MountSessionRoutes(group, feature, labels) 把这套挂上去,
//   各 feature 模块的 handler 只剩"专属端点" (claw 有 upload / models / 多会话, smartsearch 只剩 thin wrapper)。
//
// 复用规则:
//   - 任何走 user-feature-session 模型的 agent feature 都应该用这个
//   - labels 用于错误文案定制; 默认值见 DefaultLabels()
//   - 业务码用 errcode 包统一; 不允许在 labels 里塞码
//
// 不在范围内 (保留各 feature handler 自己处理):
//   - 多会话 (claw /sessions/* 列表 / 改名 / 删 / 切换) — agent 端 jsonl 主键约束不同
//   - 文件上传 (claw / peerreview) — multipart 逻辑各家不同
//   - 模型切换 (claw /models) — 各 feature 暴露不一样的 tier

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
)

// ParseLimitTurns 从 ?limit= 读取"最近 N 轮"分页参数。缺省/非法/<=0 → 0 (= 不分页, 返回全部)。
// 上限 500 防止前端传超大值把分页架空。各 feature 的 messages handler 共用。
func ParseLimitTurns(c *gin.Context) int {
	raw := c.Query("limit")
	if raw == "" {
		return 0
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 0
	}
	if n > 500 {
		return 500
	}
	return n
}

// Labels 控制 5 个端点的错误响应文案 (前端用户看到的中文)。
// 业务码不需要传 — 都是 errcode.AgentUnreachable / 5001 (WS ticket); 见 sendAgentErr。
type Labels struct {
	// AgentUnreachableOnGetSession  e.g. "智能搜索服务暂时不可用,请稍后重试"
	AgentUnreachableOnGetSession string
	// AgentUnreachableOnResetSession e.g. "重置会话失败,请稍后重试"
	AgentUnreachableOnResetSession string
	// LoadMessagesFailed             e.g. "无法加载历史会话,请稍后重试"
	LoadMessagesFailed string
	// ContextEstimateFailed          e.g. "无法读取上下文用量"
	ContextEstimateFailed string
	// WSTicketFailed                 e.g. "无法签发会话凭证,请稍后重试"
	WSTicketFailed string
}

// DefaultLabels 给一份通用兜底文案. feature 各自可以覆盖具体字段:
//
//	labels := agentbridge.DefaultLabels()
//	labels.AgentUnreachableOnGetSession = "智能搜索服务暂时不可用,请稍后重试"
func DefaultLabels() Labels {
	return Labels{
		AgentUnreachableOnGetSession:   "agent 服务暂时不可用,请稍后重试",
		AgentUnreachableOnResetSession: "重置会话失败,请稍后重试",
		LoadMessagesFailed:             "无法加载历史会话,请稍后重试",
		ContextEstimateFailed:          "无法读取上下文用量",
		WSTicketFailed:                 "无法签发会话凭证,请稍后重试",
	}
}

// SessionHandler 是 5 个 HTTP 端点 + 1 个 WS 端点的承载者. 通常由 MountSessionRoutes 内部
// 构造和挂载, 不推荐直接 new (除非你要做自定义路由前缀)。
type SessionHandler struct {
	Feature *FeatureBridge
	Labels  Labels
}

// NewSessionHandler 给希望"自己挂路由"的 feature 提供构造器。普通用法用 MountSessionRoutes。
func NewSessionHandler(feature *FeatureBridge, labels Labels) *SessionHandler {
	return &SessionHandler{Feature: feature, Labels: labels}
}

// MountSessionRoutes 把 5 个标准 HTTP 端点挂到给定路由组下:
//
//	GET    {prefix}/session
//	POST   {prefix}/session/reset
//	GET    {prefix}/session/messages
//	GET    {prefix}/session/context
//	POST   {prefix}/session/ws-ticket
//
// WS 路由不在这里挂 (因为通常路径在另一个鉴权组下), 调用方自己用 SessionHandler.HandleWS 挂。
func MountSessionRoutes(g *gin.RouterGroup, feature *FeatureBridge, labels Labels) *SessionHandler {
	h := NewSessionHandler(feature, labels)
	g.GET("/session", h.GetSession)
	g.POST("/session/reset", h.ResetSession)
	g.GET("/session/messages", h.GetSessionMessages)
	g.GET("/session/context", h.GetContextEstimate)
	g.POST("/session/ws-ticket", h.IssueWSTicket)
	return h
}

// ─── 5 个 HTTP 端点 ─────────────────────────────────────────────────────

// GetSession — GET /session: get-or-create 当前用户在本 feature 的 session id.
func (h *SessionHandler) GetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.Feature.GetOrCreateSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.AgentUnreachableOnGetSession, err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

// ResetSession — POST /session/reset: 删旧 + 建新.
func (h *SessionHandler) ResetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.Feature.ResetSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.AgentUnreachableOnResetSession, err)
		return
	}
	utils.Success(c, gin.H{"sessionId": sessionID})
}

// GetSessionMessages — GET /session/messages: 拉历史消息 (latest active session).
func (h *SessionHandler) GetSessionMessages(c *gin.Context) {
	userID := c.GetUint("user_id")
	result, err := h.Feature.GetSessionMessages(c.Request.Context(), userID, ParseLimitTurns(c))
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.LoadMessagesFailed, err)
		return
	}
	utils.Success(c, gin.H{
		"sessionId":  result.SessionID,
		"messages":   result.Messages,
		"totalTurns": result.TotalTurns,
		"hasMore":    result.HasMore,
	})
}

// GetContextEstimate — GET /session/context: 当前会话上下文水位.
func (h *SessionHandler) GetContextEstimate(c *gin.Context) {
	userID := c.GetUint("user_id")
	est, sessionID, err := h.Feature.GetContextEstimate(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.ContextEstimateFailed, err)
		return
	}
	if est == nil {
		utils.Success(c, gin.H{
			"sessionId":   sessionID,
			"totalTokens": 0,
			"maxTokens":   0,
			"percentage":  0,
			"model":       "",
		})
		return
	}
	utils.Success(c, gin.H{
		"sessionId":   sessionID,
		"totalTokens": est.TotalTokens,
		"maxTokens":   est.MaxTokens,
		"percentage":  est.Percentage,
		"model":       est.Model,
	})
}

// IssueWSTicket — POST /session/ws-ticket: 签发 30s 一次性 ws ticket.
// 业务码: ticket 签发失败用 5001 (内部错), 其它走 errcode.AgentUnreachable.
func (h *SessionHandler) IssueWSTicket(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.Feature.GetOrCreateSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.AgentUnreachableOnGetSession, err)
		return
	}
	token, err := h.Feature.IssueWSTicket(c.Request.Context(), userID, sessionID)
	if err != nil {
		utils.InternalError(c, codeWSTicketInternal, h.Labels.WSTicketFailed, err)
		return
	}
	utils.Success(c, gin.H{
		"sessionId":        sessionID,
		"wsToken":          token,
		"expiresInSeconds": 30,
	})
}

// HandleWS — 升级 WS 并 pipe 到 scholar_agent. 不挂在 MountSessionRoutes 里 (路径 / 鉴权另算)。
func (h *SessionHandler) HandleWS(c *gin.Context) {
	h.Feature.HandleWS(c)
}

// codeWSTicketInternal 仅在本文件用, 没有跨模块复用价值 — WS ticket 签发失败是
// agentbridge 内部错 (Redis 写不进去 / token 生成失败), 跟前端处理无关。
const codeWSTicketInternal = 5001
