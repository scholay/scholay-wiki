package telemetry

import (
	appconfig "scholar-backend/internal/common/config"
)

// Config holds the configuration for telemetry
type Config struct {
	// SigNoz configuration
	Endpoint    string
	ServiceName string
	Environment string
	
	// Feature flags
	EnableTracing bool
	EnableLogging bool
	EnableMetrics bool
	
	// Sampling
	SamplingRate float64
}

// LoadConfig loads telemetry configuration from main app config
func LoadConfig() *Config {
	cfg := appconfig.AppConfig
	if cfg == nil {
		// Fallback to defaults if config not loaded yet
		return &Config{
			Endpoint:      "http://198.44.187.186:4318",
			ServiceName:   "scholar-backend",
			Environment:   "production",
			EnableTracing: true,
			EnableLogging: true,
			EnableMetrics: true,
			SamplingRate:  1.0,
		}
	}
	
	return &Config{
		Endpoint:      cfg.SigNoz.Endpoint,
		ServiceName:   cfg.SigNoz.ServiceName,
		Environment:   cfg.SigNoz.Environment,
		EnableTracing: cfg.SigNoz.EnableTracing,
		EnableLogging: cfg.SigNoz.EnableLogging,
		EnableMetrics: cfg.SigNoz.EnableMetrics,
		SamplingRate:  cfg.SigNoz.SamplingRate,
	}
}
