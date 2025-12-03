// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"time"

	"github.com/sirupsen/logrus"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// LogLevel represents the severity of a log entry
type LogLevel string

const (
	LogLevelDebug LogLevel = "DEBUG"
	LogLevelInfo  LogLevel = "INFO"
	LogLevelWarn  LogLevel = "WARN"
	LogLevelError LogLevel = "ERROR"
	LogLevelFatal LogLevel = "FATAL"
)

// Logger provides structured logging with SigNoz integration
type Logger struct {
	logger   *logrus.Logger
	tracer   trace.Tracer
	endpoint string
}

var globalEndpoint string

// SetGlobalEndpoint sets the global SigNoz endpoint
func SetGlobalEndpoint(endpoint string) {
	globalEndpoint = endpoint
}

// NewLogger creates a new logger instance
func NewLogger(name string) *Logger {
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339Nano,
	})
	
	return &Logger{
		logger:   logger,
		tracer:   GetTracer(),
		endpoint: globalEndpoint,
	}
}

// LogEntry represents a structured log entry
type LogEntry struct {
	Level        LogLevel
	Message      string
	Attributes   []attribute.KeyValue
	Error        error
	Timestamp    time.Time
	TraceID      string
	SpanID       string
	UserID       string
	RequestID    string
	Method       string
	Path         string
	StatusCode   int
	Latency      time.Duration
	ClientIP     string
	UserAgent    string
	RefererURL   string
	RequestSize  int64
	ResponseSize int64
}

// Debug logs a debug message
func (l *Logger) Debug(ctx context.Context, msg string, attrs ...attribute.KeyValue) {
	l.log(ctx, LogLevelDebug, msg, nil, attrs...)
}

// Info logs an info message
func (l *Logger) Info(ctx context.Context, msg string, attrs ...attribute.KeyValue) {
	l.log(ctx, LogLevelInfo, msg, nil, attrs...)
}

// Warn logs a warning message
func (l *Logger) Warn(ctx context.Context, msg string, attrs ...attribute.KeyValue) {
	l.log(ctx, LogLevelWarn, msg, nil, attrs...)
}

// Error logs an error message
func (l *Logger) Error(ctx context.Context, msg string, err error, attrs ...attribute.KeyValue) {
	l.log(ctx, LogLevelError, msg, err, attrs...)
	
	// Also record error in span if exists
	span := trace.SpanFromContext(ctx)
	if span.IsRecording() && err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, msg)
	}
}

// Fatal logs a fatal message
func (l *Logger) Fatal(ctx context.Context, msg string, err error, attrs ...attribute.KeyValue) {
	l.log(ctx, LogLevelFatal, msg, err, attrs...)
}

// LogRequest logs an HTTP request with detailed information
func (l *Logger) LogRequest(ctx context.Context, entry *LogEntry) {
	attrs := []attribute.KeyValue{
		attribute.String("http.method", entry.Method),
		attribute.String("http.path", entry.Path),
		attribute.Int("http.status_code", entry.StatusCode),
		attribute.Float64("http.latency_ms", float64(entry.Latency.Milliseconds())),
		attribute.String("http.client_ip", entry.ClientIP),
		attribute.String("http.user_agent", entry.UserAgent),
		attribute.String("http.referer", entry.RefererURL),
		attribute.Int64("http.request_size", entry.RequestSize),
		attribute.Int64("http.response_size", entry.ResponseSize),
	}
	
	if entry.UserID != "" {
		attrs = append(attrs, attribute.String("user.id", entry.UserID))
	}
	
	if entry.RequestID != "" {
		attrs = append(attrs, attribute.String("request.id", entry.RequestID))
	}
	
	// Add custom attributes
	attrs = append(attrs, entry.Attributes...)
	
	// Determine log level based on status code
	level := LogLevelInfo
	if entry.StatusCode >= 500 {
		level = LogLevelError
	} else if entry.StatusCode >= 400 {
		level = LogLevelWarn
	}
	
	// Log with appropriate level
	l.log(ctx, level, entry.Message, entry.Error, attrs...)
	
	// For slow requests, add additional warning
	if entry.Latency > 1*time.Second {
		l.Warn(ctx, "Slow request detected", 
			attribute.String("http.method", entry.Method),
			attribute.String("http.path", entry.Path),
			attribute.Float64("http.latency_seconds", entry.Latency.Seconds()),
		)
	}
}

// log is the internal logging method
func (l *Logger) log(ctx context.Context, level LogLevel, msg string, err error, attrs ...attribute.KeyValue) {
	// Get trace and span IDs from context
	span := trace.SpanFromContext(ctx)
	spanCtx := span.SpanContext()
	
	// Prepare log fields
	fields := logrus.Fields{
		"level":   string(level),
		"message": msg,
	}
	
	// Add trace context
	if spanCtx.HasTraceID() {
		fields["trace.id"] = spanCtx.TraceID().String()
	}
	if spanCtx.HasSpanID() {
		fields["span.id"] = spanCtx.SpanID().String()
	}
	
	// Add attributes
	for _, attr := range attrs {
		fields[string(attr.Key)] = attr.Value.AsInterface()
	}
	
	// Add error if present
	if err != nil {
		fields["error.type"] = fmt.Sprintf("%T", err)
		fields["error.message"] = err.Error()
		
		// Add stack trace for errors
		if level == LogLevelError || level == LogLevelFatal {
			fields["error.stack"] = getStackTrace()
		}
	}
	
	// Log to local logger
	entry := l.logger.WithFields(fields)
	switch level {
	case LogLevelDebug:
		entry.Debug(msg)
	case LogLevelInfo:
		entry.Info(msg)
	case LogLevelWarn:
		entry.Warn(msg)
	case LogLevelError:
		entry.Error(msg)
	case LogLevelFatal:
		entry.Fatal(msg)
	}
	
	// Send to SigNoz if endpoint is configured
	if l.endpoint != "" {
		go l.sendToSigNoz(fields)
	}
}

// sendToSigNoz sends log to SigNoz via HTTP
func (l *Logger) sendToSigNoz(fields logrus.Fields) {
	// Convert to JSON
	data, err := json.Marshal(fields)
	if err != nil {
		return
	}
	
	// Send HTTP request
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("POST", l.endpoint+"/v1/logs", bytes.NewBuffer(data))
	if err != nil {
		return
	}
	
	req.Header.Set("Content-Type", "application/json")
	_, _ = client.Do(req)
}

// getStackTrace returns the current stack trace
func getStackTrace() string {
	buf := make([]byte, 1024*16)
	n := runtime.Stack(buf, false)
	return string(buf[:n])
}

// WithAttributes adds attributes to the logger context
func WithAttributes(ctx context.Context, attrs ...attribute.KeyValue) context.Context {
	type contextKey string
	const attributesKey contextKey = "logger.attributes"
	
	existing, _ := ctx.Value(attributesKey).([]attribute.KeyValue)
	return context.WithValue(ctx, attributesKey, append(existing, attrs...))
}

// GetAttributes retrieves attributes from context
func GetAttributes(ctx context.Context) []attribute.KeyValue {
	type contextKey string
	const attributesKey contextKey = "logger.attributes"
	
	if attrs, ok := ctx.Value(attributesKey).([]attribute.KeyValue); ok {
		return attrs
	}
	return nil
}
