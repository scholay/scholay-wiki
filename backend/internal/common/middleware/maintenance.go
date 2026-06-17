// Package middleware — 维护模式开关
//
// 启用后:
//   - 普通用户(无 token / type=user / role=user)直接 503 + 友好文案
//   - 管理员 (role=admin / super_admin) 正常通过
//   - admin login + admin profile 接口绕过(让管理员能登进来开关)
package middleware

import (
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"scholar-backend/internal/common/database"

	"github.com/gin-gonic/gin"
)

// 用 atomic 缓存维护模式状态,避免每个请求都查 DB
var (
	maintenanceEnabled atomic.Bool
	maintenanceMessage atomic.Value // string
	maintenanceUpdated atomic.Int64 // unix sec, 上次刷新时刻
)

const maintenanceCacheTTL = 30 * time.Second

func refreshMaintenanceState() {
	var row struct {
		MaintenanceMode    int8   `gorm:"column:maintenance_mode"`
		MaintenanceMessage string `gorm:"column:maintenance_message"`
	}
	err := database.GetDB().
		Table("system_configs").
		Select("maintenance_mode, maintenance_message").
		Order("id ASC").
		Limit(1).
		Scan(&row).Error
	if err != nil {
		return
	}
	maintenanceEnabled.Store(row.MaintenanceMode == 1)
	maintenanceMessage.Store(row.MaintenanceMessage)
	maintenanceUpdated.Store(time.Now().Unix())
}

// MaintenanceModeMiddleware 维护模式拦截
//
// 路径白名单:
//   /api/v1/admin/*               (admin 登录 / 操作)
//   /api/v1/user/profile          (admin 用同一接口拿 profile)
//   /api/v1/announcements/active  (维护通知本身要能拿)
//   /health                        (健康检查)
//   /api/v1/admin/login,
//   /api/v1/user/login            (登录入口)
func MaintenanceModeMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 30s 缓存。用 CAS 抢刷新权:只有一个 goroutine 真正查 DB, 其余请求沿用缓存的
		// atomic 值。否则在缓存过期的瞬间, 同一窗口内所有在途请求会各自 inline 查一次
		// system_configs(惊群)—— 见性能审计 be-http。
		now := time.Now().Unix()
		last := maintenanceUpdated.Load()
		if now-last > int64(maintenanceCacheTTL.Seconds()) {
			if maintenanceUpdated.CompareAndSwap(last, now) {
				refreshMaintenanceState()
			}
		}

		if !maintenanceEnabled.Load() {
			c.Next()
			return
		}

		// 白名单路径
		path := c.Request.URL.Path
		if isMaintenanceWhitelisted(path) {
			c.Next()
			return
		}

		// 已登录的管理员放行
		if role, ok := c.Get("user_role"); ok {
			if r, _ := role.(string); r == "admin" || r == "super_admin" {
				c.Next()
				return
			}
		}

		// 拒绝
		msg, _ := maintenanceMessage.Load().(string)
		if msg == "" {
			msg = "系统维护中,请稍后访问"
		}
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"code":    503,
			"message": msg,
			"data":    gin.H{"maintenance": true},
		})
	}
}

func isMaintenanceWhitelisted(path string) bool {
	allowed := []string{
		"/health",
		"/api/v1/admin/",
		"/api/v1/announcements/active",
		"/api/v1/user/login",
		"/api/v1/user/profile",
	}
	for _, p := range allowed {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

// InvalidateMaintenanceCache 在更新 system_config 后立即让缓存失效,管理员体验更直观
func InvalidateMaintenanceCache() {
	maintenanceUpdated.Store(0)
}

