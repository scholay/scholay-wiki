// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"strings"

	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"

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
// 校验顺序:
//  1. 解析 token (签名 + TTL, 走 utils.ParseToken)
//  2. **查 Redis blacklist** (utils.IsTokenRevoked) — token-level (jti) 或 user-level (改密/封号);
//     Redis 故障 fail-open 放行 (见 utils/jwt_revoke.go)
//  3. 校验 type/role
//
// 真正的 "踢人" 链路:
//   - Logout 单端 → utils.RevokeToken(ctx, claims)
//   - 改密 / 管理员封号 → utils.RevokeUserAllTokens(ctx, userID)
//   - 全量失效 → 切 JWT secret (config)
// extractToken 统一从请求里取 JWT —— 全站鉴权(AuthMiddleware / OptionalUserAuthMiddleware 等)
// 都走这一处, 保证取 token 的口径一致(历史上两处各写一份, OptionalAuth 还漏了 cookie 分支)。
// 优先级: Authorization: Bearer header  >  ?token= query(SSE/EventSource 不能带 header)
//        >  scholay_token cookie(iframe / 跨页签共享会话)。
func extractToken(c *gin.Context) string {
	if authHeader := c.GetHeader("Authorization"); authHeader != "" {
		if parts := strings.SplitN(authHeader, " ", 2); len(parts) == 2 && parts[0] == "Bearer" {
			return parts[1]
		}
	}
	if q := c.Query("token"); q != "" {
		return q
	}
	if cookie, err := c.Cookie(SessionCookieName); err == nil && cookie != "" {
		return cookie
	}
	return ""
}

// activityHook 由 bootstrap 注入(user 服务):在每次通过鉴权的 user 请求上记录「最后活跃时间」。
// 放包级 var 是为了让 middleware 不反向依赖 user 包(分层)。nil = 不记。
// 实现侧(user.Service.RecordActivity)自带「全异步 + Redis 节流」,本中间件调用零开销。
var activityHook func(userID uint)

// SetActivityHook 注入「最后活跃」记录器。bootstrap 调一次。
func SetActivityHook(fn func(userID uint)) { activityHook = fn }

func AuthMiddleware(requiredType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			utils.Unauthorized(c, "未登录,请先登录")
			c.Abort()
			return
		}
		claims, err := utils.ParseToken(token)
		if err != nil {
			// token 自然过期 / 签名错 / 篡改 — 业务码 errcode.TokenExpired,
			// 前端区分这种 "用户在过期前没续上" vs "被吊销" (TokenRevoked) → 不同 UI 文案。
			utils.UnauthorizedWithCode(c, errcode.TokenExpired, "登录已过期,请重新登录")
			c.Abort()
			return
		}

		// Blacklist 校验: 改密 / 单端登出 / 封号 都会在这里被拦。Redis 故障 fail-open 放行。
		if utils.IsTokenRevoked(c.Request.Context(), claims) {
			utils.UnauthorizedWithCode(c, errcode.TokenRevoked, "登录已失效,请重新登录")
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
			// 已登录但角色/类型不匹配 = 无权限, 用 403(不是 401)。
			// 否则前端 isAuthError 会把它当"认证失效"→ 把一个有效登录用户直接登出。
			utils.ForbiddenWithCode(c, errcode.Forbidden, "无权访问该资源")
			c.Abort()
			return
		}
		// admin 路由：放行 admin / super_admin（兼容旧 type=admin token）
		if requiredType == "admin" && !(claims.Type == "admin" || (claims.Type == "user" && (role == "admin" || role == "super_admin"))) {
			// 已登录但角色/类型不匹配 = 无权限, 用 403(不是 401)。
			// 否则前端 isAuthError 会把它当"认证失效"→ 把一个有效登录用户直接登出。
			utils.ForbiddenWithCode(c, errcode.Forbidden, "无权访问该资源")
			c.Abort()
			return
		}
		// super_admin 路由：仅放行 role=super_admin
		if requiredType == "super_admin" && !(claims.Type == "user" && role == "super_admin") {
			// 已登录但角色/类型不匹配 = 无权限, 用 403(不是 401)。
			// 否则前端 isAuthError 会把它当"认证失效"→ 把一个有效登录用户直接登出。
			utils.ForbiddenWithCode(c, errcode.Forbidden, "无权访问该资源")
			c.Abort()
			return
		}

		// Store claims in context
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("user_type", claims.Type)
		c.Set("user_role", role)
		c.Set("token", token) // 保存 token 供后续使用

		// 记「最后活跃时间」: 反映用户最后实际使用(而非仅登录动作)。只对 user 类型 token;
		// 实现侧全异步 + Redis 节流(≤每用户每 5min 一次 DB 写),不阻塞请求。
		if activityHook != nil && claims.Type == "user" && claims.UserID != 0 {
			activityHook(claims.UserID)
		}

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
		token := extractToken(c)

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

		// 被显式吊销的 token(改密/封号/在别处登出)即使在 optional 端点也要**拒绝**, 回 401 TokenRevoked,
		// 让前端 notifyAuthLost 感知到"登录已失效"并清状态 + 弹登录框 —— 否则 token 已废、UI 却一直显示已登录。
		// (无 token / 解析失败 仍按匿名放行, 见上面两个分支;只有"有效但被吊销"才拒。)
		if utils.IsTokenRevoked(c.Request.Context(), claims) {
			utils.UnauthorizedWithCode(c, errcode.TokenRevoked, "登录已失效,请重新登录")
			c.Abort()
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
