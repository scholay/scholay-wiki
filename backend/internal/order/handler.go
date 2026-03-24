// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package order

import (
	"net/http"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for orders
type Handler struct {
	service *Service
}

// NewHandler creates a new order handler with an existing service
func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

// CreateOrder handles POST /api/v1/user/orders/create
// Creates a new order
func (h *Handler) CreateOrder(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	order, err := h.service.CreateOrder(userID.(uint), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create order: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", order)
}

// GetMyOrders handles GET /api/v1/user/orders/my
// Returns current user's orders
func (h *Handler) GetMyOrders(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Parse pagination parameters
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	orders, total, err := h.service.GetUserOrders(userID.(uint), page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve orders")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"orders": orders,
		"total":  total,
		"page":   page,
		"page_size": pageSize,
	})
}

// GetOrderDetail handles GET /api/v1/user/orders/:order_no
// Returns order details
func (h *Handler) GetOrderDetail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	orderNo := c.Param("order_no")
	if orderNo == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Order number is required")
		return
	}

	order, err := h.service.GetOrderByOrderNo(orderNo)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Order not found")
		return
	}

	// Verify order belongs to user
	if order.UserID != userID.(uint) {
		utils.ErrorResponse(c, http.StatusForbidden, "Unauthorized to access this order")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", order)
}

// ProcessPayment handles POST /api/v1/user/orders/pay
// Processes payment for an order
func (h *Handler) ProcessPayment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req ProcessPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	if err := h.service.ProcessPayment(userID.(uint), req); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to process payment: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"message": "Payment processed successfully",
	})
}

// CancelOrder handles POST /api/v1/user/orders/cancel
// Cancels a pending order
func (h *Handler) CancelOrder(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	orderNo := c.PostForm("order_no")
	if orderNo == "" {
		var req struct {
			OrderNo string `json:"order_no" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.ErrorResponse(c, http.StatusBadRequest, "Order number is required")
			return
		}
		orderNo = req.OrderNo
	}

	if err := h.service.CancelOrder(userID.(uint), orderNo); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to cancel order: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"message": "Order cancelled successfully",
	})
}

// GetBillingHistory handles GET /api/v1/user/orders/billing-history
// Returns user's paid orders (billing history)
func (h *Handler) GetBillingHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Parse pagination parameters
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	orders, total, err := h.service.GetUserPaidOrders(userID.(uint), page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve billing history")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"orders":    orders,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GetOrderStatistics handles GET /api/v1/admin/orders/statistics
// Returns order statistics (admin only)
func (h *Handler) GetOrderStatistics(c *gin.Context) {
	stats, err := h.service.GetOrderStatistics()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve order statistics")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", stats)
}

// AdminListOrders handles GET /api/v1/admin/orders
// Returns all paid orders with filters (admin only)
func (h *Handler) AdminListOrders(c *gin.Context) {
	// Parse query parameters
	planCode := c.Query("plan_code")
	userEmail := c.Query("user_email")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	orders, total, err := h.service.AdminListOrders(planCode, userEmail, page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to retrieve orders")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"orders":    orders,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

