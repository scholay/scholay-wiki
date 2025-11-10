package subscription

import (
	"net/http"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Handler handles HTTP requests for subscription
type Handler struct {
	service *Service
}

// NewHandler creates a new subscription handler
func NewHandler(db *gorm.DB) *Handler {
	return &Handler{
		service: NewService(db),
	}
}

// GetPlans handles GET /api/v1/user/subscription/plans
// Returns all available subscription plans
func (h *Handler) GetPlans(c *gin.Context) {
	plans, err := h.service.GetAllPlans()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve plans")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", plans)
}

// GetMySubscription handles GET /api/v1/user/subscription/my
// Returns current user's subscription info
func (h *Handler) GetMySubscription(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	subscription, err := h.service.GetUserSubscription(userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve subscription")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", subscription)
}

// GetMyUsageQuota handles GET /api/v1/user/subscription/usage
// Returns current user's usage quota
func (h *Handler) GetMyUsageQuota(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	usage, err := h.service.GetUserUsageQuota(userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve usage quota")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", usage)
}

// UpgradeRequest represents the request to upgrade subscription
type UpgradeRequest struct {
	PlanCode string `json:"plan_code" binding:"required"`
	Duration int    `json:"duration" binding:"required"` // months: 1 for monthly, 12 for yearly
}

// UpgradeSubscription handles POST /api/v1/user/subscription/upgrade
// Upgrades user's subscription plan
func (h *Handler) UpgradeSubscription(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req UpgradeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// Validate duration
	if req.Duration != 1 && req.Duration != 12 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Duration must be 1 (monthly) or 12 (yearly)")
		return
	}

	// Upgrade subscription
	if err := h.service.UpgradeSubscription(userID.(uint), req.PlanCode, req.Duration); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to upgrade subscription: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"message": "Subscription upgraded successfully",
	})
}

// RenewSubscription handles POST /api/v1/user/subscription/renew
// Renews current subscription with additional duration
func (h *Handler) RenewSubscription(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Duration int `json:"duration" binding:"required,min=1"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// Get current subscription
	currentSub, err := h.service.GetUserSubscription(userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get current subscription")
		return
	}

	// Extract plan code from subscription data
	planCode, ok := currentSub["plan_code"].(string)
	if !ok {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Invalid subscription data")
		return
	}

	// Cannot renew free plan
	if planCode == "free" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Cannot renew free plan")
		return
	}

	// Renew by upgrading to same plan
	if err := h.service.UpgradeSubscription(userID.(uint), planCode, req.Duration); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to renew subscription: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"message": "Subscription renewed successfully",
	})
}

// CheckQuota handles GET /api/v1/user/subscription/check-quota
// Checks if user has remaining quota for a feature
func (h *Handler) CheckQuota(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	featureType := c.Query("feature_type")
	if featureType == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "feature_type is required")
		return
	}

	hasQuota, err := h.service.CheckQuota(userID.(uint), featureType)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to check quota")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"has_quota": hasQuota,
	})
}

// IncrementUsage handles POST /api/v1/user/subscription/increment-usage
// Increments usage count for a feature (internal use)
func (h *Handler) IncrementUsage(c *gin.Context) {
	userIDStr := c.PostForm("user_id")
	featureType := c.PostForm("feature_type")

	if userIDStr == "" || featureType == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "user_id and feature_type are required")
		return
	}

	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid user_id")
		return
	}

	if err := h.service.IncrementUsage(uint(userID), featureType); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to increment usage")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"message": "Usage incremented successfully",
	})
}

// UpdatePlan handles PUT /api/v1/admin/subscription-plans/:id
// Updates a subscription plan (admin only)
func (h *Handler) UpdatePlan(c *gin.Context) {
	planIDStr := c.Param("id")
	planID, err := strconv.ParseUint(planIDStr, 10, 32)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid plan ID")
		return
	}

	var req struct {
		PlanName              string       `json:"plan_name" binding:"required"`
		PriceMonthly          float64      `json:"price_monthly"`
		CurrentPriceMonthly   float64      `json:"current_price_monthly"`
		PriceYearly           float64      `json:"price_yearly"`
		CurrentPriceYearly    float64      `json:"current_price_yearly"`
		YearlyDiscountEnabled bool         `json:"yearly_discount_enabled"`
		YearlyDiscountPercent float64      `json:"yearly_discount_percent"`
		Features              PlanFeatures `json:"features" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request data")
		return
	}

	// If yearly discount is enabled, calculate the yearly price from monthly price
	if req.YearlyDiscountEnabled {
		// Calculate yearly price: monthly * 12 * (1 - discount/100)
		req.CurrentPriceYearly = req.CurrentPriceMonthly * 12 * (1 - req.YearlyDiscountPercent/100)
	}

	if err := h.service.UpdatePlan(uint(planID), req.PlanName, req.PriceMonthly, req.CurrentPriceMonthly, req.PriceYearly, req.CurrentPriceYearly, req.YearlyDiscountEnabled, req.YearlyDiscountPercent, req.Features); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to update plan: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"message": "Plan updated successfully",
	})
}
