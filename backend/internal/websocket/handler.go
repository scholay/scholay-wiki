// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package websocket

import (
	"log/slog"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler WebSocket HTTP 处理器
type Handler struct {
	hub *Hub
}

// NewHandler 创建 Handler
func NewHandler(hub *Hub) *Handler {
	return &Handler{hub: hub}
}

// IssueWSTicket — POST /api/v1/user/ws-ticket(UserAuthMiddleware 之后)。
// 为当前登录用户签发一张 30s 一次性 ws ticket,前端拿它升级站内信 WS。
// 替代把裸 JWT 放进 URL query(JWT 长 TTL、会落 nginx access log)。
func (h *Handler) IssueWSTicket(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		utils.Unauthorized(c, "未登录")
		return
	}
	token, err := IssueInboxTicket(c.Request.Context(), userID)
	if err != nil {
		slog.Error("failed to issue inbox ws ticket", "user_id", userID, "err", err)
		utils.ServerError(c, "签发 ws ticket 失败")
		return
	}
	utils.Success(c, gin.H{"wsToken": token})
}

// HandleWebSocket 处理 WebSocket 连接请求。
// 认证方式:URL 查询参数 ?ws_token=<一次性 ticket>(可选,无/无效 ws_token 则视为访客)。
// 不再接受裸 JWT(?token=)—— 避免长 TTL token 落进 nginx access log 被重放。
func (h *Handler) HandleWebSocket(c *gin.Context) {
	wsToken := c.Query("ws_token")
	clientIP := c.ClientIP()
	m := h.hub.GetMelody()

	connectGuest := func() {
		if err := m.HandleRequestWithKeys(c.Writer, c.Request, map[string]any{
			"is_guest":  true,
			"client_ip": clientIP,
		}); err != nil {
			slog.Error("failed to upgrade guest WebSocket connection", "err", err)
		}
	}

	// 无 ws_token → 访客连接(站内信 WS 允许匿名,用于公告等公共推送)。
	if wsToken == "" {
		connectGuest()
		return
	}

	// 消费一次性 ticket(GETDEL):无效/过期 → 退化为访客连接(不硬失败,保留 UX)。
	userID, err := ConsumeInboxTicket(c.Request.Context(), wsToken)
	if err != nil {
		slog.Warn("invalid ws ticket, connecting as guest", "err", err)
		connectGuest()
		return
	}

	if err := m.HandleRequestWithKeys(c.Writer, c.Request, map[string]any{
		"user_id":   userID,
		"client_ip": clientIP,
		"is_guest":  false,
	}); err != nil {
		slog.Error("failed to upgrade WebSocket connection", "user_id", userID, "err", err)
	}
}

// GetHub 获取 Hub 实例
func (h *Handler) GetHub() *Hub {
	return h.hub
}

