// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package clientlog 暴露 /api/v1/log/client-error 给前端上报浏览器侧错误。
//
// 为什么需要:前端跑在用户浏览器里,console.error 不会落到 docker logs。
// 没有外部观测平台(SigNoz/Sentry/...)的情况下,只有让前端主动 POST 给后端,
// 后端 slog.Error 后才能在 `docker logs scholar_backend` 里看到。
//
// 注意限制(防滥用):
//   - 不需要用户登录(未登录也可能崩,得让它能报)
//   - rate-limit 在路由层(IP-based,通用 RateLimitMiddleware)
//   - payload 长度限制 8KB,避免被刷大日志撑爆磁盘
//   - 仅写日志,不入库,不告警(用户量起来后再考虑接告警系统)
package clientlog

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// thirdPartyNoiseMarkers — 已知与本应用无关的客户端错误特征(第三方脚本 / 浏览器扩展 /
// 浏览器自身 bug)。命中则降到 DEBUG(release 下不输出),避免值班把它们当成我方前端崩溃。
// 匹配错误的 message / stack / url(小写后做子串匹配)。
var thirdPartyNoiseMarkers = []string{
	"clarity.ms",                 // 微软 Clarity 体验分析脚本
	"googletagmanager",           // GA/GTM
	"google-analytics",           //
	"gtag/js",                    //
	"hm.baidu.com",               // 百度统计
	"resizeobserver loop",        // 浏览器已知良性告警, 非真崩溃
	"extension context",          // 浏览器扩展失效
	"chrome-extension://",        // 扩展注入脚本
	"moz-extension://",           //
	"safari-extension://",        //
	"script error.",              // 跨域脚本不透明错误, 拿不到栈, 无可分析价值
	"top.gg",                     //
}

// isThirdPartyNoise 判断一条前端上报是否属于上面的已知噪音。
func isThirdPartyNoise(message, stack, url string) bool {
	hay := strings.ToLower(message + "\n" + stack + "\n" + url)
	for _, m := range thirdPartyNoiseMarkers {
		if strings.Contains(hay, m) {
			return true
		}
	}
	return false
}

// MaxPayloadBytes 单条 payload 上限(message + stack + 元数据合起来,utf8 字节)。
// 浏览器抓到的 stack trace 通常 1-3KB,留余量到 8KB 防截断丢失关键信息。
const MaxPayloadBytes = 8 * 1024

// ClientErrorReport 前端上报体。所有字段可选(为了让最简单的 onerror 也能上报),
// 但 Message 没值时直接拒掉 —— 避免空错报扰乱日志。
type ClientErrorReport struct {
	// 必填:错误简述,通常是 Error.message
	Message string `json:"message" binding:"required,max=512"`
	// JavaScript stack trace(可选)
	Stack string `json:"stack" binding:"max=6144"`
	// 触发错误时所在页面 URL —— 没传就用 Referer 兜底
	URL string `json:"url" binding:"max=512"`
	// 错误来源类型:'window-error' / 'unhandled-rejection' / 'react-error-boundary' / 'manual'
	Source string `json:"source" binding:"max=64"`
	// 浏览器 navigator.userAgent(可选,header 也会取一份)
	UserAgent string `json:"user_agent" binding:"max=512"`
	// 应用版本 / git SHA(可选,前端 build 时注入)
	AppVersion string `json:"app_version" binding:"max=64"`
	// 用户 ID(可选)—— 后端会从 JWT context 里再取一遍校对
	UserID uint `json:"user_id"`
}

// Handler 持有依赖。当前无,留作未来扩展(如注入用户 service 反查名字)。
type Handler struct{}

// NewHandler creates a new client log handler.
func NewHandler() *Handler { return &Handler{} }

// ReportClientError POST /api/v1/log/client-error
// 不要求登录(未登录用户也可能触发崩溃),但走 IP 限流以防滥用。
func (h *Handler) ReportClientError(c *gin.Context) {
	var req ClientErrorReport
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "invalid payload")
		return
	}

	// 兜底:URL 缺时取 Referer
	url := req.URL
	if url == "" {
		url = c.Request.Referer()
	}
	ua := req.UserAgent
	if ua == "" {
		ua = c.Request.UserAgent()
	}
	source := req.Source
	if source == "" {
		source = "manual"
	}

	// 已知第三方/扩展/浏览器自身噪音 → DEBUG(release 下不输出);其余前端错误 → WARN。
	// 前端错误不是后端系统故障,但 WARN 可见;值班 grep ERROR 不会被它们干扰。
	level := slog.LevelWarn
	if isThirdPartyNoise(req.Message, req.Stack, url) {
		level = slog.LevelDebug
	}
	slog.LogAttrs(c.Request.Context(), level, "client-side error reported",
		slog.String("source", source),
		slog.String("message", req.Message),
		slog.String("stack", req.Stack),
		slog.String("url", url),
		slog.String("user_agent", ua),
		slog.String("app_version", req.AppVersion),
		slog.Uint64("user_id", uint64(req.UserID)),
		slog.String("client_ip", c.ClientIP()),
		slog.String("request_id", c.GetString("RequestID")),
		slog.String("reported_at", time.Now().Format(time.RFC3339)),
	)

	c.JSON(http.StatusNoContent, nil)
}
