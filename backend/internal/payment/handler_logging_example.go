package payment

import (
	"fmt"
	"time"

	"scholar-backend/internal/common/telemetry"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// CreatePaymentWithLogging demonstrates payment creation with comprehensive logging
func (h *AlipayHandler) CreatePaymentWithLogging(c *gin.Context) {
	logger := telemetry.NewLogger("payment.alipay.create")
	ctx := c.Request.Context()
	
	// Start a span for payment creation
	tracer := telemetry.GetTracer()
	ctx, span := tracer.Start(ctx, "payment.alipay.create",
		trace.WithSpanKind(trace.SpanKindInternal),
	)
	defer span.End()
	
	// Get user information from context
	userID, _ := c.Get("userID")
	userEmail, _ := c.Get("userEmail")
	
	// Log payment initiation
	logger.Info(ctx, "Payment creation initiated",
		attribute.Int("user_id", userID.(int)),
		attribute.String("user_email", userEmail.(string)),
		attribute.String("payment_method", "alipay"),
		attribute.String("client_ip", c.ClientIP()),
	)
	
	var req struct {
		OrderNo     string  `json:"order_no" binding:"required"`
		Amount      float64 `json:"amount" binding:"required,gt=0"`
		Subject     string  `json:"subject" binding:"required"`
		Description string  `json:"description"`
		ReturnURL   string  `json:"return_url"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error(ctx, "Invalid payment request", err,
			attribute.Int("user_id", userID.(int)),
			attribute.String("error_type", "validation"),
		)
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	
	// Log payment details
	logger.Info(ctx, "Processing payment request",
		attribute.String("order_no", req.OrderNo),
		attribute.Float64("amount", req.Amount),
		attribute.String("subject", req.Subject),
		attribute.Int("user_id", userID.(int)),
	)
	
	// Add payment details to span
	span.SetAttributes(
		attribute.String("payment.order_no", req.OrderNo),
		attribute.Float64("payment.amount", req.Amount),
		attribute.String("payment.subject", req.Subject),
		attribute.String("payment.method", "alipay"),
	)
	
	// Create payment (simulated)
	startTime := time.Now()
	
	// Here would be actual payment creation logic
	paymentURL := fmt.Sprintf("https://payment.alipay.com/pay?order=%s", req.OrderNo)
	transactionID := fmt.Sprintf("TXN_%s_%d", req.OrderNo, time.Now().Unix())
	
	duration := time.Since(startTime)
	
	// Log successful payment creation
	logger.Info(ctx, "Payment created successfully",
		attribute.String("order_no", req.OrderNo),
		attribute.String("transaction_id", transactionID),
		attribute.Float64("amount", req.Amount),
		attribute.Int("user_id", userID.(int)),
		attribute.Float64("creation_duration_ms", float64(duration.Milliseconds())),
		attribute.String("payment_url", paymentURL),
	)
	
	// Log payment event for analytics
	logger.Info(ctx, "Payment event",
		attribute.String("event_type", "payment.created"),
		attribute.String("payment_method", "alipay"),
		attribute.String("order_no", req.OrderNo),
		attribute.String("transaction_id", transactionID),
		attribute.Float64("amount", req.Amount),
		attribute.Int("user_id", userID.(int)),
		attribute.String("currency", "CNY"),
		attribute.String("status", "pending"),
	)
	
	c.JSON(200, gin.H{
		"success":        true,
		"payment_url":    paymentURL,
		"transaction_id": transactionID,
		"order_no":       req.OrderNo,
	})
}

// HandleCallbackWithLogging demonstrates payment callback with comprehensive logging
func (h *AlipayHandler) HandleCallbackWithLogging(c *gin.Context) {
	logger := telemetry.NewLogger("payment.alipay.callback")
	ctx := c.Request.Context()
	
	// Start a span for callback processing
	tracer := telemetry.GetTracer()
	ctx, span := tracer.Start(ctx, "payment.alipay.callback",
		trace.WithSpanKind(trace.SpanKindInternal),
	)
	defer span.End()
	
	// Log callback received
	logger.Info(ctx, "Payment callback received",
		attribute.String("payment_method", "alipay"),
		attribute.String("client_ip", c.ClientIP()),
		attribute.String("request_method", c.Request.Method),
	)
	
	// Parse callback data
	var callbackData map[string]interface{}
	if err := c.ShouldBindJSON(&callbackData); err != nil {
		logger.Error(ctx, "Failed to parse callback data", err,
			attribute.String("error_type", "parsing"),
			attribute.String("client_ip", c.ClientIP()),
		)
		c.JSON(400, gin.H{"error": "Invalid callback data"})
		return
	}
	
	// Extract key information
	orderNo, _ := callbackData["out_trade_no"].(string)
	tradeNo, _ := callbackData["trade_no"].(string)
	tradeStatus, _ := callbackData["trade_status"].(string)
	totalAmount, _ := callbackData["total_amount"].(float64)
	
	// Log callback details
	logger.Info(ctx, "Processing payment callback",
		attribute.String("order_no", orderNo),
		attribute.String("trade_no", tradeNo),
		attribute.String("trade_status", tradeStatus),
		attribute.Float64("amount", totalAmount),
	)
	
	// Add to span
	span.SetAttributes(
		attribute.String("payment.order_no", orderNo),
		attribute.String("payment.trade_no", tradeNo),
		attribute.String("payment.status", tradeStatus),
		attribute.Float64("payment.amount", totalAmount),
	)
	
	// Process payment status
	startTime := time.Now()
	
	switch tradeStatus {
	case "TRADE_SUCCESS":
		// Log successful payment
		logger.Info(ctx, "Payment successful",
			attribute.String("order_no", orderNo),
			attribute.String("trade_no", tradeNo),
			attribute.Float64("amount", totalAmount),
			attribute.String("status", "success"),
		)
		
		// Log payment completion event
		logger.Info(ctx, "Payment event",
			attribute.String("event_type", "payment.completed"),
			attribute.String("payment_method", "alipay"),
			attribute.String("order_no", orderNo),
			attribute.String("trade_no", tradeNo),
			attribute.Float64("amount", totalAmount),
			attribute.String("currency", "CNY"),
			attribute.String("status", "success"),
		)
		
	case "TRADE_FAILED":
		// Log failed payment
		logger.Error(ctx, "Payment failed", fmt.Errorf("payment failed"),
			attribute.String("order_no", orderNo),
			attribute.String("trade_no", tradeNo),
			attribute.String("status", "failed"),
		)
		
	default:
		// Log unknown status
		logger.Warn(ctx, "Unknown payment status",
			attribute.String("order_no", orderNo),
			attribute.String("trade_no", tradeNo),
			attribute.String("status", tradeStatus),
		)
	}
	
	processingDuration := time.Since(startTime)
	
	// Log callback processing completion
	logger.Info(ctx, "Payment callback processed",
		attribute.String("order_no", orderNo),
		attribute.String("trade_no", tradeNo),
		attribute.String("status", tradeStatus),
		attribute.Float64("processing_duration_ms", float64(processingDuration.Milliseconds())),
	)
	
	// Send response to Alipay
	c.String(200, "success")
}
