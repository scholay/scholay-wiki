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
	"go.opentelemetry.io/otel/trace"
)

// RecoveryMiddleware 替代 gin.Recovery：
//   - 结构化日志（slog）+ trace_id 关联，便于 SigNoz 内查询
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
				traceID := traceIDFromContext(c)

				slog.Error("panic recovered",
					"path", c.Request.URL.Path,
					"method", c.Request.Method,
					"client_ip", c.ClientIP(),
					"trace_id", traceID,
					"panic", r,
					"stack", string(stack),
				)

				// 给客户端明确响应，避免空白 500 让前端无法定位
				if !c.Writer.Written() {
					c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
						"code":     5000,
						"message":  "internal server error",
						"trace_id": traceID,
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

func traceIDFromContext(c *gin.Context) string {
	span := trace.SpanFromContext(c.Request.Context())
	if !span.SpanContext().IsValid() {
		return ""
	}
	return span.SpanContext().TraceID().String()
}

func truncateStack(b []byte, max int) []byte {
	if len(b) <= max {
		return b
	}
	return append(b[:max], []byte("\n... (truncated)")...)
}
