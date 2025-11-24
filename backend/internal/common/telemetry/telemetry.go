package telemetry

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
)

var (
	tracer       trace.Tracer
	loggerProvider *log.LoggerProvider
)

// Initialize sets up OpenTelemetry with SigNoz
func Initialize(ctx context.Context, cfg *Config) (shutdown func(context.Context) error, err error) {
	// Create resource
	res, err := newResource(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Initialize tracing if enabled
	var tracerShutdown func(context.Context) error
	if cfg.EnableTracing {
		tracerShutdown, err = initTracing(ctx, cfg, res)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize tracing: %w", err)
		}
	}

	// Initialize logging if enabled
	var logShutdown func(context.Context) error
	if cfg.EnableLogging {
		logShutdown, err = initLogging(ctx, cfg, res)
		if err != nil {
			if tracerShutdown != nil {
				_ = tracerShutdown(ctx)
			}
			return nil, fmt.Errorf("failed to initialize logging: %w", err)
		}
	}

	// Create composite shutdown function
	shutdown = func(ctx context.Context) error {
		var firstErr error
		
		if tracerShutdown != nil {
			if err := tracerShutdown(ctx); err != nil && firstErr == nil {
				firstErr = err
			}
		}
		
		if logShutdown != nil {
			if err := logShutdown(ctx); err != nil && firstErr == nil {
				firstErr = err
			}
		}
		
		return firstErr
	}

	return shutdown, nil
}

// initTracing initializes OpenTelemetry tracing
func initTracing(ctx context.Context, cfg *Config, res *resource.Resource) (func(context.Context) error, error) {
	// Create OTLP trace exporter
	traceExporter, err := otlptrace.New(
		ctx,
		otlptracehttp.NewClient(
			otlptracehttp.WithEndpoint(cfg.Endpoint),
			otlptracehttp.WithInsecure(),
			otlptracehttp.WithTimeout(30*time.Second),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	// Create trace provider
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.TraceIDRatioBased(cfg.SamplingRate)),
	)

	// Set global trace provider
	otel.SetTracerProvider(tp)
	
	// Set global propagator
	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		),
	)

	// Get tracer
	tracer = tp.Tracer("scholar-backend")

	return tp.Shutdown, nil
}

// initLogging initializes OpenTelemetry logging
func initLogging(ctx context.Context, cfg *Config, res *resource.Resource) (func(context.Context) error, error) {
	// Create OTLP log exporter
	logExporter, err := otlploghttp.New(ctx,
		otlploghttp.WithEndpoint(cfg.Endpoint),
		otlploghttp.WithInsecure(),
		otlploghttp.WithTimeout(30*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create log exporter: %w", err)
	}

	// Create log provider
	loggerProvider = log.NewLoggerProvider(
		log.WithResource(res),
		log.WithProcessor(log.NewBatchProcessor(logExporter)),
	)

	// Set global logger provider
	global.SetLoggerProvider(loggerProvider)

	return loggerProvider.Shutdown, nil
}

// newResource creates a new resource with service information
func newResource(cfg *Config) (*resource.Resource, error) {
	return resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion("1.0.0"),
			attribute.String("environment", cfg.Environment),
			attribute.String("service.namespace", "scholar"),
		),
	)
}

// GetTracer returns the global tracer
func GetTracer() trace.Tracer {
	if tracer == nil {
		// Return a no-op tracer if not initialized
		return otel.Tracer("scholar-backend")
	}
	return tracer
}

// GetLoggerProvider returns the global logger provider
func GetLoggerProvider() *log.LoggerProvider {
	return loggerProvider
}
