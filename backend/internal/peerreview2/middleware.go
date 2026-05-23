// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// peerreview2/middleware.go —— 设备识别中间件,用于匿名试用的 1 次/天硬限。
// 与老 peerreview 的 prv_device_id cookie 隔离,使用 prv2_device_id 独立空间。

package peerreview2

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	deviceIDCookieName   = "prv2_device_id"
	deviceIDCookieMaxAge = 365 * 24 * 60 * 60
	ctxKeyDeviceID       = "pr2_device_id"
	ctxKeyIPUAHash       = "pr2_ip_ua_hash"
)

// DeviceIDMiddleware 保证请求带 prv2_device_id cookie;不存在则下发 64 字符 hex UUID。
// 同时把 device_id 与 ip_ua_hash 写入 gin.Context,handler 可直接取用。
func DeviceIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		deviceID, err := c.Cookie(deviceIDCookieName)
		if err != nil || len(deviceID) != 64 {
			deviceID = generateDeviceID()
			secure := c.Request.TLS != nil ||
				strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
			c.SetSameSite(http.SameSiteLaxMode)
			c.SetCookie(deviceIDCookieName, deviceID, deviceIDCookieMaxAge,
				"/", "", secure, true /* HttpOnly */)
		}
		c.Set(ctxKeyDeviceID, deviceID)
		c.Set(ctxKeyIPUAHash, hashIPUA(c.ClientIP(), c.GetHeader("User-Agent")))
		c.Next()
	}
}

// GetDeviceID 从 ctx 取设备 id
func GetDeviceID(c *gin.Context) string {
	if v, ok := c.Get(ctxKeyDeviceID); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// GetIPUAHash 从 ctx 取 ip+ua 哈希
func GetIPUAHash(c *gin.Context) string {
	if v, ok := c.Get(ctxKeyIPUAHash); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func generateDeviceID() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func hashIPUA(ip, ua string) string {
	h := sha256.Sum256([]byte(ip + "|" + ua))
	return hex.EncodeToString(h[:])
}

// generateAnonToken 生成 64 字符 anon token (匿名会话归属凭证)
func generateAnonToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// hashPDFContent 计算 PDF 内容哈希,用作幂等键的一部分。
// 取 sha256 前 32 hex 字符,与 user_id/anon_token 拼接生成稳定 client_request_id。
func hashPDFContent(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:16]) // 32 hex chars
}
