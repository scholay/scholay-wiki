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
	"context"
	"errors"
	"log/slog"
	"strconv"
	"time"

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

// Labels 控制端点的错误响应文案 (前端用户看到的中文)。
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
	// ─── 多会话端点文案 (MountMultiSessionRoutes 用; 单会话 feature 不需要设置) ───
	// SessionNotFound        e.g. "会话不存在或不属于你"
	SessionNotFound string
	// ListSessionsFailed     e.g. "无法加载会话列表,请稍后重试"
	ListSessionsFailed string
	// CreateSessionFailed    e.g. "新建会话失败,请稍后重试"
	CreateSessionFailed string
	// RenameSessionFailed    e.g. "重命名失败,请稍后重试"
	RenameSessionFailed string
	// DeleteSessionFailed    e.g. "删除失败,请稍后重试"
	DeleteSessionFailed string
	// ActivateSessionFailed  e.g. "切换会话失败,请稍后重试"
	ActivateSessionFailed string
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
		SessionNotFound:                "会话不存在或不属于你",
		ListSessionsFailed:             "无法加载会话列表,请稍后重试",
		CreateSessionFailed:            "新建会话失败,请稍后重试",
		RenameSessionFailed:            "重命名失败,请稍后重试",
		DeleteSessionFailed:            "删除失败,请稍后重试",
		ActivateSessionFailed:          "切换会话失败,请稍后重试",
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

// SessionEnvelopeWithTicket 组装 session 响应,并 best-effort 附带一张首连 ws ticket ——
// 前端拿到即可直接升级 WS,省掉首连前的 POST /session/ws-ticket 一跳(agent 类 feature
// 进入链原本是 GET session → POST ws-ticket → WS 三段串行,弱网 RTT 体感明显,2026-08-12)。
// 铸票失败(Redis 抖动)不影响 session 语义:响应不带 wsToken,前端自动回落 POST 取票。
// 票据一次性(GETDEL)且多张并存互不影响 —— 重连仍走 POST 新票,首连票没消费就 30s 过期。
// 各 feature 的手写 GetSession(claw/boltslides/scidraw/statlab)也应统一走这里。
func SessionEnvelopeWithTicket(ctx context.Context, f *FeatureBridge, userID uint, sessionID string) gin.H {
	resp := gin.H{"sessionId": sessionID}
	// 铸票是响应的顺带优化,给它独立短超时:Redis 半死(连接挂起而非拒绝)时绝不能
	// 拖着 session 端点等到全局超时 —— 800ms 内拿不到就放弃,前端回落 POST 取票。
	tctx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
	defer cancel()
	if wsToken, err := f.IssueWSTicket(tctx, userID, sessionID); err == nil {
		resp["wsToken"] = wsToken
		resp["expiresInSeconds"] = int(wsTicketTTL.Seconds())
	}
	return resp
}

// GetSession — GET /session: get-or-create 当前用户在本 feature 的 session id(+首连 ws ticket)。
func (h *SessionHandler) GetSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.Feature.GetOrCreateSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.AgentUnreachableOnGetSession, err)
		return
	}
	utils.Success(c, SessionEnvelopeWithTicket(c.Request.Context(), h.Feature, userID, sessionID))
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

// GetSessionMessages — GET /session/messages: 拉历史消息.
// 多会话场景下前端会显式带 ?session_id=xxx 指定要看哪个 session 的历史 (避免切换中 race);
// 不带就走 "latest active" 路径兼容单会话调用。
func (h *SessionHandler) GetSessionMessages(c *gin.Context) {
	userID := c.GetUint("user_id")
	limit := ParseLimitTurns(c)
	if sid := c.Query("session_id"); sid != "" {
		result, err := h.Feature.GetSessionMessagesByID(c.Request.Context(), userID, sid, limit)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				utils.Error(c, 4404, h.Labels.SessionNotFound)
				return
			}
			utils.InternalError(c, errcode.AgentUnreachable, h.Labels.LoadMessagesFailed, err)
			return
		}
		utils.Success(c, gin.H{"sessionId": result.SessionID, "messages": result.Messages, "totalTurns": result.TotalTurns, "hasMore": result.HasMore})
		return
	}
	result, err := h.Feature.GetSessionMessages(c.Request.Context(), userID, limit)
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

