// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"context"
	"net/http"
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

// isObjectServePath 标记「一次请求里有一个大 body 在网络上传输」的端点(PDF / 附件 / 产物 / 打包 zip)。
// 传输时长取决于文件大小 × 客户端带宽, 可能远超普通请求的 15s/30s —— 大 PDF / 弱网移动端 /
// 多文件 zip 会在超时处被 ctx 掐断, 流到一半截成坏文件(性能审计 file-download)。
// 给它们更长的传输预算, 但不并入 SSE 的 15min。
//
// 🔴 2026-08-07 收窄:加了 method 参数。此前只按 path 判, 于是路径形状相同、但**没有大 body**
//
//	的请求也白拿 10min —— 具体是 `DELETE /user/attachment/:uuid`(0112 新增)与
//	`DELETE /peer-review/submissions/:id/assets/:aid`。它们都是控制面调用(删一行 + 删一个对象),
//	正常几十毫秒;给 10min 的唯一效果是**故障时 goroutine / DB 事务多挂 9 分半**, 没有任何收益。
//
// 判据是「哪一侧有大 body」, **不是**「是不是 GET」:
//   - GET / HEAD 命中 → 响应体是文件(下载), 需要长预算;
//   - POST / PUT 命中 → 请求体是文件(上传), 同样需要长预算。
//     🔴 这条不是理论补全, 是实测的既有依赖:`POST /user/library/papers/:id/pdf`(文献集 PDF 上传,
//     上限 50MB)正是靠 `HasSuffix "/pdf"` 命中本函数拿到 10min 的。若按「只对 GET 生效」收窄,
//     它会静默掉回 30s 写档 —— 弱网上传大 PDF 直接被掐, 而且是那种「偶发失败、查不出原因」的形态。
//   - DELETE / PATCH 不命中 → 两侧都是控制面小 body, 回落 30s 写档就够。
func isObjectServePath(method, path string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut:
	default:
		return false
	}
	if strings.HasSuffix(path, "/pdf") || strings.HasSuffix(path, "/download") || strings.HasSuffix(path, "/file") {
		return true
	}
	// /agent-sessions/:id/file(会话内上传文件) · /peer-review/submissions/:id/assets/:aid(投稿附件):
	// 都是从对象存储/agent 容器往客户端 stream 原文件,传输时长随文件大小,别被 15s GET 超时截断成坏文件。
	//
	// 🔴 2026-08-07 交付链路审计:产物两条子串**刻意写成 feature 无关的通配形态**,不再逐 feature 枚举。
	//    上一版是 "/claw/artifact/" + "/claw/session/artifact" —— 只覆盖 claw,而 boltslides / sci_draw /
	//    stat_lab 三份镜像后来各自挂了同构的三条路由(routes_user.go:361-363,380-382,399-401),
	//    没人回来改这里 ⇒ 它们的大 docx / deck / zip 在弱网下落 GET 15s、被 ctx 掐成坏文件。
	//    本仓库「四份镜像漂移」的又一例:补齐当下的四个 feature 只是把同一个坑推给第五个。
	//    现在按形状匹配:`/artifact/`(按 id 取) + `/session/artifact`(实时回退与 .zip 打包,
	//    也顺带覆盖 /session/artifacts 列表 —— 那个 handler 自己有 10s ctx,拿到长预算无副作用)。
	//    过度匹配的代价只是「某个 GET 拿到 10min 而非 15s」,而漏匹配的代价是用户下到坏文件。
	//    同理 `/attachment/` 写成**形状匹配**而非 `/user/attachment/`:它同时覆盖新的统一
	//    附件端点(GET /user/attachment/:uuid,0112)与老的 `/feedback/attachment/`,
	//    以后再有第三条带 attachment 的下载路由也自动在内。上面那条枚举式白名单漏了四个
	//    feature 的教训就在眼前 —— 过度匹配的代价只是「某个 GET 拿到 10min 而非 15s」,
	//    漏匹配的代价是用户下到一个截断的坏文件。
	for _, p := range []string{"/attachment/", "/artifact/", "/session/artifact", "/tools/logo/", "/submission/", "/assets/"} {
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
		} else if isObjectServePath(c.Request.Method, c.Request.URL.Path) {
			// 大文件下载/上传: 传输时长随文件大小/客户端带宽变化, 给足预算防中途截断。
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
