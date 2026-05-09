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
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server           ServerConfig
	Database         DatabaseConfig
	Redis            RedisConfig
	JWT              JWTConfig
	Admin            AdminConfig
	ExternalServices ExternalServicesConfig
	App              AppConfig_
	RateLimit        RateLimitConfig
	SEOSubmit        SEOSubmitConfig
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

	// 外部 PDF 服务(用于解析/抽取/转换),空值时 pdf.Service 不会工作。
	PDFServiceURL string

	// 公开品牌邮箱(支持/反馈/法律页里展示)
	SupportEmail string

	// 注:
	//   - OpenAlex 等学术上游的 base URL 不在此配置 ——
	//     由 admin 后台 third_party_accounts 的 MinicodConfig.BaseURL 单 row 维护,
	//     没配则用 minicod.DefaultBaseURL 常量。env 层兜底无 API key 也无意义。
	//   - 系统级 admin 邮箱域名(自动生成 admin@xxx 用)硬编码在 admin/service.go,
	//     这是历史 admin 账户的兼容路径,新 admin 账户都用真实邮箱,不再需要 env 化。
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

// SEOSubmitConfig 主动 SEO 提交配置:URL 入队后由后台 worker 批量推到搜索引擎。
//
// 当前只对接两类:
//   - IndexNow 协议(一次推 → Bing / Yandex / Naver / Seznam.cz / Yep 同时收)
//   - 百度推送 API(国内独家)
//
// Google 等不收第三方推送(2023 起 sitemap ping 被废弃,Indexing API 仅 JobPosting),
// 这部分依然依赖 sitemap.xml + GSC 自然抓取。
type SEOSubmitConfig struct {
	// 总开关。worker / 入队都受控于此,关掉即整套静默
	Enabled bool

	// IndexNow 协议
	// Key: 8-128 字符的字符串,需要在站点根目录暴露 /{Key}.txt 验证
	// (后端会自动响应 GET /{Key}.txt 返回 Key 内容,详见 seosubmit.RegisterKeyFileRoute)
	IndexNowEnabled bool
	IndexNowKey     string

	// 百度推送
	// Token: 站长平台 https://ziyuan.baidu.com → 普通收录 → 推送页 拿到的 token
	// Site:  对应已验证的站点 host(如 "www.scholay.com",注意不带 https://)
	BaiduEnabled bool
	BaiduToken   string
	BaiduSite    string
	// 百度普通收录每天有配额(50-1000 取决于站点),超限会 4xx,这里软限避免无效请求
	BaiduDailyQuota int

	// Worker 节奏
	WorkerInterval time.Duration // worker 检查 / 拉取 / 推送一轮的间隔
	BatchSize      int           // 单次从队列拉取并推送的 URL 数
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
		ExternalServices: ExternalServicesConfig{
			SerperAPIKey:   getEnv("SERPER_API_KEY", ""),
			CrossrefEmail:  getEnv("CROSSREF_EMAIL", ""),
			UnpaywallEmail: getEnv("UNPAYWALL_EMAIL", "api@scholay.com"),
			PDFServiceURL:  getEnv("PDF_SERVICE_URL", "https://pdf.scholay.com/api/v1/pdf"),
			SupportEmail:   getEnv("SUPPORT_EMAIL", "support@scholay.com"),
		},
		RateLimit: RateLimitConfig{
			IPRPS:         getEnvAsInt("RATE_LIMIT_IP_RPS", 100),
			IPBurst:       getEnvAsInt("RATE_LIMIT_IP_BURST", 200),
			UserRPS:       getEnvAsInt("RATE_LIMIT_USER_RPS", 50),
			UserBurst:     getEnvAsInt("RATE_LIMIT_USER_BURST", 100),
			VIPMultiplier: getEnvAsFloat("RATE_LIMIT_VIP_MULTIPLIER", 3.0),
		},
	}

	// 主动 SEO 提交
	AppConfig.SEOSubmit = SEOSubmitConfig{
		Enabled:         getEnvAsBool("SEO_SUBMIT_ENABLED", false),
		IndexNowEnabled: getEnvAsBool("INDEXNOW_ENABLED", false),
		IndexNowKey:     getEnv("INDEXNOW_KEY", ""),
		BaiduEnabled:    getEnvAsBool("BAIDU_PUSH_ENABLED", false),
		BaiduToken:      getEnv("BAIDU_PUSH_TOKEN", ""),
		BaiduSite:       getEnv("BAIDU_PUSH_SITE", ""),
		BaiduDailyQuota: getEnvAsInt("BAIDU_PUSH_DAILY_QUOTA", 1000),
		WorkerInterval:  time.Duration(getEnvAsInt("SEO_PUSH_WORKER_INTERVAL_SECONDS", 300)) * time.Second,
		BatchSize:       getEnvAsInt("SEO_PUSH_BATCH_SIZE", 100),
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
//   - 数值范围越界（端口）任何模式都报错
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

// CanonicalBaseURL 站点权威域名，用作 sitemap <loc> 前缀和 HTML canonical 标签。
// 优先读环境变量 SEO_BASE_URL；默认 https://www.scholay.com。
//
// 必须使用带 www 的版本作为权威域名:
//   - 整站统一一个 host,避免 www / apex 两套 URL 让 Google 判定 duplicate content
//   - sitemap <loc>、canonical link、Open Graph url 必须保持完全一致(包括 www)
//   - apex(scholay.com) 应通过 301 跳到 www,在 nginx/CDN 层做
//
// 变更此值会影响 SEO 收录 —— 修改前确认搜索引擎后台的资源地址已经同步更新。
// 返回值保证无尾部 "/"，调用方直接拼接 path 即可。
func CanonicalBaseURL() string {
	v := getEnv("SEO_BASE_URL", "https://www.scholay.com")
	// 去掉尾部 "/" 让拼接更一致
	for len(v) > 0 && v[len(v)-1] == '/' {
		v = v[:len(v)-1]
	}
	return v
}