// GetContextEstimate — GET /session/context: 会话上下文水位.
// 同 GetSessionMessages: 前端带 ?session_id=xxx 时读指定 session (避免切换 race)。
func (h *SessionHandler) GetContextEstimate(c *gin.Context) {
	userID := c.GetUint("user_id")
	if sid := c.Query("session_id"); sid != "" {
		est, err := h.Feature.GetContextEstimateByID(c.Request.Context(), userID, sid)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				utils.Error(c, 4404, h.Labels.SessionNotFound)
				return
			}
			// 上下文水位是非关键 footer 表;agent 慢/超时降级返 0(与"还没说过话"同形),不拖出 502。
			slog.Debug("agentbridge: context estimate unavailable, degrading", "session_id", sid, "err", err)
			utils.Success(c, gin.H{"sessionId": sid, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": "", "degraded": true})
			return
		}
		if est == nil {
			utils.Success(c, gin.H{"sessionId": sid, "totalTokens": 0, "maxTokens": 0, "percentage": 0, "model": ""})
			return
		}
		utils.Success(c, gin.H{
			"sessionId":   sid,
			"totalTokens": est.TotalTokens,
			"maxTokens":   est.MaxTokens,
			"percentage":  est.Percentage,
			"model":       est.Model,
		})
		return
	}
	est, sessionID, err := h.Feature.GetContextEstimate(c.Request.Context(), userID)
	if err != nil {
		// 上下文水位是非关键 footer 表;agent 慢/超时降级返 0(与"还没说过话"同形),
		// 不让它拖出 502 + ERROR。仅 DEBUG 记一笔。
		slog.Debug("agentbridge: context estimate unavailable, degrading", "err", err)
		utils.Success(c, gin.H{
			"sessionId":   sessionID,
			"totalTokens": 0,
			"maxTokens":   0,
			"percentage":  0,
			"model":       "",
			"degraded":    true,
		})
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
// 多会话: 前端带 ?session_id=xxx 时给指定 session 签 (鉴权 OwnsSession), 不带就给 latest active 签。
func (h *SessionHandler) IssueWSTicket(c *gin.Context) {
	userID := c.GetUint("user_id")
	var sessionID string
	if sid := c.Query("session_id"); sid != "" {
		owns, err := h.Feature.OwnsSession(userID, sid)
		if err != nil {
			utils.InternalError(c, errcode.AgentUnreachable, h.Labels.AgentUnreachableOnGetSession, err)
			return
		}
		if !owns {
			utils.Error(c, 4404, h.Labels.SessionNotFound)
			return
		}
		sessionID = sid
	} else {
		sid, err := h.Feature.GetOrCreateSession(c.Request.Context(), userID)
		if err != nil {
			utils.InternalError(c, errcode.AgentUnreachable, h.Labels.AgentUnreachableOnGetSession, err)
			return
		}
		sessionID = sid
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

// ─── 多会话端点 (ChatGPT 风格侧边栏会话列表; claw 原为手写, 现收口到通用模板) ──────────
//
// 单会话 feature (只 get-or-create + reset) 不需要这些; 多会话 feature (smart_search / claw) 用
// MountMultiSessionRoutes 一次性挂上。全部薄委托到 FeatureBridge 已有方法, 与 claw/handler.go 同型。

// MountMultiSessionRoutes 把 6 个多会话端点挂到给定路由组下 (通常与 MountSessionRoutes 同前缀):
//
//	GET    {prefix}/sessions            列表
//	POST   {prefix}/sessions            新建 (不删旧)
//	PATCH  {prefix}/sessions/:id        改名
//	POST   {prefix}/sessions/:id/rename 改名 (别名, 兼容不支持 PATCH 的客户端)
//	DELETE {prefix}/sessions/:id        删除
//	POST   {prefix}/sessions/:id/activate 置为最近活跃
func (h *SessionHandler) MountMultiSessionRoutes(g *gin.RouterGroup) {
	g.GET("/sessions", h.ListSessions)
	g.POST("/sessions", h.CreateNewSession)
	g.PATCH("/sessions/:id", h.RenameSession)
	g.POST("/sessions/:id/rename", h.RenameSession)
	g.DELETE("/sessions/:id", h.DeleteSession)
	g.POST("/sessions/:id/activate", h.ActivateSession)
}

// ListSessions — GET /sessions: 列出当前用户在本 feature 的全部会话 (last_accessed_at DESC)。
func (h *SessionHandler) ListSessions(c *gin.Context) {
	userID := c.GetUint("user_id")
	items, err := h.Feature.ListSessions(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.ListSessionsFailed, err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": len(items)})
}

// CreateNewSession — POST /sessions: 新建会话, 不删任何已有会话 (与 reset 的"删旧+建新"不同)。
func (h *SessionHandler) CreateNewSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID, err := h.Feature.CreateNewSession(c.Request.Context(), userID)
	if err != nil {
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.CreateSessionFailed, err)
		return
	}
	// 建新会话后前端必然立刻连它的 WS —— 顺带附首连票,省一跳 POST(web 端「新对话」是
	// 首连的最高频入口;GET /session 的单会话形态在 web 端已无消费方)。
	utils.Success(c, SessionEnvelopeWithTicket(c.Request.Context(), h.Feature, userID, sessionID))
}

// RenameSession — PATCH /sessions/:id  body: { "title": "新标题" }。鉴权: 必须是本人 session。
func (h *SessionHandler) RenameSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := c.Param("id")
	if sessionID == "" {
		utils.BadRequest(c, "missing session id")
		return
	}
	var req struct {
		Title string `json:"title" binding:"required,min=1,max=120"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := h.Feature.RenameSession(c.Request.Context(), userID, sessionID, req.Title); err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.Error(c, 4404, h.Labels.SessionNotFound)
			return
		}
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.RenameSessionFailed, err)
		return
	}
	utils.SuccessWithMessage(c, "已重命名", gin.H{"sessionId": sessionID, "title": req.Title})
}

// DeleteSession — DELETE /sessions/:id: 删除某具体 session (agent jsonl + DB mapping)。
// 鉴权: 必须是本人 session。若删的是当前活跃 session, 前端应主动切到另一条 (或新建)。
func (h *SessionHandler) DeleteSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := c.Param("id")
	if sessionID == "" {
		utils.BadRequest(c, "missing session id")
		return
	}
	if err := h.Feature.DeleteSessionByID(c.Request.Context(), userID, sessionID); err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.Error(c, 4404, h.Labels.SessionNotFound)
			return
		}
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.DeleteSessionFailed, err)
		return
	}
	utils.SuccessWithMessage(c, "已删除", nil)
}

// ActivateSession — POST /sessions/:id/activate: 把 last_accessed_at 设为 NOW。鉴权: 必须是本人 session。
func (h *SessionHandler) ActivateSession(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := c.Param("id")
	if sessionID == "" {
		utils.BadRequest(c, "missing session id")
		return
	}
	if err := h.Feature.ActivateSession(userID, sessionID); err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.Error(c, 4404, h.Labels.SessionNotFound)
			return
		}
		utils.InternalError(c, errcode.AgentUnreachable, h.Labels.ActivateSessionFailed, err)
		return
	}
	// 切会话后 sessionId 变化 → 前端 WS 必然重连 —— 同样附首连票省一跳。
	utils.Success(c, SessionEnvelopeWithTicket(c.Request.Context(), h.Feature, userID, sessionID))
}
