// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package config

import (
	"errors"
	"fmt"
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
	RateLimit        RateLimitConfig
}

// RateLimitConfig 控制限流策略。
// IP 限流作为第一道 DoS 防线，全局生效；
// User 限流在认证路由组内按用户 id 限流（避免单用户霸占后端资源）。
type RateLimitConfig struct {
	IPRPS         int     // 每秒 IP 请求数（默认 100）
	IPBurst       int     // IP 令牌桶突发值（默认 200）
	UserRPS       int     // 每秒单用户请求数（默认 50）
	UserBurst     int     // 单用户令牌桶突发值（默认 100）
	VIPMultiplier float64 // VIP/付费用户速率倍数（默认 3.0）
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
		RateLimit: RateLimitConfig{
			IPRPS:         getEnvAsInt("RATE_LIMIT_IP_RPS", 100),
			IPBurst:       getEnvAsInt("RATE_LIMIT_IP_BURST", 200),
			UserRPS:       getEnvAsInt("RATE_LIMIT_USER_RPS", 50),
			UserBurst:     getEnvAsInt("RATE_LIMIT_USER_BURST", 100),
			VIPMultiplier: getEnvAsFloat("RATE_LIMIT_VIP_MULTIPLIER", 3.0),
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

// validate 校验关键配置项，对不安全的默认值发出警告（debug 模式不阻塞启动）
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

// Validate 严格校验：release 模式下任何不安全/不合法配置直接 fail-fast，
// debug 模式下仅 warn。供 main.go 在 Load() 后调用。
//
// 设计原则：
//   - 默认密钥/密码在生产是 hard error
//   - 数值范围越界（端口/采样率）任何模式都报错
//   - SigNoz 启用但 Endpoint 为空：报错（启动后才发现配置错代价更高）
func (c *Config) Validate() error {
	var errs []string

	// ---- 必填/数值合法性（任何模式都校验）----
	if c.Server.Port == "" {
		errs = append(errs, "SERVER_PORT 为空")
	} else if p, err := strconv.Atoi(c.Server.Port); err != nil || p <= 0 || p > 65535 {
		errs = append(errs, fmt.Sprintf("SERVER_PORT 非法: %q", c.Server.Port))
	}
	if c.Database.Host == "" {
		errs = append(errs, "DB_HOST 为空")
	}
	if c.Database.DBName == "" {
		errs = append(errs, "DB_NAME 为空")
	}
	if p, err := strconv.Atoi(c.Database.Port); err != nil || p <= 0 || p > 65535 {
		errs = append(errs, fmt.Sprintf("DB_PORT 非法: %q", c.Database.Port))
	}
	if p, err := strconv.Atoi(c.Redis.Port); err != nil || p <= 0 || p > 65535 {
		errs = append(errs, fmt.Sprintf("REDIS_PORT 非法: %q", c.Redis.Port))
	}
	if c.SigNoz.SamplingRate < 0 || c.SigNoz.SamplingRate > 1 {
		errs = append(errs, fmt.Sprintf("SIGNOZ_SAMPLING_RATE 越界(应在 0~1): %v", c.SigNoz.SamplingRate))
	}
	// 启用了 SigNoz 任意子功能但 Endpoint 为空 → 启动后才发现，提前报错
	if (c.SigNoz.EnableTracing || c.SigNoz.EnableLogging || c.SigNoz.EnableMetrics) && c.SigNoz.Endpoint == "" {
		errs = append(errs, "SIGNOZ_* 启用但 SIGNOZ_ENDPOINT 为空")
	}

	// 限流合理性：rps<=0 直接放过所有请求属于配置错误
	if c.RateLimit.IPRPS <= 0 {
		errs = append(errs, fmt.Sprintf("RATE_LIMIT_IP_RPS 必须 > 0，当前 %d", c.RateLimit.IPRPS))
	}
	if c.RateLimit.UserRPS <= 0 {
		errs = append(errs, fmt.Sprintf("RATE_LIMIT_USER_RPS 必须 > 0，当前 %d", c.RateLimit.UserRPS))
	}
	if c.RateLimit.VIPMultiplier < 1 {
		errs = append(errs, fmt.Sprintf("RATE_LIMIT_VIP_MULTIPLIER 必须 >= 1，当前 %v", c.RateLimit.VIPMultiplier))
	}

	// ---- release 模式下的安全校验 ----
	if c.App.IsRelease {
		if c.JWT.Secret == "" || c.JWT.Secret == "default-secret-change-in-production" {
			errs = append(errs, "release 模式禁止使用默认 JWT_SECRET")
		}
		if c.Database.Password == "" || c.Database.Password == "scholar_pass" {
			errs = append(errs, "release 模式禁止使用默认 DB_PASSWORD")
		}
		if c.Admin.InitialPassword == "" || c.Admin.InitialPassword == "adminadmin" {
			errs = append(errs, "release 模式禁止使用默认 ADMIN_INITIAL_PASSWORD")
		}
	}

	if len(errs) == 0 {
		return nil
	}
	return errors.New("config invalid: " + joinErrs(errs))
}

func joinErrs(errs []string) string {
	out := ""
	for i, e := range errs {
		if i > 0 {
			out += "; "
		}
		out += e
	}
	return out
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
