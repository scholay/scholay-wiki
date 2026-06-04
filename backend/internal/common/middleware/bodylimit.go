// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"net/http"
	"strings"

	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

const (
	DefaultMaxBodySize = 10 << 20 // 10 MB
	// UploadMaxBodySize 通用上传上限 (50 MB) — 适用 PDF / 图片 / 文本附件.
	// 比 DefaultMaxBodySize 大, 用 UploadLimitMiddleware 替代专挂在 /upload 路由上。
	UploadMaxBodySize = 50 << 20
)

// BodyLimitMiddleware rejects requests whose body exceeds maxBytes.
// This prevents oversized payloads from exhausting server memory.
//
// 但 multipart/form-data 文件上传**不**在这里限。原因: 这道全局中间件用
// http.MaxBytesReader 把 body 包死在 maxBytes(默认 10MB)。各上传路由后面再挂的
// UploadLimitMiddleware(50MB) 是在已包过的 reader 外**再包一层** —— MaxBytesReader
// 不会解包/放大, 内层 10MB 先报错, 于是 per-route 的 50MB 被彻底架空, 全平台文件上传
// 被悄悄卡在 10MB(claw/feedback/library/peer-review 都中招)。
// 改法: multipart 请求直接放行, 体积交给各自路由的 UploadLimitMiddleware 或 handler 内的
// ContentLength / FileHeader.Size 守门(它们都比 10MB 大且各自合理)。非上传的 JSON 等
// 请求仍按 maxBytes 限, DoS 防护不变。
func BodyLimitMiddleware(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if strings.HasPrefix(c.GetHeader("Content-Type"), "multipart/form-data") {
			c.Next()
			return
		}
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}

// UploadLimitMiddleware — 给所有 /upload 类路由共享的中间件:
//  1. body size 上限 (默认 50MB, 调用方可传不同 maxBytes)
//  2. body 超限时返回结构化错误码 (errcode.UploadTooLarge=7001), 让前端可以做特殊提示
//
// 用法 (各 feature 的 upload 路由):
//
//	g.POST("/upload", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.Upload)
//
// 不强制立刻给所有 upload 路由都套上 — 但新加 upload 路由必须用这个;
// 旧 upload 路由 (claw / feedback / library) 在重构时一起接入。
func UploadLimitMiddleware(maxBytes int64) gin.HandlerFunc {
	if maxBytes <= 0 {
		maxBytes = UploadMaxBodySize
	}
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		// 实际超限 detection 发生在 handler 读 body 时 (MaxBytesReader 返回 error),
		// 这里给 handler 一次机会拦, 但如果 handler 没拦也走 recovery middleware 兜底。
		// 同时把 ContentLength 校验前置: 客户端如果在 Content-Length 头声明了超大值,
		// 直接 reject 不等 body 读完。
		if c.Request.ContentLength > maxBytes {
			utils.ErrorWithStatus(c, http.StatusRequestEntityTooLarge,
				errcode.UploadTooLarge, "文件过大,单文件上限 50MB")
			c.Abort()
			return
		}
		c.Next()
	}
}
