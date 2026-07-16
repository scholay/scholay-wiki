// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package smartsearch

import (
	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/library"
)

// Handler 是智能搜索的 thin HTTP wrapper.
//
// session 端点 + WS 全部走 agentbridge.SessionHandler 通用模板, 这里只剩"挂路由 + 文案定制":
//   - bootstrap 调 NewHandler 拿到 Handler
//   - routes_user 逐个挂 HTTP 端点 (session/messages/context/ws-ticket + 多会话 sessions/*)
//   - WS 路由跟 HTTP 不在同一鉴权组下 (browser WS 无法带 Authorization), 单独挂 Handler.HandleWS
//
// 多会话 (2026-07): smart_search 从"单会话 + 重置上下文"改为"多会话"(与 claw 同型):可新开会话、
// 侧边栏会话列表、每会话独立上下文。messages/context/ws-ticket 认 ?session_id=;新增 sessions/* 增删改切。
// reset 端点保留 (向后兼容, 前端已不再调用)。
//
// 上传 / 引用文献 (attach.go) 走 internal/agentattach 通用实现 (2026-07-14 三 feature 输入框统一)。
type Handler struct {
	inner      *agentbridge.SessionHandler
	uploader   *agentattach.Uploader
	referencer *agentattach.Referencer
}

// NewHandler 由 bootstrap 调用; feature 由 agentbridge.Bridge.For(smartsearch.Spec) 构造;
// libReader 与 claw / prism 共用同一个文献集只读 Reader (引用文献用)。
func NewHandler(feature *agentbridge.FeatureBridge, libReader *library.Reader) *Handler {
	labels := agentbridge.DefaultLabels()
	// 用户可见文案: smart-search 偏"检索"语境
	labels.AgentUnreachableOnGetSession = "智能搜索服务暂时不可用,请稍后重试"
	labels.AgentUnreachableOnResetSession = "重置会话失败,请稍后重试"
	labels.LoadMessagesFailed = "无法加载历史会话,请稍后重试"
	labels.ContextEstimateFailed = "无法读取上下文用量"
	labels.WSTicketFailed = "无法签发会话凭证,请稍后重试"

	// 多会话: 上传 / 引用缺 session_id 时**新建一个会话** (resolveEmpty=nil → agentattach 默认
	// CreateNewSession, 与 claw 同语义「添加文件 = 开始新会话」), 前端 onSessionEnsured 收下 adopt。
	// 注意:「新对话」按钮**不预建**会话(懒建于首次发送), 故空白态直接传文件正是 resolveEmpty 的热路径 ——
	// 必须新建而非落到 GetOrCreateSession 的「最近活跃旧会话」, 否则文件被静默塞进不相关的旧会话(评审 #4)。
	// 已激活会话内上传自带 session_id, 走 OwnsSession 分支, 不碰 resolveEmpty。
	return &Handler{
		inner:      agentbridge.NewSessionHandler(feature, labels),
		uploader:   agentattach.NewUploader(feature, nil),
		referencer: agentattach.NewReferencer(feature, libReader, nil),
	}
}

// MountRoutes 把标准 session 端点 + 多会话端点挂在给定路由组下 (routes_user 目前逐个手挂, 本方法保留备用)。
func (h *Handler) MountRoutes(g *gin.RouterGroup) {
	g.GET("/session", h.inner.GetSession)
	g.POST("/session/reset", h.inner.ResetSession)
	g.GET("/session/messages", h.inner.GetSessionMessages)
	g.GET("/session/context", h.inner.GetContextEstimate)
	g.POST("/session/ws-ticket", h.inner.IssueWSTicket)
	h.inner.MountMultiSessionRoutes(g)
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

// ─── 多会话委托 (routes_user 手挂; 全部薄委托到通用 SessionHandler) ──────────────
func (h *Handler) ListSessions(c *gin.Context)     { h.inner.ListSessions(c) }
func (h *Handler) CreateNewSession(c *gin.Context) { h.inner.CreateNewSession(c) }
func (h *Handler) RenameSession(c *gin.Context)    { h.inner.RenameSession(c) }
func (h *Handler) DeleteSession(c *gin.Context)    { h.inner.DeleteSession(c) }
func (h *Handler) ActivateSession(c *gin.Context)  { h.inner.ActivateSession(c) }
