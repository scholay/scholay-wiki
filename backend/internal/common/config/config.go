// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package config

import (
	"log/slog"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Server           ServerConfig
	Database         DatabaseConfig
	Redis            RedisConfig
	JWT              JWTConfig
	Admin            AdminConfig
	SigNoz           SigNozConfig
	ExternalServices ExternalServicesConfig
	App              AppConfig_
}

// AppConfig_ 通用应用配置（避免与全局变量 AppConfig 冲突）
type AppConfig_ struct {
	GinMode              string // GIN_MODE: release / debug
	CORSAllowedOrigins   string // 逗号分隔的允许 CORS 来源
	TurnstileSecretKey   string // Cloudflare Turnstile 密钥
	FrontendUserURL      string // 前端用户门户 URL
	UseAdvancedSearchV2  bool   // 是否使用 V2 版智能检索
	IsRelease            bool   // 是否为 release 模式（预计算，方便使用）
}

type ExternalServicesConfig struct {
	SerperAPIKey   string
	CrossrefEmail  string
	UnpaywallEmail string
}

type ServerConfig struct {
	Port string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
}

type JWTConfig struct {
	Secret string
}

type AdminConfig struct {
	InitialUsername string
	InitialPassword string
}

type SigNozConfig struct {
	Endpoint      string
	ServiceName   string
	Environment   string
	EnableTracing bool
	EnableLogging bool
	EnableMetrics bool
	SamplingRate  float64
}

var AppConfig *Config

// Load loads configuration from environment variables
func Load() *Config {
	// Try to load .env file (optional in production)
	_ = godotenv.Load()

	AppConfig = &Config{
		Server: ServerConfig{
			Port: getEnv("SERVER_PORT", "8080"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "3306"),
			User:     getEnv("DB_USER", "scholar_user"),
			Password: getEnv("DB_PASSWORD", "scholar_pass"),
			DBName:   getEnv("DB_NAME", "scholar"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvAsInt("REDIS_DB", 0),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "default-secret-change-in-production"),
		},
		Admin: AdminConfig{
			InitialUsername: getEnv("ADMIN_INITIAL_USERNAME", "admin"),
			InitialPassword: getEnv("ADMIN_INITIAL_PASSWORD", "adminadmin"),
		},
		SigNoz: SigNozConfig{
			Endpoint:      getEnv("SIGNOZ_ENDPOINT", ""),
			ServiceName:   getEnv("SIGNOZ_SERVICE_NAME", "scholar-backend"),
			Environment:   getEnv("SIGNOZ_ENVIRONMENT", "production"),
			EnableTracing: getEnvAsBool("SIGNOZ_ENABLE_TRACING", false),
			EnableLogging: getEnvAsBool("SIGNOZ_ENABLE_LOGGING", false),
			EnableMetrics: getEnvAsBool("SIGNOZ_ENABLE_METRICS", false),
			SamplingRate:  getEnvAsFloat("SIGNOZ_SAMPLING_RATE", 1.0),
		},
		ExternalServices: ExternalServicesConfig{
			SerperAPIKey:   getEnv("SERPER_API_KEY", ""),
			CrossrefEmail:  getEnv("CROSSREF_EMAIL", ""),
			UnpaywallEmail: getEnv("UNPAYWALL_EMAIL", ""),
		},
	}

	// 通用应用配置
	ginMode := getEnv("GIN_MODE", "debug")
	useV2 := getEnv("USE_ADVANCED_SEARCH_V2", "true")
	AppConfig.App = AppConfig_{
		GinMode:             ginMode,
		CORSAllowedOrigins:  getEnv("CORS_ALLOWED_ORIGINS", ""),
		TurnstileSecretKey:  getEnv("TURNSTILE_SECRET_KEY", ""),
		FrontendUserURL:     getEnv("FRONTEND_USER_URL", ""),
		UseAdvancedSearchV2: useV2 != "false" && useV2 != "0",
		IsRelease:           ginMode == "release",
	}

	validate(AppConfig)
	slog.Info("Configuration loaded successfully")
	return AppConfig
}

// validate 校验关键配置项，对不安全的默认值发出警告
func validate(cfg *Config) {
	if cfg.JWT.Secret == "default-secret-change-in-production" {
		slog.Warn("JWT_SECRET 使用默认值，生产环境必须设置安全的密钥！")
	}
	if cfg.Database.Password == "scholar_pass" {
		slog.Warn("DB_PASSWORD 使用默认值，生产环境请修改数据库密码")
	}
	if cfg.Admin.InitialPassword == "adminadmin" {
		slog.Warn("ADMIN_INITIAL_PASSWORD 使用默认值，请在管理后台中修改管理员密码")
	}
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsBool(key string, defaultValue bool) bool {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseBool(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsFloat(key string, defaultValue float64) float64 {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseFloat(valueStr, 64)
	if err != nil {
		return defaultValue
	}
	return value
}
