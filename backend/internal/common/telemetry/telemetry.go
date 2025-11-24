package telemetry

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
)

var (
	tracer trace.Tracer
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

	// Create composite shutdown function
	shutdown = func(ctx context.Context) error {
		if tracerShutdown != nil {
			return tracerShutdown(ctx)
		}
		return nil
	}

	return shutdown, nil
}

// initTracing initializes OpenTelemetry tracing
func initTracing(ctx context.Context, cfg *Config, res *resource.Resource) (func(context.Context) error, error) {
	// Create OTLP trace exporter with retry configuration
	traceExporter, err := otlptrace.New(
		ctx,
		otlptracehttp.NewClient(
			otlptracehttp.WithEndpoint(cfg.Endpoint),
			otlptracehttp.WithInsecure(),
			otlptracehttp.WithTimeout(30*time.Second),
			otlptracehttp.WithRetry(otlptracehttp.RetryConfig{
				Enabled:         true,
				InitialInterval: 1 * time.Second,
				MaxInterval:     10 * time.Second,
				MaxElapsedTime:  1 * time.Minute,
			}),
			// Add compression to reduce payload size
			otlptracehttp.WithCompression(1), // 1 = gzip compression
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	// Create trace provider with optimized batch settings
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(
			traceExporter,
			sdktrace.WithMaxExportBatchSize(512),      // Batch up to 512 spans
			sdktrace.WithBatchTimeout(5*time.Second),  // Export every 5 seconds
			sdktrace.WithMaxQueueSize(2048),           // Queue up to 2048 spans
		),
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

// newResource creates a new resource with service information
func newResource(cfg *Config) (*resource.Resource, error) {
	// Create resource with attributes (without specifying SchemaURL to avoid conflicts)
	res := resource.NewWithAttributes(
		"", // Empty schema URL to avoid version conflicts
		semconv.ServiceName(cfg.ServiceName),
		semconv.ServiceVersion("1.0.0"),
		attribute.String("environment", cfg.Environment),
		attribute.String("service.namespace", "scholar"),
	)
	
	// Merge with default resource (without SchemaURL)
	defaultRes, err := resource.New(context.Background())
	if err != nil {
		return res, nil // Return custom resource if default fails
	}
	
	return resource.Merge(defaultRes, res)
}

// GetTracer returns the global tracer
func GetTracer() trace.Tracer {
	if tracer == nil {
		// Return a no-op tracer if not initialized
		return otel.Tracer("scholar-backend")
	}
	return tracer
}
