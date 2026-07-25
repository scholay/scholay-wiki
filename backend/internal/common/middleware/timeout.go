// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"context"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// isStreamingPath checks if the request path is a streaming endpoint
// that requires a longer timeout (e.g., SSE, AI chat, analysis).
func isStreamingPath(path string) bool {
	// 任何以 /stream 结尾的端点都是 SSE (覆盖 /peer-review/submissions/:id/stream 这种带参数的,
	// 旧的 "/peer-review/stream" 字面匹配匹配不到 → SSE 被默认 15s 超时掐断, 流式中途断流)。
	if strings.HasSuffix(path, "/stream") {
		return true
	}
	streamingPatterns := []string{
		"/chat/stream",
		"/advanced-search",
		"/continue",
		"/analysis",
		"/translate/stream",
		// upload-and-resolve 是 SSE 但路径不以 /stream 结尾(library 秒传解析流),补进白名单让它由【路径】
		// 而非仅靠请求 Accept 头拿到长超时(性能审计 P0:更稳,不依赖客户端是否发 Accept)。
		"/upload-and-resolve",
	}
	for _, pattern := range streamingPatterns {
		if strings.Contains(path, pattern) {
			return true
		}
	}
	return false
}

// isObjectServePath 标记「从对象存储往客户端 stream 下载大文件」的端点(PDF / 附件 / 产物 / 打包 zip)。
// 这些是 GET, 但传输时长取决于文件大小 × 客户端带宽, 可能远超普通读请求的 15s —— 大 PDF /
// 弱网移动端 / 多文件 zip 会在 15s 处被 ctx 掐断, 流到一半截成坏文件(性能审计 file-download)。
// 给它们更长的传输预算, 但不并入 SSE 的 15min。
func isObjectServePath(path string) bool {
	if strings.HasSuffix(path, "/pdf") || strings.HasSuffix(path, "/download") || strings.HasSuffix(path, "/file") {
		return true
	}
	// /agent-sessions/:id/file(会话内上传文件) · /peer-review/submissions/:id/assets/:aid(投稿附件):
	// 都是从对象存储/agent 容器往客户端 stream 原文件,传输时长随文件大小,别被 15s GET 超时截断成坏文件。
	// 注:补 /claw/session/artifact —— 覆盖实时回退下载 /claw/session/artifact 与打包 /claw/session/artifact.zip
	// (路由 routes_user.go:304-305)。旧列表只有 /claw/artifact/(按 id 取),这两个子串匹配不到 → 落 GET 15s
	// 被掐成坏 zip(性能审计 P0)。
	for _, p := range []string{"/feedback/attachment/", "/claw/artifact/", "/claw/session/artifact", "/tools/logo/", "/submission/", "/assets/"} {
		if strings.Contains(path, p) {
			return true
		}
	}
	return false
}

// APITimeoutMiddleware provides different timeouts for different API types.
// Streaming endpoints (SSE, AI chat) get 15 minutes (硬上限，避免慢客户端让 goroutine 无限累积);
// write ops get 30s; reads get 15s.
//
// 说明：流式接口在 handler 层通过 sse.BeginStream 启动 30s 心跳保持连接活跃，
// 客户端断开后 c.Request.Context() 会随 gin 自动取消；此处的硬上限是最后一道保险。
func APITimeoutMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var timeout time.Duration

		if strings.HasSuffix(c.Request.URL.Path, "/export-pptx") {
			// 制作PPT 导出 pptx:executor 同步逐张 chromium 截图(每张含 chromium 冷启),秒到分钟级,给足预算。
			timeout = 6 * time.Minute
		} else if c.GetHeader("Accept") == "text/event-stream" || isStreamingPath(c.Request.URL.Path) {
			timeout = 15 * time.Minute
		} else if isObjectServePath(c.Request.URL.Path) {
			// 大文件下载: 传输时长随文件大小/客户端带宽变化, 给足预算防中途截断。
			// (各 handler 自己仍可在此预算内用更短的 ctx, 如 claw artifact 的 10s。)
			timeout = 10 * time.Minute
		} else if c.Request.Method == "POST" || c.Request.Method == "PUT" || c.Request.Method == "PATCH" || c.Request.Method == "DELETE" {
			// 写操作(含 PATCH/DELETE):30s。旧逻辑只判 POST/PUT → PATCH/DELETE 落到 else 的 15s 读档,
			// 偶发的稍慢写(如批量删除)会被误掐(性能审计)。
			timeout = 30 * time.Second
		} else {
			timeout = 15 * time.Second
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}
