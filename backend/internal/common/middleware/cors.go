// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/common/config"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORSMiddleware 处理跨域请求
// 生产环境中由 Nginx 处理 CORS，此中间件主要用于本地开发
// 支持通过 CORS_ALLOWED_ORIGINS 环境变量配置允许的源（逗号分隔）
// 未配置时允许 localhost 和 127.0.0.1 的所有端口
func CORSMiddleware() gin.HandlerFunc {
	allowedOrigins := parseAllowedOrigins()

	corsConfig := cors.Config{
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders: []string{
			"Content-Type", "Content-Length", "Accept-Encoding",
			"X-CSRF-Token", "Authorization", "Accept", "Origin",
			"Cache-Control", "X-Requested-With",
		},
		MaxAge: 12 * time.Hour,
	}

	if len(allowedOrigins) > 0 {
		hasWildcard := false
		for _, o := range allowedOrigins {
			if o == "*" {
				hasWildcard = true
				break
			}
		}

		if hasWildcard {
			slog.Warn("CORS: wildcard origin (*) configured — credentials disabled. Set explicit origins for production.")
			corsConfig.AllowAllOrigins = true
			corsConfig.AllowCredentials = false
		} else {
			corsConfig.AllowOrigins = allowedOrigins
			corsConfig.AllowCredentials = true
		}
	} else {
		// 默认：允许本地开发域名
		corsConfig.AllowOriginFunc = func(origin string) bool {
			return strings.HasPrefix(origin, "http://localhost") ||
				strings.HasPrefix(origin, "http://127.0.0.1") ||
				strings.HasPrefix(origin, "https://localhost") ||
				strings.HasPrefix(origin, "https://127.0.0.1")
		}
		corsConfig.AllowCredentials = true
	}

	return cors.New(corsConfig)
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
