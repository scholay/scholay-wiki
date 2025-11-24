package middleware

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"scholar-backend/internal/common/telemetry"
	
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

// TelemetryMiddleware provides comprehensive request logging and tracing
func TelemetryMiddleware() gin.HandlerFunc {
	logger := telemetry.NewLogger("http.middleware")
	tracer := telemetry.GetTracer()
	
	return func(c *gin.Context) {
		// Generate request ID
		requestID := uuid.New().String()
		c.Set("RequestID", requestID)
		c.Header("X-Request-ID", requestID)
		
		// Start span
		ctx := c.Request.Context()
		spanName := fmt.Sprintf("%s %s", c.Request.Method, c.FullPath())
		if spanName == " " {
			spanName = fmt.Sprintf("%s %s", c.Request.Method, c.Request.URL.Path)
		}
		
		ctx, span := tracer.Start(ctx, spanName,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				attribute.String("http.method", c.Request.Method),
				attribute.String("http.url", c.Request.URL.String()),
				attribute.String("http.target", c.Request.URL.Path),
				attribute.String("http.host", c.Request.Host),
				attribute.String("http.scheme", c.Request.URL.Scheme),
				attribute.String("http.user_agent", c.Request.UserAgent()),
				attribute.String("request.id", requestID),
			),
		)
		defer span.End()
		
		// Update request context
		c.Request = c.Request.WithContext(ctx)
		
		// Capture request body for logging (if needed)
		var requestBody []byte
		if c.Request.Body != nil && shouldLogBody(c.Request.Header.Get("Content-Type")) {
			requestBody, _ = io.ReadAll(c.Request.Body)
			c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
		}
		
		// Create response writer wrapper to capture response size
		blw := &bodyLogWriter{body: bytes.NewBufferString(""), ResponseWriter: c.Writer}
		c.Writer = blw
		
		// Record start time
		startTime := time.Now()
		
		// Get client IP
		clientIP := c.ClientIP()
		if realIP := c.Request.Header.Get("X-Real-IP"); realIP != "" {
			clientIP = realIP
		} else if forwardedFor := c.Request.Header.Get("X-Forwarded-For"); forwardedFor != "" {
			clientIP = forwardedFor
		}
		
		// Process request
		c.Next()
		
		// Calculate latency
		latency := time.Since(startTime)
		
		// Get user ID from context if available
		userID := ""
		if uid, exists := c.Get("userID"); exists {
			userID = fmt.Sprintf("%v", uid)
			span.SetAttributes(attribute.String("user.id", userID))
		}
		
		// Set span attributes
		span.SetAttributes(
			attribute.Int("http.status_code", c.Writer.Status()),
			attribute.Int64("http.request_content_length", c.Request.ContentLength),
			attribute.Int64("http.response_content_length", int64(blw.body.Len())),
			attribute.Float64("http.latency_ms", float64(latency.Milliseconds())),
			attribute.String("client.ip", clientIP),
		)
		
		// Prepare log entry
		logEntry := &telemetry.LogEntry{
			Level:        telemetry.LogLevelInfo,
			Message:      fmt.Sprintf("HTTP %s %s", c.Request.Method, c.Request.URL.Path),
			Method:       c.Request.Method,
			Path:         c.Request.URL.Path,
			StatusCode:   c.Writer.Status(),
			Latency:      latency,
			ClientIP:     clientIP,
			UserAgent:    c.Request.UserAgent(),
			RefererURL:   c.Request.Referer(),
			RequestSize:  c.Request.ContentLength,
			ResponseSize: int64(blw.body.Len()),
			UserID:       userID,
			RequestID:    requestID,
			TraceID:      span.SpanContext().TraceID().String(),
			SpanID:       span.SpanContext().SpanID().String(),
		}
		
		// Add custom attributes based on endpoint
		attrs := []attribute.KeyValue{
			attribute.String("endpoint.path", c.FullPath()),
			attribute.String("endpoint.handler", c.HandlerName()),
		}
		
		// Add query parameters if present
		if c.Request.URL.RawQuery != "" {
			attrs = append(attrs, attribute.String("http.query", c.Request.URL.RawQuery))
		}
		
		// Add request body size if present
		if len(requestBody) > 0 {
			attrs = append(attrs, attribute.Int("http.request_body_size", len(requestBody)))
			// For debugging, optionally log small request bodies
			if len(requestBody) < 1024 && c.Writer.Status() >= 400 {
				attrs = append(attrs, attribute.String("http.request_body", string(requestBody)))
			}
		}
		
		// Check for errors
		if len(c.Errors) > 0 {
			logEntry.Level = telemetry.LogLevelError
			logEntry.Error = c.Errors.Last().Err
			logEntry.Message = fmt.Sprintf("Request failed: %s", c.Errors.Last().Error())
			
		// Log all errors
		for _, e := range c.Errors {
			logger.Error(ctx, e.Error(), e.Err,
				attribute.String("error.type", fmt.Sprintf("%d", e.Type)),
				attribute.String("error.meta", fmt.Sprintf("%v", e.Meta)),
			)
		}
		}
		
		// Add response headers for debugging
		if c.Writer.Status() >= 400 {
			for key, values := range c.Writer.Header() {
				if len(values) > 0 {
					attrs = append(attrs, attribute.String(fmt.Sprintf("response.header.%s", key), values[0]))
				}
			}
		}
		
		logEntry.Attributes = attrs
		
		// Log the request
		logger.LogRequest(ctx, logEntry)
		
		// Log slow queries separately
		if latency > 1*time.Second {
			logger.Warn(ctx, "Slow API request detected",
				attribute.String("method", c.Request.Method),
				attribute.String("path", c.Request.URL.Path),
				attribute.Float64("latency_seconds", latency.Seconds()),
				attribute.String("client_ip", clientIP),
				attribute.String("user_id", userID),
			)
		}
		
		// Log specific endpoint metrics for monitoring
		logEndpointSpecificMetrics(ctx, logger, c, latency)
	}
}

