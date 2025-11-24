package telemetry

import (
	"context"
	"fmt"
	"runtime"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/log"
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

// Logger provides structured logging with OpenTelemetry integration
type Logger struct {
	logger log.Logger
	tracer trace.Tracer
}

// NewLogger creates a new logger instance
func NewLogger(name string) *Logger {
	var logger log.Logger
	if loggerProvider != nil {
		logger = loggerProvider.Logger(name)
	}
	
	return &Logger{
		logger: logger,
		tracer: GetTracer(),
	}
}

// LogEntry represents a structured log entry
type LogEntry struct {
	Level       LogLevel
	Message     string
	Attributes  []attribute.KeyValue
	Error       error
	Timestamp   time.Time
	TraceID     string
	SpanID      string
	UserID      string
	RequestID   string
	Method      string
	Path        string
	StatusCode  int
	Latency     time.Duration
	ClientIP    string
	UserAgent   string
	RefererURL  string
	RequestSize int64
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
	if l.logger == nil {
		// Fallback to standard logging if logger not initialized
		fmt.Printf("[%s] %s %v\n", level, msg, attrs)
		return
	}
	
	// Get trace and span IDs from context
	span := trace.SpanFromContext(ctx)
	spanCtx := span.SpanContext()
	
	// Add trace context
	if spanCtx.HasTraceID() {
		attrs = append(attrs, attribute.String("trace.id", spanCtx.TraceID().String()))
	}
	if spanCtx.HasSpanID() {
		attrs = append(attrs, attribute.String("span.id", spanCtx.SpanID().String()))
	}
	
	// Add error if present
	if err != nil {
		attrs = append(attrs, 
			attribute.String("error.type", fmt.Sprintf("%T", err)),
			attribute.String("error.message", err.Error()),
		)
		
		// Add stack trace for errors
		if level == LogLevelError || level == LogLevelFatal {
			attrs = append(attrs, attribute.String("error.stack", getStackTrace()))
		}
	}
	
	// Add severity
	attrs = append(attrs, attribute.String("severity", string(level)))
	
	// Create log record
	record := log.Record{}
	record.SetTimestamp(time.Now())
	record.SetBody(log.StringValue(msg))
	record.SetSeverity(mapLogLevel(level))
	record.AddAttributes(attrs...)
	
	// Emit the log
	l.logger.Emit(ctx, record)
}

// mapLogLevel maps our log level to OpenTelemetry severity
func mapLogLevel(level LogLevel) log.Severity {
	switch level {
	case LogLevelDebug:
		return log.SeverityDebug
	case LogLevelInfo:
		return log.SeverityInfo
	case LogLevelWarn:
		return log.SeverityWarn
	case LogLevelError:
		return log.SeverityError
	case LogLevelFatal:
		return log.SeverityFatal
	default:
		return log.SeverityInfo
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
	// Store attributes in context for later use
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
