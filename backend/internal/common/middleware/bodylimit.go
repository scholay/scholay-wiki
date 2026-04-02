// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const (
	DefaultMaxBodySize = 10 << 20 // 10 MB
)

// BodyLimitMiddleware rejects requests whose body exceeds maxBytes.
// This prevents oversized payloads from exhausting server memory.
func BodyLimitMiddleware(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}
