// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package smartsearch

import (
	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentbridge"
)

// Handler 是智能搜索的 thin HTTP wrapper.
//
// 5 个 session 端点 + WS 全部走 agentbridge.SessionHandler 通用模板, 这里只剩"挂路由 + 文案定制":
//   - bootstrap 调 NewHandler 拿到 Handler
//   - routes_user 调 Handler.MountRoutes(group) 把 5 个 HTTP 端点一次性挂上
//   - WS 路由跟 HTTP 不在同一鉴权组下 (browser WS 无法带 Authorization), 单独挂 Handler.HandleWS
type Handler struct {
	inner *agentbridge.SessionHandler
}

// NewHandler 由 bootstrap 调用; feature 由 agentbridge.Bridge.For(smartsearch.Spec) 构造。
func NewHandler(feature *agentbridge.FeatureBridge) *Handler {
	labels := agentbridge.DefaultLabels()
	// 用户可见文案: smart-search 偏"检索"语境
	labels.AgentUnreachableOnGetSession = "智能搜索服务暂时不可用,请稍后重试"
	labels.AgentUnreachableOnResetSession = "重置会话失败,请稍后重试"
	labels.LoadMessagesFailed = "无法加载历史会话,请稍后重试"
	labels.ContextEstimateFailed = "无法读取上下文用量"
	labels.WSTicketFailed = "无法签发会话凭证,请稍后重试"

	return &Handler{
		inner: agentbridge.NewSessionHandler(feature, labels),
	}
}

// MountRoutes 把 5 个标准 session 端点挂在给定路由组下.
// 由 cmd/server/routes_user.go 调用。
func (h *Handler) MountRoutes(g *gin.RouterGroup) {
	g.GET("/session", h.inner.GetSession)
	g.POST("/session/reset", h.inner.ResetSession)
	g.GET("/session/messages", h.inner.GetSessionMessages)
	g.GET("/session/context", h.inner.GetContextEstimate)
	g.POST("/session/ws-ticket", h.inner.IssueWSTicket)
}

// HandleWS 让 routes_user 直接挂在公共路由 (无 user middleware) 上。
func (h *Handler) HandleWS(c *gin.Context) {
	h.inner.HandleWS(c)
}

// GetSession / ResetSession / ... 保留为方法是为了兼容老的路由注册 (routes_user 里直接
// 写 `h.smartSearch.GetSession`). MountRoutes 是新推荐入口。
func (h *Handler) GetSession(c *gin.Context)         { h.inner.GetSession(c) }
func (h *Handler) ResetSession(c *gin.Context)       { h.inner.ResetSession(c) }
func (h *Handler) GetSessionMessages(c *gin.Context) { h.inner.GetSessionMessages(c) }
func (h *Handler) GetContextEstimate(c *gin.Context) { h.inner.GetContextEstimate(c) }
func (h *Handler) IssueWSTicket(c *gin.Context)      { h.inner.IssueWSTicket(c) }
