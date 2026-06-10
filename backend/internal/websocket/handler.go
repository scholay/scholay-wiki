// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package websocket

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler WebSocket HTTP 处理器
type Handler struct {
	hub *Hub
	// jwtSecret 已不再使用:token 校验改走 utils.ParseToken(统一密钥源 + 吊销检查)。
	// 保留字段仅为兼容 NewHandler 签名,后续接入 ws-ticket 后连同 ?token= 一起下线。
	jwtSecret string
}

// NewHandler 创建 Handler
func NewHandler(hub *Hub, jwtSecret string) *Handler {
	return &Handler{
		hub:       hub,
		jwtSecret: jwtSecret,
	}
}

// HandleWebSocket 处理 WebSocket 连接请求
// 认证方式：URL 查询参数 ?token=xxx（可选，无 token 则视为访客）
func (h *Handler) HandleWebSocket(c *gin.Context) {
	// 从查询参数获取 token
	token := c.Query("token")

	// 获取客户端 IP
	clientIP := c.ClientIP()

	// 获取 melody 实例
	m := h.hub.GetMelody()

	// 如果没有 token，视为访客连接
	if token == "" {
		err := m.HandleRequestWithKeys(c.Writer, c.Request, map[string]any{
			"is_guest":  true,
			"client_ip": clientIP,
		})
		if err != nil {
			slog.Error("failed to upgrade guest WebSocket connection", "err", err)
		}
		return
	}

	// 验证 token(含吊销检查)
	userID, username, err := h.validateToken(c.Request.Context(), token)
	if err != nil {
		// Token 无效，也可以作为访客连接
		slog.Warn("invalid token, connecting as guest", "err", err)
		err = m.HandleRequestWithKeys(c.Writer, c.Request, map[string]any{
			"is_guest":  true,
			"client_ip": clientIP,
		})
		if err != nil {
			slog.Error("failed to upgrade guest WebSocket connection", "err", err)
		}
		return
	}

	// 在升级前设置用户信息到请求上下文
	// melody 会在 HandleConnect 中通过 session.Get 获取
	err = m.HandleRequestWithKeys(c.Writer, c.Request, map[string]any{
		"user_id":   userID,
		"username":  username,
		"client_ip": clientIP,
		"is_guest":  false,
	})

	if err != nil {
		slog.Error("failed to upgrade WebSocket connection", "user_id", userID, "err", err)
	}
}

// validateToken 验证 JWT token(统一走 utils.ParseToken:签名+过期+alg 锁定),
// 并查吊销黑名单 —— 改密/封号/单端登出后的 token 虽未自然过期,也不得再升级 WS 收推送。
// 这是 ws-ticket 迁移前的最低限度加固(原实现裸 jwt.Parse、不查吊销)。
func (h *Handler) validateToken(ctx context.Context, tokenString string) (uint, string, error) {
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")
	claims, err := utils.ParseToken(tokenString)
	if err != nil {
		return 0, "", err
	}
	if utils.IsTokenRevoked(ctx, claims) {
		return 0, "", errors.New("token revoked")
	}
	return claims.UserID, claims.Username, nil
}

// GetHub 获取 Hub 实例
func (h *Handler) GetHub() *Hub {
	return h.hub
}