// OpenTelemetryGinMiddleware wraps the otelgin middleware for additional setup
func OpenTelemetryGinMiddleware(serviceName string) gin.HandlerFunc {
	return otelgin.Middleware(serviceName)
}

// bodyLogWriter wraps gin.ResponseWriter to capture response body size
type bodyLogWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w bodyLogWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}

// shouldLogBody determines if request body should be logged based on content type
func shouldLogBody(contentType string) bool {
	// Only log JSON and form data bodies, skip binary data
	return contentType == "application/json" || 
	       contentType == "application/x-www-form-urlencoded" ||
	       contentType == "text/plain"
}

// logEndpointSpecificMetrics logs metrics specific to certain endpoints
func logEndpointSpecificMetrics(ctx context.Context, logger *telemetry.Logger, c *gin.Context, latency time.Duration) {
	path := c.FullPath()
	
	// Log metrics for specific critical endpoints
	switch path {
	case "/api/v1/user/login", "/api/v1/user/register":
		logger.Info(ctx, "Authentication endpoint accessed",
			attribute.String("endpoint", path),
			attribute.String("method", c.Request.Method),
			attribute.Bool("success", c.Writer.Status() < 400),
			attribute.Float64("latency_ms", float64(latency.Milliseconds())),
		)
		
	case "/api/v1/scholar/papers/search":
		// Log search metrics
		logger.Info(ctx, "Search endpoint accessed",
			attribute.String("endpoint", path),
			attribute.Int("result_count", c.Writer.Size()),
			attribute.Float64("latency_ms", float64(latency.Milliseconds())),
		)
		
	case "/api/v1/payment/alipay/create", "/api/v1/payment/wechat/create":
		// Log payment metrics with extra care
		logger.Info(ctx, "Payment endpoint accessed",
			attribute.String("endpoint", path),
			attribute.String("payment_method", getPaymentMethod(path)),
			attribute.Bool("success", c.Writer.Status() < 400),
			attribute.Float64("latency_ms", float64(latency.Milliseconds())),
		)
		
	case "/api/v1/conversations/chat/stream":
		// Log AI chat metrics
		logger.Info(ctx, "AI chat endpoint accessed",
			attribute.String("endpoint", path),
			attribute.Float64("latency_ms", float64(latency.Milliseconds())),
			attribute.Bool("streaming", true),
		)
	}
	
	// Log admin operations
	if len(path) > 13 && path[:13] == "/api/v1/admin" {
		logger.Info(ctx, "Admin operation",
			attribute.String("endpoint", path),
			attribute.String("method", c.Request.Method),
			attribute.String("admin_user", c.GetString("adminID")),
			attribute.Bool("success", c.Writer.Status() < 400),
		)
	}
}

// getPaymentMethod extracts payment method from path
func getPaymentMethod(path string) string {
	if bytes.Contains([]byte(path), []byte("alipay")) {
		return "alipay"
	}
	if bytes.Contains([]byte(path), []byte("wechat")) {
		return "wechat"
	}
	return "unknown"
}
