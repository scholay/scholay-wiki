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
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server           ServerConfig
	Database         DatabaseConfig
	Redis            RedisConfig
	RedisPersist     RedisPersistConfig
	JWT              JWTConfig
	Admin            AdminConfig
	ExternalServices ExternalServicesConfig
	App              AppConfig_
	RateLimit        RateLimitConfig
	SEOSubmit        SEOSubmitConfig
	MinIO            MinIOConfig
	Umami            UmamiConfig
}

// UmamiConfig —— 后端通过 umami HTTP API 查统计数据,展示在 admin /analytics 自己的页面上。
//
// 简化策略:
//   - umami 容器永远跑在内网 `umami:3000`(写死,无需 env)
//   - umami 默认 admin 账号 admin/umami,backend 启动后用这个去 /api/auth/login 拿 token,
//     401 自动重登;管理员不应该改 umami 内部的密码(改了就要重启 backend)
//   - 只需要 WebsiteID(在 umami UI 创建网站后填回)+ AppSecret(给 umami 容器自己签名用,backend
//     这边其实不直接消费,但留下以便未来切换到 APP_SECRET 直签 JWT 方案)
type UmamiConfig struct {
	WebsiteID string // umami 后台创建网站后给的 UUID,前端 tracker 也读这个
	AppSecret string // 给 umami 容器自身签 token 用,backend 暂时不用
}

// MinIOConfig 对象存储(用户上传 PDF) —— S3 兼容协议。
// Endpoint 不带 scheme(由 UseSSL 决定 http/https);bucket 名启动时自动建。
//
// 留空 Endpoint 时,backend 会跳过 storage 初始化,PDF 上传/下载相关接口
// 直接返回 503"未启用",其余功能不受影响(灰度上线友好)。
type MinIOConfig struct {
	Endpoint                  string // host:port,例如 minio:9000
	AccessKey                 string
	SecretKey                 string
	BucketPaperPDFs           string // 存论文 PDF 的 bucket
	BucketFeedbackAttachments string // 存用户反馈附件 (图片/文件) 的 bucket
	BucketPeerReviewAssets    string // 存智能审稿稿件 + 附件 的 bucket
	BucketPrism               string // 存 Prism 智能写作编译产物 (PDF/log) + 二进制 asset 的 bucket
	BucketFeatureTools        string // 存功能广场工具 logo (真 logo + 生成的 SVG) 的 bucket
	BucketAgentArtifacts      string // 存 agent (claw 等) 成果交付物字节的 bucket
	BucketAgentAttachments    string // 存 agent 输入框**上传附件**字节的 bucket (0112;与产出物分桶,生命周期完全不同)
	BucketSkillBundles        string // 存 skill 市场用户上传的 skill 原始 bundle (tarball) 的 bucket
	UseSSL                    bool

	// AttachmentReaperDelete —— 输入框附件孤儿对象 reaper 是否**真删**(默认 false = dry-run)。
	//
	// 默认关不是犹豫:这个任务删的是用户上传的原始数据,误删不可逆,而生产至今没有任何备份。
	// 先跑 dry-run 看几天日志(orphans 计数 + 样本 key),核对判据无误再开。
	// env: AGENT_ATTACHMENT_REAPER_DELETE=true
	AttachmentReaperDelete bool
}

// RateLimitConfig 控制限流策略。
// IP 限流作为第一道 DoS 防线，全局生效；
// User 限流在认证路由组内按用户 id 限流（避免单用户霸占后端资源）。
type RateLimitConfig struct {
	IPRPS         int     // 每秒 IP 请求数（默认 100）
	IPBurst       int     // IP 令牌桶突发值（默认 200）
	UserRPS       int     // 每秒单用户请求数（默认 50）
	UserBurst     int     // 单用户令牌桶突发值（默认 100）
	// 注:曾有 VIPMultiplier（RATE_LIMIT_VIP_MULTIPLIER），但 is_vip 从无人写入 → 配了不生效的假象,已删(性能审计 #4)。
}

// AppConfig_ 通用应用配置（避免与全局变量 AppConfig 冲突）
type AppConfig_ struct {
	GinMode            string   // GIN_MODE: release / debug
	CORSAllowedOrigins string   // 逗号分隔的允许 CORS 来源
	TurnstileSecretKey string   // Cloudflare Turnstile 密钥
	FrontendUserURL    string   // 前端用户门户 URL
	TrustedProxies     []string // 反向代理信任名单(CIDR);gin ClientIP() 只认这些代理追加的 XFF
	IsRelease          bool     // 是否为 release 模式（预计算，方便使用）
	TestPaymentEnabled bool     // PAYMENT_TEST_ENABLED: 开启"测试支付"(无网关, 下单后一键完成履约), 仅供测试/演示, 生产务必关
}

