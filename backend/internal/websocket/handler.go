// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package websocket

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Handler WebSocket HTTP 处理器
type Handler struct {
	hub       *Hub
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
// 认证方式：URL 查询参数 ?token=xxx
func (h *Handler) HandleWebSocket(c *gin.Context) {
	// 从查询参数获取 token
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": "Missing token",
		})
		return
	}

	// 验证 token
	userID, username, err := h.validateToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": "Invalid token: " + err.Error(),
		})
		return
	}

	// 获取 melody 实例并升级连接
	m := h.hub.GetMelody()

	// 在升级前设置用户信息到请求上下文
	// melody 会在 HandleConnect 中通过 session.Get 获取
	err = m.HandleRequestWithKeys(c.Writer, c.Request, map[string]interface{}{
		"user_id":  userID,
		"username": username,
	})

	if err != nil {
		fmt.Printf("[WebSocket] Failed to upgrade connection for user %d: %v\n", userID, err)
	}
}

// validateToken 验证 JWT token
func (h *Handler) validateToken(tokenString string) (uint, string, error) {
	// 移除 Bearer 前缀（如果有）
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")

	// 解析 token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// 验证签名方法
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(h.jwtSecret), nil
	})

	if err != nil {
		return 0, "", err
	}

	// 提取 claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return 0, "", fmt.Errorf("invalid token claims")
	}

	// 获取用户ID
	userIDFloat, ok := claims["user_id"].(float64)
	if !ok {
		return 0, "", fmt.Errorf("user_id not found in token")
	}
	userID := uint(userIDFloat)

	// 获取用户名（可选）
	username, _ := claims["username"].(string)

	return userID, username, nil
}

// GetHub 获取 Hub 实例
func (h *Handler) GetHub() *Hub {
	return h.hub
}

