// ============================================================================
// admin HTTP handler —— 后台 token 用量看板(全部挂在 /admin, AdminAuthMiddleware 之后)。
// 端点: summary(总览) / logs(明细分页) / facets(筛选下拉) / export(CSV) / cleanup(手动清理)。
// ============================================================================

package llmusage

import (
	"encoding/csv"
	"fmt"
	"strconv"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// AdminHandler 后台 token 用量看板处理器(持有读侧 Service)。
type AdminHandler struct {
	service *Service
}

// NewAdminHandler 由 bootstrap 调用, 复用同一个 *Service(写侧 recorder + 读侧聚合共用 repo)。
func NewAdminHandler(service *Service) *AdminHandler {
	return &AdminHandler{service: service}
}

const exportRowCap = 100000 // CSV 导出行数上限, 防止一次拉爆内存/连接

// parseStatsFilter 从 query 解析统一过滤条件(看板各端点共用)。
// 时间窗口: start_date+end_date 同时给 → 自定义区间(含当天), 否则按 days 回看。
func parseStatsFilter(c *gin.Context) StatsFilter {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	f := StatsFilter{
		Days:     days,
		Feature:  c.Query("feature"),
		Source:   c.Query("source"),
		Model:    c.Query("model"),
		Provider: c.Query("provider"),
	}
	if start, end := c.Query("start_date"), c.Query("end_date"); start != "" && end != "" {
		// ParseInLocation + time.Local —— 容器时区=北京, 与 DB 存的本地时间同区, 不做 UTC 转换。
		if df, err := time.ParseInLocation("2006-01-02", start, time.Local); err == nil {
			if dt, err2 := time.ParseInLocation("2006-01-02", end, time.Local); err2 == nil {
				f.DateFrom = df
				f.DateTo = dt.Add(24*time.Hour - time.Second) // 含 end 当天 23:59:59
			}
		}
	}
	if c.Query("anon") == "1" {
		f.AnonOnly = true
	} else if uidStr := c.Query("user_id"); uidStr != "" {
		if uid, err := strconv.ParseUint(uidStr, 10, 64); err == nil {
			u := uint(uid)
			f.UserID = &u
		}
	}
	return f
}

// GetSummary GET /admin/llm-token-usage/summary —— KPI + 趋势 + 多维拆分 + top 用户(一次拉全)。
func (h *AdminHandler) GetSummary(c *gin.Context) {
	res, err := h.service.GetOverview(parseStatsFilter(c))
	if err != nil {
		utils.ServerError(c, "获取 token 用量统计失败")
		return
	}
	utils.Success(c, res)
}

// ListLogs GET /admin/llm-token-usage/logs?page=&page_size=&sort=&<filters> —— 明细分页。
func (h *AdminHandler) ListLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "30"))
	sortBy := c.DefaultQuery("sort", "created_at")
	items, total, err := h.service.GetLogs(parseStatsFilter(c), page, pageSize, sortBy)
	if err != nil {
		utils.ServerError(c, "获取调用明细失败")
		return
	}
	utils.Success(c, gin.H{"logs": items, "total": total})
}

// GetFacets GET /admin/llm-token-usage/facets?days= —— 筛选下拉动态可选值(model/provider/account)。
func (h *AdminHandler) GetFacets(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	res, err := h.service.GetFacets(days)
	if err != nil {
		utils.ServerError(c, "获取筛选项失败")
		return
	}
	utils.Success(c, res)
}

// ExportCSV GET /admin/llm-token-usage/export?<filters> —— 导出当前过滤下的明细 CSV。
// 服务端直出, 不在浏览器拼 CSV;带 UTF-8 BOM 让 Excel 正确识别中文。
func (h *AdminHandler) ExportCSV(c *gin.Context) {
	// 走 ExportLogs(非分页, 受 exportRowCap 约束); 不要复用 GetLogs —— 它把 pageSize>100
	// 夹成 30, 会把导出静默截断到 30 行。
	items, err := h.service.ExportLogs(parseStatsFilter(c), c.DefaultQuery("sort", "created_at"))
	if err != nil {
		utils.ServerError(c, "导出失败")
		return
	}

	filename := fmt.Sprintf("llm-token-usage-%s.csv", time.Now().Format("20060102"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename="+filename)
	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM

	w := csv.NewWriter(c.Writer)
	defer w.Flush()
	_ = w.Write([]string{
		"时间", "用户ID", "用户名", "邮箱", "功能", "来源", "Provider", "账号ID", "账号",
		"模型", "输入tokens", "输出tokens", "总tokens", "缓存读tokens", "缓存创建tokens", "request_id",
	})
	for _, r := range items {
		uid := ""
		if r.UserID != nil {
			uid = strconv.FormatUint(uint64(*r.UserID), 10)
		}
		accID := ""
		if r.AccountID != nil {
			accID = strconv.FormatUint(uint64(*r.AccountID), 10)
		}
		_ = w.Write([]string{
			r.CreatedAt.Format("2006-01-02 15:04:05"),
			uid, r.Username, r.Email,
			FeatureLabel(r.Feature), SourceLabel(r.Source), r.Provider, accID, r.AccountName,
			r.Model,
			strconv.Itoa(r.InputTokens), strconv.Itoa(r.OutputTokens), strconv.Itoa(r.TotalTokens),
			strconv.Itoa(r.CacheReadTokens), strconv.Itoa(r.CacheCreationTokens), r.RequestID,
		})
	}
}

// TriggerCleanup POST /admin/llm-token-usage/cleanup —— 手动清理超期账本行。
func (h *AdminHandler) TriggerCleanup(c *gin.Context) {
	n, err := h.service.Cleanup()
	if err != nil {
		utils.ServerError(c, "清理失败")
		return
	}
	utils.SuccessWithMessage(c, "清理完成", gin.H{"deleted": n})
}
