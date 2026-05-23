// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RequestIDMiddleware 为每次请求注入唯一 RequestID。
//
// 优先级:
//   1. 已有 X-Request-Id header(网关 / 反向代理常带,例如 nginx ngx_http_realip_module)
//      → 直接复用,保证跨服务链路里 ID 一致
//   2. 否则现场 mint 一个 UUIDv4
//
// 注入位置:
//   - gin.Context.Set("RequestID", id)     —— 业务代码和 utils.requestIDFrom 读这里
//   - 响应头 X-Request-Id: <id>             —— 给客户端,用户上报 issue 时附带能精准定位
//   - 任何 slog 调用如果带上 "request_id": id,日志系统(目前是 docker logs)能用 grep 串起来
//
// 必须挂在 RecoveryMiddleware 之前 —— 那边 panic 处理依赖这个值才能 fallback。
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Request.Header.Get("X-Request-Id")
		if id == "" {
			id = uuid.NewString()
		}
		c.Set("RequestID", id)
		c.Writer.Header().Set("X-Request-Id", id)
		c.Next()
	}
}
