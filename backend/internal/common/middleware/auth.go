// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"scholar-backend/internal/common/utils"
	"strings"

	"github.com/gin-gonic/gin"
)

// SessionCookieName 浏览器 cookie 名,用于 iframe / 跨页签共享会话:
//   - 主流 axios 调用走 Authorization: Bearer header(localStorage)
//   - iframe(如 admin /analytics 嵌入的 umami)无法自带 header,只能靠 cookie
//   - 前端在 admin 登录成功后镜像写一份 token 到这个 cookie (SameSite=Strict)
//
// nginx admin server 用 `auth_request` 把 umami 路径打到 /api/v1/admin/_session-check,
// 后者只要走 AdminAuthMiddleware 通过就 200,nginx 放行;否则 401 拦截。
const SessionCookieName = "scholay_token"

// AuthMiddleware validates JWT tokens.
//
// 会话校验完全靠 JWT 自身签名 + TTL —— 没有数据库 session 表兜底,JWT 一旦签发
// 在过期前都视为有效。需要服务端踢人的话,改密码 / 旋转 JWT secret 是唯一手段。
func AuthMiddleware(requiredType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var token string

		// Try to get token from Authorization header first
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			// Extract token from "Bearer <token>"
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				token = parts[1]
			}
		}

		// Fallback to query parameter (for SSE/EventSource support)
		if token == "" {
			token = c.Query("token")
		}

		// Fallback to cookie (iframe / 跨页签场景 —— 见 SessionCookieName 注释)
		if token == "" {
			if cookie, err := c.Cookie(SessionCookieName); err == nil {
				token = cookie
			}
		}

		if token == "" {
			utils.Unauthorized(c, "未登录,请先登录")
			c.Abort()
			return
		}
		claims, err := utils.ParseToken(token)
		if err != nil {
			utils.Unauthorized(c, "登录已过期,请重新登录")
			c.Abort()
			return
		}

		role := claims.Role
		if role == "" {
			if claims.Type == "admin" {
				role = "admin"
			} else {
				role = "user"
			}
		}

		// Check user type/role if required
		if requiredType == "user" && claims.Type != "user" {
			utils.Unauthorized(c, "无权访问该资源")
			c.Abort()
			return
		}
		// admin 路由：放行 admin / super_admin（兼容旧 type=admin token）
		if requiredType == "admin" && !(claims.Type == "admin" || (claims.Type == "user" && (role == "admin" || role == "super_admin"))) {
			utils.Unauthorized(c, "无权访问该资源")
			c.Abort()
			return
		}
		// super_admin 路由：仅放行 role=super_admin
		if requiredType == "super_admin" && !(claims.Type == "user" && role == "super_admin") {
			utils.Unauthorized(c, "无权访问该资源")
			c.Abort()
			return
		}

		// Store claims in context
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("user_type", claims.Type)
		c.Set("user_role", role)
		c.Set("token", token) // 保存 token 供后续使用

		c.Next()
	}
}

// AdminAuthMiddleware validates admin JWT tokens (admin 或 super_admin 均可)
func AdminAuthMiddleware() gin.HandlerFunc {
	return AuthMiddleware("admin")
}

// SuperAdminAuthMiddleware 仅允许 super_admin 通过，用于角色分配等高权限操作
func SuperAdminAuthMiddleware() gin.HandlerFunc {
	return AuthMiddleware("super_admin")
}

// UserAuthMiddleware validates user JWT tokens
func UserAuthMiddleware() gin.HandlerFunc {
	return AuthMiddleware("user")
}

// OptionalUserAuthMiddleware extracts user_id from JWT if present, but allows anonymous access.
// If a valid token is provided, user_id is set in context. Otherwise, request proceeds without user_id.
func OptionalUserAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var token string

		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				token = parts[1]
			}
		}

		if token == "" {
			token = c.Query("token")
		}

		// No token — proceed as anonymous
		if token == "" {
			c.Next()
			return
		}

		claims, err := utils.ParseToken(token)
		if err != nil {
			// Invalid token — proceed as anonymous (don't reject)
			c.Next()
			return
		}

		if claims.Type != "user" {
			c.Next()
			return
		}

		role := claims.Role
		if role == "" {
			role = "user"
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("user_type", claims.Type)
		c.Set("user_role", role)
		c.Set("token", token)

		c.Next()
	}
}
