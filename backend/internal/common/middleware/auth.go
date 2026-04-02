// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// 会话缓存配置
const (
	// SessionCachePrefix Redis 缓存前缀
	SessionCachePrefix = "session:"
	// SessionCacheTTL 会话缓存过期时间（5分钟）
	// 这个时间内不会再查询数据库
	SessionCacheTTL = 5 * time.Minute
)

// SessionValidator 会话验证器接口
type SessionValidator interface {
	ValidateSession(ctx context.Context, token string) bool
	InvalidateSession(token string)
	InvalidateUserSessions(userID uint)
}

// CachedSessionValidator 基于 Redis 缓存的会话验证器
type CachedSessionValidator struct {
	db    *gorm.DB
	redis *redis.Client
}

// NewCachedSessionValidator 创建带缓存的会话验证器
func NewCachedSessionValidator(db *gorm.DB) *CachedSessionValidator {
	return &CachedSessionValidator{
		db:    db,
		redis: cache.GetRedis(),
	}
}

// hashToken 对 token 进行哈希，用作缓存 key（避免 key 过长）
func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:16]) // 取前16字节，32个字符
}

// ValidateSession 验证会话是否存在（带缓存）
func (v *CachedSessionValidator) ValidateSession(ctx context.Context, token string) bool {
	cacheKey := SessionCachePrefix + hashToken(token)

	// 1. 先查 Redis 缓存
	result, err := v.redis.Get(ctx, cacheKey).Result()
	if err == nil {
		// 缓存命中
		return result == "1"
	}

	// 2. 缓存未命中，查询数据库
	var count int64
	v.db.Model(&model.UserSession{}).Where("token = ?", token).Count(&count)
	valid := count > 0

	// 3. 写入缓存
	// "1" 表示有效，"0" 表示无效
	cacheValue := "0"
	if valid {
		cacheValue = "1"
	}
	if err := v.redis.Set(ctx, cacheKey, cacheValue, SessionCacheTTL).Err(); err != nil {
		slog.Warn("Failed to cache session", "err", err)
	}

	return valid
}

// InvalidateSession 使单个会话缓存失效
func (v *CachedSessionValidator) InvalidateSession(token string) {
	ctx := context.Background()
	cacheKey := SessionCachePrefix + hashToken(token)
	if err := v.redis.Del(ctx, cacheKey).Err(); err != nil {
		slog.Warn("Failed to invalidate session cache", "err", err)
	}
}

// InvalidateUserSessions 使用户的所有会话缓存失效
// 注意：这个方法会遍历用户的所有会话，在登录时调用
func (v *CachedSessionValidator) InvalidateUserSessions(userID uint) {
	ctx := context.Background()

	// 查询用户的所有会话 token
	var tokens []string
	v.db.Model(&model.UserSession{}).
		Where("user_id = ?", userID).
		Pluck("token", &tokens)

	if len(tokens) == 0 {
		return
	}

	// 批量删除所有缓存（单次 Redis 往返）
	keys := make([]string, len(tokens))
	for i, token := range tokens {
		keys[i] = SessionCachePrefix + hashToken(token)
	}
	if err := v.redis.Del(ctx, keys...).Err(); err != nil {
		slog.Warn("Failed to batch invalidate session cache", "err", err, "count", len(keys))
	}
}

// 全局会话验证器（由 main 函数设置）
var globalSessionValidator SessionValidator

// SetSessionValidator 设置全局会话验证器
func SetSessionValidator(v SessionValidator) {
	globalSessionValidator = v
}

// GetSessionValidator 获取全局会话验证器
func GetSessionValidator() SessionValidator {
	return globalSessionValidator
}

// AuthMiddleware validates JWT tokens
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

		if token == "" {
			utils.Unauthorized(c, "Authorization header or token query parameter is required")
			c.Abort()
			return
		}
		claims, err := utils.ParseToken(token)
		if err != nil {
			utils.Unauthorized(c, "Invalid or expired token")
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
			utils.Unauthorized(c, "Insufficient permissions")
			c.Abort()
			return
		}
		if requiredType == "admin" && !(claims.Type == "admin" || (claims.Type == "user" && role == "admin")) {
			utils.Unauthorized(c, "Insufficient permissions")
			c.Abort()
			return
		}

		// 验证会话是否存在（单点登录检查）
		// 统一用户体系中的管理员同样复用 user session。
		// 兼容旧管理端 token（type=admin）时不做 session 校验。
		if claims.Type == "user" {
			if globalSessionValidator == nil {
				slog.Warn("Global session validator is nil")
			} else {
				valid := globalSessionValidator.ValidateSession(c.Request.Context(), token)
				if !valid {
					tokenPreview := token
					if len(tokenPreview) > 50 {
						tokenPreview = tokenPreview[:50]
					}
					slog.Warn("Session not found for token", "tokenPreview", tokenPreview)
					utils.Error(c, 2019, "您的账号已在其他设备登录")
					c.Abort()
					return
				}
			}
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

// AdminAuthMiddleware validates admin JWT tokens
func AdminAuthMiddleware() gin.HandlerFunc {
	return AuthMiddleware("admin")
}

// UserAuthMiddleware validates user JWT tokens
func UserAuthMiddleware() gin.HandlerFunc {
	return AuthMiddleware("user")
}
