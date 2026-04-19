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
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"scholar-backend/internal/common/safego"

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
	tracer   trace.Tracer
	endpoint string
}

var (
	globalEndpoint string
	sigNozClient   *http.Client
	sigNozOnce     sync.Once
	sigNozDropped  atomic.Int64
	sigNozCh       chan []byte
	sigNozEnabled  atomic.Bool
)

const (
	sigNozQueueSize   = 1024
	sigNozWorkerCount = 2
)

// SetGlobalEndpoint sets the global SigNoz endpoint
func SetGlobalEndpoint(endpoint string) {
	globalEndpoint = endpoint
}

func getSigNozClient() *http.Client {
	sigNozOnce.Do(func() {
		sigNozClient = &http.Client{
			Timeout: 3 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        10,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     30 * time.Second,
				DialContext: (&net.Dialer{
					Timeout:   2 * time.Second,
					KeepAlive: 30 * time.Second,
				}).DialContext,
			},
		}
		sigNozCh = make(chan []byte, sigNozQueueSize)
		sigNozEnabled.Store(true)
		for i := 0; i < sigNozWorkerCount; i++ {
			safego.Go("telemetry-signoz-worker", sigNozWorker)
		}
	})
	return sigNozClient
}

func sigNozWorker() {
	for data := range sigNozCh {
		if !sigNozEnabled.Load() {
			continue
		}
		req, err := http.NewRequest("POST", globalEndpoint+"/v1/logs", bytes.NewReader(data))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := getSigNozClient().Do(req)
		if resp != nil {
			// 排干 body（最多 4KB）再关闭，这样 TCP 连接能进连接池复用。
			// SigNoz 响应通常很小，不需要完整读取内容。
			io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
			resp.Body.Close()
		}
		if err != nil {
			sigNozEnabled.Store(false)
			safego.Go("telemetry-reenable", func() {
				time.Sleep(30 * time.Second)
				sigNozEnabled.Store(true)
			})
		}
	}
}

// NewLogger creates a new logger instance
func NewLogger(name string) *Logger {
	if globalEndpoint != "" {
		getSigNozClient()
	}

	return &Logger{
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
	span := trace.SpanFromContext(ctx)
	spanCtx := span.SpanContext()

	// Build slog args and a parallel map for SigNoz export
	slogArgs := []any{"level", string(level)}
	sigNozFields := map[string]any{
		"level":   string(level),
		"message": msg,
	}

	if spanCtx.HasTraceID() {
		tid := spanCtx.TraceID().String()
		slogArgs = append(slogArgs, "trace.id", tid)
		sigNozFields["trace.id"] = tid
	}
	if spanCtx.HasSpanID() {
		sid := spanCtx.SpanID().String()
		slogArgs = append(slogArgs, "span.id", sid)
		sigNozFields["span.id"] = sid
	}

	for _, attr := range attrs {
		k := string(attr.Key)
		v := attr.Value.AsInterface()
		slogArgs = append(slogArgs, k, v)
		sigNozFields[k] = v
	}

	if err != nil {
		errType := fmt.Sprintf("%T", err)
		slogArgs = append(slogArgs, "error.type", errType, "error.message", err.Error())
		sigNozFields["error.type"] = errType
		sigNozFields["error.message"] = err.Error()

		if level == LogLevelError || level == LogLevelFatal {
			stack := getStackTrace()
			slogArgs = append(slogArgs, "error.stack", stack)
			sigNozFields["error.stack"] = stack
		}
	}

	switch level {
	case LogLevelDebug:
		slog.DebugContext(ctx, msg, slogArgs...)
	case LogLevelInfo:
		slog.InfoContext(ctx, msg, slogArgs...)
	case LogLevelWarn:
		slog.WarnContext(ctx, msg, slogArgs...)
	case LogLevelError:
		slog.ErrorContext(ctx, msg, slogArgs...)
	case LogLevelFatal:
		slog.ErrorContext(ctx, msg, slogArgs...)
		os.Exit(1)
	}

	// Send to SigNoz if endpoint is configured (non-blocking queue)
	if l.endpoint != "" && sigNozEnabled.Load() {
		data, jsonErr := json.Marshal(sigNozFields)
		if jsonErr == nil {
			select {
			case sigNozCh <- data:
			default:
				sigNozDropped.Add(1)
			}
		}
	}
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
