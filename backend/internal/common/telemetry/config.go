// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

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
		return &Config{
			Endpoint:      "",
			ServiceName:   "scholar-backend",
			Environment:   "production",
			EnableTracing: false,
			EnableLogging: false,
			EnableMetrics: false,
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
