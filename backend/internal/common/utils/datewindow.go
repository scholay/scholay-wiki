// 统一的「监控时间窗口」解析 —— 全站 admin 监控端点共用,口径一致:
//   · start_date + end_date 同时给 → [start 00:00:00, end 23:59:59](含当天,支持"今天"=同一天 + 自定义区间)
//   · 否则按 days 回看(默认 defDays)
// 返回的 from/to 直接用于 `created_at BETWEEN ? AND ?`。不做 UTC 转换(容器时区=北京,与 DB 同区)。
package utils

import (
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ParseDateWindow 从 query 解析 (from, to)。
func ParseDateWindow(c *gin.Context, defDays int) (from, to time.Time) {
	now := time.Now()
	start, end := strings.TrimSpace(c.Query("start_date")), strings.TrimSpace(c.Query("end_date"))
	if start != "" && end != "" {
		if df, err := time.ParseInLocation("2006-01-02", start, time.Local); err == nil {
			if dt, err2 := time.ParseInLocation("2006-01-02", end, time.Local); err2 == nil {
				return df, dt.Add(24*time.Hour - time.Second) // 含 end 当天 23:59:59
			}
		}
	}
	days, _ := strconv.Atoi(c.DefaultQuery("days", strconv.Itoa(defDays)))
	if days <= 0 {
		days = defDays
	}
	return now.AddDate(0, 0, -days), now
}
