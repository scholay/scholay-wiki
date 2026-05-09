// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"runtime/debug"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RecoveryMiddleware 替代 gin.Recovery：
//   - 结构化日志（slog）+ request_id 关联,日志系统接入后可按此字段聚合
//   - 区分"客户端断连"（broken pipe）：不算 5xx，不打印堆栈
//   - 真 panic：返回 JSON 5xx 而非空白 body，避免前端难以诊断
//   - 全栈打印控制在 16KB 以内防日志爆量
func RecoveryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				// 客户端断连（broken pipe / connection reset）不是程序错误，静默处理
				if isBrokenPipe(r) {
					slog.Warn("client disconnected during request",
						"path", c.Request.URL.Path,
						"method", c.Request.Method,
					)
					c.Abort()
					return
				}

				stack := truncateStack(debug.Stack(), 16*1024)
				reqID := requestIDFromContext(c)

				slog.Error("panic recovered",
					"path", c.Request.URL.Path,
					"method", c.Request.Method,
					"client_ip", c.ClientIP(),
					"request_id", reqID,
					"panic", r,
					"stack", string(stack),
				)

				// 给客户端明确响应，避免空白 500 让前端无法定位
				if !c.Writer.Written() {
					c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
						"code":       5000,
						"message":    "internal server error",
						"request_id": reqID,
					})
				} else {
					c.Abort()
				}
			}
		}()
		c.Next()
	}
}

func isBrokenPipe(r any) bool {
	err, ok := r.(error)
	if !ok {
		return false
	}
	var ne *net.OpError
	if errors.As(err, &ne) {
		var se *os.SyscallError
		if errors.As(ne.Err, &se) {
			msg := strings.ToLower(se.Error())
			if strings.Contains(msg, "broken pipe") || strings.Contains(msg, "connection reset") {
				return true
			}
		}
	}
	return false
}

// requestIDFromContext 取请求 ID:
//   - 优先用 gin context 里(任何上层中间件) 写入的 RequestID
//   - 其次用客户端 X-Request-Id header(网关常带)
//   - 都没有 → 现场 mint 一个,避免空字符串无法关联日志
func requestIDFromContext(c *gin.Context) string {
	if v, ok := c.Get("RequestID"); ok {
		if s, ok := v.(string); ok && s != "" {
			return s
		}
	}
	if h := c.Request.Header.Get("X-Request-Id"); h != "" {
		return h
	}
	return uuid.NewString()
}

func truncateStack(b []byte, max int) []byte {
	if len(b) <= max {
		return b
	}
	return append(b[:max], []byte("\n... (truncated)")...)
}
