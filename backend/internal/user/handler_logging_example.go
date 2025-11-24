package user

import (
	"fmt"
	"time"

	"scholar-backend/internal/common/telemetry"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// LoginWithLogging demonstrates enhanced login with comprehensive logging
func (h *Handler) LoginWithLogging(c *gin.Context) {
	// Initialize logger for this handler
	logger := telemetry.NewLogger("user.handler.login")
	ctx := c.Request.Context()
	
	// Start a span for the login operation
	tracer := telemetry.GetTracer()
	ctx, span := tracer.Start(ctx, "user.login",
		trace.WithSpanKind(trace.SpanKindInternal),
	)
	defer span.End()
	
	// Log the start of login attempt
	logger.Info(ctx, "Login attempt started",
		attribute.String("client_ip", c.ClientIP()),
		attribute.String("user_agent", c.Request.UserAgent()),
	)
	
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Log validation error
		logger.Error(ctx, "Invalid login request", err,
			attribute.String("error_type", "validation"),
			attribute.String("client_ip", c.ClientIP()),
		)
		
		c.JSON(400, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}
	
	// Log login attempt details (without password)
	logger.Debug(ctx, "Processing login request",
		attribute.String("email", req.Email),
		attribute.String("login_type", "email"),
		attribute.String("client_ip", c.ClientIP()),
	)
	
	// Verify Turnstile if enabled
	if h.service.IsTurnstileEnabled() {
		logger.Debug(ctx, "Verifying Turnstile token")
		
		if req.TurnstileToken == "" {
			logger.Warn(ctx, "Missing Turnstile token",
				attribute.String("email", req.Email),
				attribute.String("client_ip", c.ClientIP()),
			)
			c.JSON(400, gin.H{"error": "Turnstile token is required"})
			return
		}
		
		success, err := h.service.VerifyTurnstile(req.TurnstileToken, c.ClientIP())
		if err != nil || !success {
			logger.Error(ctx, "Turnstile verification failed", err,
				attribute.String("email", req.Email),
				attribute.String("client_ip", c.ClientIP()),
				attribute.Bool("verification_success", success),
			)
			c.JSON(400, gin.H{"error": "Turnstile verification failed"})
			return
		}
		
		logger.Debug(ctx, "Turnstile verification successful")
	}
	
	// Perform login
	startTime := time.Now()
	user, token, err := h.service.Login(req.Email, req.Password)
	loginDuration := time.Since(startTime)
	
	// Add login duration to span
	span.SetAttributes(
		attribute.Float64("login.duration_ms", float64(loginDuration.Milliseconds())),
	)
	
	if err != nil {
		// Log failed login attempt with details
		logger.Error(ctx, "Login failed", err,
			attribute.String("email", req.Email),
			attribute.String("client_ip", c.ClientIP()),
			attribute.String("error_reason", err.Error()),
			attribute.Float64("duration_ms", float64(loginDuration.Milliseconds())),
		)
		
		// Check specific error types for security monitoring
		if err.Error() == "invalid credentials" {
			logger.Warn(ctx, "Invalid credentials attempted",
				attribute.String("email", req.Email),
				attribute.String("client_ip", c.ClientIP()),
				attribute.Int("failed_attempts", h.getFailedAttempts(req.Email)),
			)
		}
		
		c.JSON(401, gin.H{"error": "Invalid email or password"})
		return
	}
	
	// Log successful login with user details
	logger.Info(ctx, "Login successful",
		attribute.Int64("user_id", int64(user.ID)),
		attribute.String("email", user.Email),
		attribute.String("username", user.Username),
		attribute.String("client_ip", c.ClientIP()),
		attribute.Float64("duration_ms", float64(loginDuration.Milliseconds())),
		attribute.Bool("is_vip", user.IsVIP),
		attribute.String("vip_expiry", user.VIPExpiresAt.Format(time.RFC3339)),
	)
	
	// Set user context for subsequent operations
	c.Set("userID", user.ID)
	c.Set("userEmail", user.Email)
	
	// Update span with user information
	span.SetAttributes(
		attribute.Int64("user.id", int64(user.ID)),
		attribute.String("user.email", user.Email),
		attribute.Bool("user.is_vip", user.IsVIP),
	)
	
	// Record login event for analytics
	logger.Info(ctx, "User login event",
		attribute.String("event_type", "user.login"),
		attribute.Int64("user_id", int64(user.ID)),
		attribute.String("login_method", "email_password"),
		attribute.String("client_ip", c.ClientIP()),
		attribute.String("user_agent", c.Request.UserAgent()),
		attribute.String("referer", c.Request.Referer()),
	)
	
	c.JSON(200, gin.H{
		"message": "Login successful",
		"token":   token,
		"user": gin.H{
			"id":           user.ID,
			"email":        user.Email,
			"username":     user.Username,
			"is_vip":       user.IsVIP,
			"vip_expires":  user.VIPExpiresAt,
		},
	})
}

// Helper function to track failed login attempts (example)
func (h *Handler) getFailedAttempts(email string) int {
	// This would typically check Redis or database for failed attempt count
	return 0
}
