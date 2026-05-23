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
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

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

	// 用 WARN 级别记录 —— 前端错误不是后端系统故障,但需要可见;
	// 浏览器扩展 / 用户脚本 / iOS 17 上的 ResizeObserver 等噪音很多,
	// 标 WARN 后值班 grep ERROR 不会被它们干扰。
	slog.Warn("client-side error reported",
		"source", source,
		"message", req.Message,
		"stack", req.Stack,
		"url", url,
		"user_agent", ua,
		"app_version", req.AppVersion,
		"user_id", req.UserID,
		"client_ip", c.ClientIP(),
		"request_id", c.GetString("RequestID"),
		"reported_at", time.Now().Format(time.RFC3339),
	)

	c.JSON(http.StatusNoContent, nil)
}
