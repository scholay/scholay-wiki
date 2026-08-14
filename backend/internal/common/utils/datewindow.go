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

// WindowCutoff —— 「近 days 天」的**全站唯一**起点口径:当日零点对齐,再回看 (days-1) 天,
// 即 [今天-(days-1) 的 00:00:00, 今天] 共 days 个自然日(含今天)。
//
// 🔴 2026-08-02 计费审计 P1-15:这个口径此前在 5 处各写一遍(vip/admin_orders、admin/dashboard_service、
// user/metrics、llmusage/repository_admin ×2),而漏网的两处各犯一条经典错误 ——
//   · `-days` 而不是 `-(days-1)`:窗口变成 days+1 个自然日,KPI 比同屏折线多统计最旧那一天;
//   · 不对齐零点:最旧那个自然日被「当前钟点」拦腰截断,同一天内反复刷新数字持续缩水。
// 后台对不上账会让人怀疑计费本身,所以口径必须只有一份实现。新增「近 N 天」统计一律调它。
func WindowCutoff(days int) time.Time {
	if days <= 0 {
		days = 1
	}
	now := time.Now()
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	return day0.AddDate(0, 0, -(days - 1))
}

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
	// 走统一口径(P1-15):旧实现是 `now.AddDate(0,0,-days), now` —— 两条错误全占,
	// 于是「使用统计」页的近 30 天实为 31 个点、且最旧一根柱随刷新时间单调缩水,
	// 与 /admin/token-usage 同样标着「近30天」的数字恒差一天的量。
	// 前端 DateRangeControl 的展示口径本来就是 -(days-1),这里对齐后前后端才一致。
	return WindowCutoff(days), now
}
