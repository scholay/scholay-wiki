package middleware

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// InternalAgentAuthMiddleware 保护 /api/v1/internal/* 这类「scholar_agent 容器内网回调后端」的端点。
//
// 鉴权用内网共享密钥 Bearer = AGENT_AUTH_TOKEN(与 agent 容器 ANTHROPIC_API_KEY 同源,
// 即 docker-compose 的 AGENT_INTERNAL_TOKEN)。常数时间比较防计时侧信道。**无 user 身份**
// (agent 没有用户上下文,归属由后端按 sessionId 反查)。
//
// token 未配置(空)→ 一律 401(fail-closed),绝不放行空 token 写入。
// 该端点本就只在内网可达(nginx 另有 deny 公网 /api/v1/internal/ 作纵深防御)。
func InternalAgentAuthMiddleware() gin.HandlerFunc {
	want := strings.TrimSpace(os.Getenv("AGENT_AUTH_TOKEN"))
	return func(c *gin.Context) {
		if want == "" {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		got := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
		if subtle.ConstantTimeCompare([]byte(got), []byte(want)) != 1 {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		c.Next()
	}
}
