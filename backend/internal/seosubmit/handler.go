// ============================================================================
// Scholay学术 V1.0
// IndexNow Key 文件验证 handler
//
// IndexNow 协议要求:站点根目录必须能 200 响应 GET /{key}.txt 且 body == key。
// 只有这样搜索引擎才信任 POST 来的推送是合法操作者。
// ============================================================================

package seosubmit

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// RegisterKeyFileRoute 注册 GET /{key}.txt 路由,返回 INDEXNOW_KEY 内容。
//
// 路由模式:为了不与其它静态文件冲突,只对"路径长度 8-128 + 全字符是 a-z A-Z 0-9 - 的 .txt"
// 命中本 handler;其它 .txt(如 ads.txt)继续走 SPA 兜底。
//
// 没配 key 时不注册任何路由(避免暴露空文件)。
func RegisterKeyFileRoute(router *gin.Engine, svc *Service) {
	if svc == nil {
		return
	}
	key := svc.IndexNowKey()
	if !isValidIndexNowKey(key) {
		return
	}
	expectedPath := "/" + key + ".txt"

	// 只对精确路径响应,避免误匹配其它 .txt
	router.GET(expectedPath, func(c *gin.Context) {
		c.Header("Content-Type", "text/plain; charset=utf-8")
		c.Header("Cache-Control", "public, max-age=86400")
		c.String(http.StatusOK, key)
	})
	// HEAD 必须同样 200:gin 的 GET 路由不覆盖 HEAD,缺了会 404。
	// 2026-08-10 线上实测:GET /{key}.txt 200 但 HEAD 404 —— 引擎侧抓取器若先发
	// HEAD 预检(协议未禁止),就会把 key 文件判为不可达,进而 403 UserForbiddedToAccessSite。
	router.HEAD(expectedPath, func(c *gin.Context) {
		c.Header("Content-Type", "text/plain; charset=utf-8")
		c.Header("Cache-Control", "public, max-age=86400")
		c.Header("Content-Length", strconv.Itoa(len(key)))
		c.Status(http.StatusOK)
	})
}

// isValidIndexNowKey 协议规范:8-128 个字符,允许 a-z A-Z 0-9 - 这四类
func isValidIndexNowKey(key string) bool {
	n := len(key)
	if n < 8 || n > 128 {
		return false
	}
	for _, r := range key {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-':
		default:
			return false
		}
	}
	// 防止误注册成 ".txt"(只有连字符也得有点限制)
	return strings.TrimLeft(key, "-") != ""
}
