package order

import (
	"net/http"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Handler handles HTTP requests for orders
type Handler struct {
	service *Service
}

// NewHandler creates a new order handler
func NewHandler(db *gorm.DB) *Handler {
	return &Handler{
		service: NewService(db),
	}
}

// CreateOrder handles POST /api/v1/user/orders/create
// Creates a new order for subscription
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
