// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"strings"

	"scholar-backend/internal/common/config"

	"github.com/gin-gonic/gin"
)

// CORSMiddleware 处理跨域请求
// 生产环境中由 Nginx 处理 CORS，此中间件主要用于本地开发
// 支持通过 CORS_ALLOWED_ORIGINS 环境变量配置允许的源（逗号分隔）
// 未配置时允许 localhost 和 127.0.0.1 的所有端口
func CORSMiddleware() gin.HandlerFunc {
	allowedOrigins := parseAllowedOrigins()

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && isOriginAllowed(origin, allowedOrigins) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func parseAllowedOrigins() []string {
	env := ""
	if config.AppConfig != nil {
		env = config.AppConfig.App.CORSAllowedOrigins
	}
	if env == "" {
		return nil
	}
	origins := strings.Split(env, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return origins
}

func isOriginAllowed(origin string, allowedOrigins []string) bool {
	if len(allowedOrigins) > 0 {
		for _, allowed := range allowedOrigins {
			if allowed == "*" || origin == allowed {
				return true
			}
		}
		return false
	}

	// 默认：允许本地开发域名
	return strings.HasPrefix(origin, "http://localhost") ||
		strings.HasPrefix(origin, "http://127.0.0.1") ||
		strings.HasPrefix(origin, "https://localhost") ||
		strings.HasPrefix(origin, "https://127.0.0.1")
}
