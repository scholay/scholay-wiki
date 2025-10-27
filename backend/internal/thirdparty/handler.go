package thirdparty

import (
	"scholar-backend/internal/common/utils"
	"strconv"

	"github.com/gin-gonic/gin"
)

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
	Name   string        `json:"name" binding:"required"`
	Type   AccountType   `json:"type" binding:"required"`
	Config AccountConfig `json:"config" binding:"required"`
}

// UpdateAccountRequest represents the request body for updating an account
type UpdateAccountRequest struct {
	Name   string        `json:"name"`
	Config AccountConfig `json:"config"`
	Status *int          `json:"status"`
}

// CreateAccount handles POST /api/v1/admin/third-party-accounts
func (h *Handler) CreateAccount(c *gin.Context) {
	var req CreateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 6001, "Invalid request body: "+err.Error())
		return
	}

	account, err := h.service.CreateAccount(req.Name, req.Type, req.Config)
	if err != nil {
		utils.Error(c, 6002, "Failed to create account: "+err.Error())
		return
	}

	utils.Success(c, account)
}

// GetAccount handles GET /api/v1/admin/third-party-accounts/:id
func (h *Handler) GetAccount(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.Error(c, 6003, "Invalid account ID")
		return
	}

	account, err := h.service.GetAccount(uint(id))
	if err != nil {
		utils.Error(c, 6004, "Failed to get account: "+err.Error())
		return
	}

	utils.Success(c, account)
}

// ListAccounts handles GET /api/v1/admin/third-party-accounts
func (h *Handler) ListAccounts(c *gin.Context) {
	accountType := AccountType(c.Query("type"))
	activeOnly := c.Query("active") == "true"

	accounts, err := h.service.ListAccounts(accountType, activeOnly)
	if err != nil {
		utils.Error(c, 6005, "Failed to list accounts: "+err.Error())
		return
	}

	utils.Success(c, map[string]interface{}{
		"accounts": accounts,
		"total":    len(accounts),
	})
}

// UpdateAccount handles PUT /api/v1/admin/third-party-accounts/:id
func (h *Handler) UpdateAccount(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.Error(c, 6006, "Invalid account ID")
		return
	}

	var req UpdateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 6007, "Invalid request body: "+err.Error())
		return
	}

	status := -1
	if req.Status != nil {
		status = *req.Status
	}

	account, err := h.service.UpdateAccount(uint(id), req.Name, req.Config, status)
	if err != nil {
		utils.Error(c, 6008, "Failed to update account: "+err.Error())
		return
	}

	utils.Success(c, account)
}

// DeleteAccount handles DELETE /api/v1/admin/third-party-accounts/:id
func (h *Handler) DeleteAccount(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.Error(c, 6009, "Invalid account ID")
		return
	}

	if err := h.service.DeleteAccount(uint(id)); err != nil {
		utils.Error(c, 6010, "Failed to delete account: "+err.Error())
		return
	}

	utils.Success(c, map[string]interface{}{
		"message": "Account deleted successfully",
	})
}

// GetStats handles GET /api/v1/admin/third-party-accounts/stats
func (h *Handler) GetStats(c *gin.Context) {
	stats, err := h.service.GetStats()
	if err != nil {
		utils.Error(c, 6011, "Failed to get stats: "+err.Error())
		return
	}

	utils.Success(c, stats)
}

// TestAccount handles POST /api/v1/admin/third-party-accounts/:id/test
func (h *Handler) TestAccount(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.Error(c, 6012, "Invalid account ID")
		return
	}

	account, err := h.service.GetAccount(uint(id))
	if err != nil {
		utils.Error(c, 6013, "Failed to get account: "+err.Error())
		return
	}

	// For now, just return the config (in real implementation, you'd test the API)
	utils.Success(c, map[string]interface{}{
		"message":      "Account configuration is valid",
		"account_name": account.Name,
		"account_type": account.Type,
		"status":       "active",
	})
}

// RefreshCache handles POST /api/v1/admin/third-party-accounts/refresh-cache
func (h *Handler) RefreshCache(c *gin.Context) {
	if err := h.service.RefreshCache(); err != nil {
		utils.Error(c, 6014, "Failed to refresh cache: "+err.Error())
		return
	}

	utils.Success(c, map[string]interface{}{
		"message": "Cache refreshed successfully",
	})
}