type ExternalServicesConfig struct {
	SerperAPIKey  string
	CrossrefEmail string

	// 公开品牌邮箱(支持/反馈/法律页里展示)
	SupportEmail string

	// 注:
	//   - OpenAlex 等学术上游的 base URL 不在此配置 ——
	//     由 admin 后台 third_party_accounts 的 MinicodConfig.BaseURL 单 row 维护
	//     (已无 minicod.DefaultBaseURL 兜底常量:baseURL 严格来自该 row,env 层兜底无 API key 也无意义)。
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

// RedisPersistConfig 可选的「correctness 键」专用 Redis(noeviction):
// 吊销标记 / 每日配额 / SEO 推送队列等不能被 LRU 静默逐出的键放这里。
// Host 为空 = 未启用 → 代码回落到主 Redis(单实例部署行为不变)。
type RedisPersistConfig struct {
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
		RedisPersist: RedisPersistConfig{
			// 未设 REDIS_PERSIST_HOST = 不启用,correctness 键回落主 Redis(行为同今天)。
			Host:     getEnv("REDIS_PERSIST_HOST", ""),
			Port:     getEnv("REDIS_PERSIST_PORT", "6379"),
			Password: getEnv("REDIS_PERSIST_PASSWORD", ""),
			DB:       getEnvAsInt("REDIS_PERSIST_DB", 0),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "default-secret-change-in-production"),
		},
		Admin: AdminConfig{
			InitialUsername: getEnv("ADMIN_INITIAL_USERNAME", "admin"),
			InitialPassword: getEnv("ADMIN_INITIAL_PASSWORD", "adminadmin"),
		},
		ExternalServices: ExternalServicesConfig{
			SerperAPIKey:  getEnv("SERPER_API_KEY", ""),
			CrossrefEmail: getEnv("CROSSREF_EMAIL", ""),
			SupportEmail:  getEnv("SUPPORT_EMAIL", "support@scholay.com"),
		},
		RateLimit: RateLimitConfig{
			IPRPS:         getEnvAsInt("RATE_LIMIT_IP_RPS", 100),
			IPBurst:       getEnvAsInt("RATE_LIMIT_IP_BURST", 200),
			UserRPS:   getEnvAsInt("RATE_LIMIT_USER_RPS", 50),
			UserBurst: getEnvAsInt("RATE_LIMIT_USER_BURST", 100),
		},
	}

	// MinIO 对象存储 —— PDF + 反馈附件
	AppConfig.MinIO = MinIOConfig{
		Endpoint:                  getEnv("MINIO_ENDPOINT", ""),
		AccessKey:                 getEnv("MINIO_ACCESS_KEY", ""),
		SecretKey:                 getEnv("MINIO_SECRET_KEY", ""),
		BucketPaperPDFs:           getEnv("MINIO_BUCKET_PAPER_PDFS", "scholar-paper-pdfs"),
		BucketFeedbackAttachments: getEnv("MINIO_BUCKET_FEEDBACK_ATTACHMENTS", "scholar-feedback-attachments"),
		BucketPeerReviewAssets:    getEnv("MINIO_BUCKET_PEER_REVIEW_ASSETS", "scholar-peer-review-assets"),
		BucketPrism:               getEnv("MINIO_BUCKET_PRISM", "scholar-prism"),
		BucketFeatureTools:        getEnv("MINIO_BUCKET_FEATURE_TOOLS", "scholar-feature-tools"),
		BucketAgentArtifacts:      getEnv("MINIO_BUCKET_AGENT_ARTIFACTS", "scholar-agent-artifacts"),
		BucketAgentAttachments:    getEnv("MINIO_BUCKET_AGENT_ATTACHMENTS", "scholar-agent-attachments"),
		BucketSkillBundles:        getEnv("MINIO_BUCKET_SKILL_BUNDLES", "scholar-skill-bundles"),
		UseSSL:                    getEnvAsBool("MINIO_USE_SSL", false),
		AttachmentReaperDelete:    getEnvAsBool("AGENT_ATTACHMENT_REAPER_DELETE", false),
	}

	// Umami —— backend 用内网 umami:3000 + 默认 admin/umami 拿 token 调统计 API
	AppConfig.Umami = UmamiConfig{
		WebsiteID: getEnv("UMAMI_WEBSITE_ID", ""),
		AppSecret: getEnv("UMAMI_APP_SECRET", ""),
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
	AppConfig.App = AppConfig_{
		GinMode:            ginMode,
		CORSAllowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", ""),
		TurnstileSecretKey: getEnv("TURNSTILE_SECRET_KEY", ""),
		FrontendUserURL:    getEnv("FRONTEND_USER_URL", ""),
		TrustedProxies:     getTrustedProxies(),
		IsRelease:          ginMode == "release",
		TestPaymentEnabled: getEnvAsBool("PAYMENT_TEST_ENABLED", false),
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

	// ---- release 模式下的安全校验 ----
	//
	// DB_PASSWORD / ADMIN_INITIAL_PASSWORD 即便是默认值也【只告警不阻塞】(告警见 validate()):
	//   - 允许沿用已初始化 MySQL 的既有(默认)密码启动, 避免为"改密"被迫重置已有数据的库;
	//   - DB 只在内网 (scholar-network) 暴露, 不映射到宿主; admin 初始密码可在后台改。
	//   - 生产仍强烈建议在 .env 改成强密码 (改 DB 密码需同步 ALTER MySQL 用户, 见运维说明)。
	//
	// JWT_SECRET 例外, 仍 hard-fail: 默认密钥可伪造任意 token → 全站鉴权失守, 风险等级最高。
	if c.App.IsRelease {
		if c.JWT.Secret == "" || c.JWT.Secret == "default-secret-change-in-production" {
			errs = append(errs, "release 模式禁止使用默认 JWT_SECRET")
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

// getTrustedProxies 返回反代信任名单。后端只经 nginx(docker 私网)对外暴露,
// 所以默认信任 RFC1918 私网段 + 本机回环即可:gin 的 ClientIP() 会沿 X-Forwarded-For
// 从右往左跳过这些受信代理,取到 nginx 追加的真实客户端 IP,而不是客户端自己伪造的
// 最左 XFF 值(否则一切按 IP 的限流/风控都能用一个 header 绕过)。
// 可用 TRUSTED_PROXIES(逗号分隔 CIDR)覆盖,例如前面还有 CDN/LB 时。
func getTrustedProxies() []string {
	raw := getEnv("TRUSTED_PROXIES", "")
	if strings.TrimSpace(raw) == "" {
		return []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.1/32", "::1/128"}
	}
	var out []string
	for _, p := range strings.Split(raw, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
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
