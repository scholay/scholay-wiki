// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package thirdparty

import (
	"math"
	"strings"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// configSecretKeys 是各 AccountType 的 config map 里需要遮罩的 JSON 键名集合。
// AIModelConfig / MinicodConfig 现在都只有 api_key 一个秘密字段; 后续若新增其他
// (如 client_secret), 加进这个清单即可在 list / get / update 三个入口同时生效。
var configSecretKeys = []string{"api_key"}

// maskAccountConfig 把 config map 里的所有 secret key 替换为统一遮罩。
// show=true 时不动 (admin "查询" 按钮 ?show_sensitive=true 解蔽)。
func maskAccountConfig(cfg AccountConfig, show bool) {
	if show || cfg == nil {
		return
	}
	for _, k := range configSecretKeys {
		if v, ok := cfg[k].(string); ok && v != "" {
			cfg[k] = utils.MaskedSecretValue
		}
	}
}

// preserveSecretsFromExisting 把入参 config 里"留空 / 仍是遮罩"的 secret 字段
// 从 existing 拷回 —— 防止前端 PUT 表单时把遮罩字符串 "********" 当真 api_key 存库。
func preserveSecretsFromExisting(incoming, existing AccountConfig) {
	if incoming == nil || existing == nil {
		return
	}
	for _, k := range configSecretKeys {
		newV, _ := incoming[k].(string)
		if newV == "" || newV == utils.MaskedSecretValue || strings.Contains(newV, "****") {
			if oldV, ok := existing[k].(string); ok {
				incoming[k] = oldV
			}
		}
	}
}

// Handler handles HTTP requests for third-party accounts
type Handler struct {
	service *Service
}

// NewHandler creates a new handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// CreateAccountRequest represents the request body for creating an account
type CreateAccountRequest struct {
	Name     string        `json:"name" binding:"required"`
	Type     AccountType   `json:"type" binding:"required"`
	Config   AccountConfig `json:"config" binding:"required"`
	Priority int           `json:"priority"` // 优先级，数字越小优先级越高
}

// UpdateAccountRequest represents the request body for updating an account
type UpdateAccountRequest struct {
	Name     string        `json:"name"`
	Config   AccountConfig `json:"config"`
	Status   *int          `json:"status"`
	Priority *int          `json:"priority"` // 优先级，数字越小优先级越高
}

// CreateAccount handles POST /api/v1/admin/third-party-accounts
func (h *Handler) CreateAccount(c *gin.Context) {
	var req CreateAccountRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	account, err := h.service.CreateAccountWithPriority(req.Name, req.Type, req.Config, req.Priority)
	if err != nil {
		utils.InternalError(c, 6002, "Failed to create account", err)
		return
	}

	utils.Success(c, account)
}

// ListAccounts handles GET /api/v1/admin/third-party-accounts
// APIStats holds computed statistics for display
type APIStats struct {
	SuccessRate    float64 `json:"success_rate"`     // 成功率 (0-1)
	AvgLatencyMs   float64 `json:"avg_latency_ms"`   // 平均耗时(ms)
	StdDevMs       float64 `json:"std_dev_ms"`       // 标准差(ms)
	SlowAvgMs      float64 `json:"slow_avg_ms"`      // 慢请求平均耗时(ms)
	SlowRate       float64 `json:"slow_rate"`         // 慢请求比率 (0-1)
}

// computeStats computes derived statistics from raw counters
func computeStats(a *ThirdPartyAccount) APIStats {
	stats := APIStats{}

	if a.TotalRequests > 0 {
		stats.SuccessRate = float64(a.SuccessCount) / float64(a.TotalRequests)
	}

	if a.SuccessCount > 0 {
		mean := float64(a.TotalLatencyMs) / float64(a.SuccessCount)
		stats.AvgLatencyMs = math.Round(mean*100) / 100

		// Variance = E[X²] - E[X]²
		meanSq := float64(a.TotalLatencySqMs) / float64(a.SuccessCount)
		variance := meanSq - mean*mean
		if variance < 0 {
			variance = 0 // floating point guard
		}
		stats.StdDevMs = math.Round(math.Sqrt(variance)*100) / 100

		stats.SlowRate = float64(a.SlowCount) / float64(a.SuccessCount)
	}

	if a.SlowCount > 0 {
		stats.SlowAvgMs = math.Round(float64(a.SlowTotalLatencyMs)/float64(a.SlowCount)*100) / 100
	}

	return stats
}

func (h *Handler) ListAccounts(c *gin.Context) {
	accountType := AccountType(c.Query("type"))
	activeOnly := c.Query("active") == "true"

	accounts, err := h.service.ListAccounts(accountType, activeOnly)
	if err != nil {
		utils.InternalError(c, 6005, "Failed to list accounts", err)
		return
	}

	// Build response with computed stats
	type accountWithStats struct {
		*ThirdPartyAccount
		Stats APIStats `json:"stats"`
	}

	// 默认遮罩 api_key, ?show_sensitive=true 解蔽。Config 是 map[string]any 引用,
	// 这里直接原地改 cfg —— accounts 切片是从 DB 新装的, 不会污染缓存。
	show := utils.IsShowSensitive(c, "show_sensitive")
	result := make([]accountWithStats, len(accounts))
	for i := range accounts {
		maskAccountConfig(accounts[i].Config, show)
		result[i] = accountWithStats{
			ThirdPartyAccount: &accounts[i],
			Stats:             computeStats(&accounts[i]),
		}
	}

	utils.Success(c, map[string]any{
		"accounts": result,
		"total":    len(accounts),
	})
}

// ResetAccountStats handles POST /api/v1/admin/third-party-accounts/:id/reset-stats
func (h *Handler) ResetAccountStats(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.ResetAPIStats(id); err != nil {
		utils.InternalError(c, 6010, "Failed to reset stats", err)
		return
	}

	utils.SuccessWithMessage(c, "Statistics reset successfully", nil)
}

// UpdateAccount handles PUT /api/v1/admin/third-party-accounts/:id
func (h *Handler) UpdateAccount(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req UpdateAccountRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 密钥字段 "留空 / 仍是遮罩" → 保留旧值 (防止前端 PUT 表单时把 "********" 当真 api_key 存库)。
	if req.Config != nil {
		if existing, err := h.service.GetAccount(id); err == nil && existing != nil {
			preserveSecretsFromExisting(req.Config, existing.Config)
		}
	}

	status := -1
	if req.Status != nil {
		status = *req.Status
	}

	priority := -1
	if req.Priority != nil {
		priority = *req.Priority
	}

	account, err := h.service.UpdateAccountWithPriority(id, req.Name, req.Config, status, priority)
	if err != nil {
		utils.InternalError(c, 6008, "Failed to update account", err)
		return
	}

	// 响应也按遮罩规则回显 (跟 List 一致, 前端 GET-After-PUT 拿到的还是遮罩)
	maskAccountConfig(account.Config, utils.IsShowSensitive(c, "show_sensitive"))
	utils.Success(c, account)
}

// DeleteAccount handles DELETE /api/v1/admin/third-party-accounts/:id
func (h *Handler) DeleteAccount(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteAccount(id); err != nil {
		utils.InternalError(c, 6010, "Failed to delete account", err)
		return
	}

	utils.Success(c, map[string]any{
		"message": "Account deleted successfully",
	})
}

// TestAccount handles POST /api/v1/admin/third-party-accounts/:id/test
func (h *Handler) TestAccount(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	account, err := h.service.GetAccount(id)
	if err != nil {
		utils.InternalError(c, 6013, "Failed to get account", err)
		return
	}

	// For now, just return the config (in real implementation, you'd test the API)
	utils.Success(c, map[string]any{
		"message":      "Account configuration is valid",
		"account_name": account.Name,
		"account_type": account.Type,
		"status":       "active",
	})
}

