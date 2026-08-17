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
	"net/url"
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

	// ── 爬虫监控旁路(internal/crawlerwatch)──
	// umami 常规采集 = 页面 JS tracker + 服务端 isbot 过滤,两道机制都看不见爬虫。
	// backend 在中间件层识别已知搜索引擎/AI 爬虫 UA,把命中异步 POST 到一个
	// **独立**的爬虫监控 website(千万别复用上面 WebsiteID 的用户统计站点,
	// 否则爬虫事件会污染真人 PV/UV)。
	CrawlerWebsiteID string // 专用「爬虫监控」website 的 UUID;空 = 功能整体关闭(中间件不挂载)
	CrawlerBaseURL   string // 可选 override;空 → 与统计客户端同源的内网默认 http://umami:3000
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
	BucketNewsCovers          string // 存情报封面缩略图 (webhook 后台生成的 ~640px JPEG) 的 bucket
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

// 部署环境角色(env APP_ENV)。
//
// 这是**这台机器扮演什么角色**,与 GIN_MODE(gin 的日志/调试档位)是两件事:
// 一个测试环境通常也跑 GIN_MODE=release,但它不是权威站点。
//
// 存在的理由:区分两套环境需要拨动的开关不止一个(是否可被索引、是否对外推送、
// 是否上报统计、是否允许测试支付……)。逐个记 = 迟早漏一个,而漏掉的那个恰恰
// 是最贵的(比如测试站被搜索引擎收录成权威站的镜像)。APP_ENV 把「这是哪套环境」
// 收敛成**一次决策**,其余开关从它派生默认值。
//
// ⚠️ 派生的是**默认值**,不是强制值 —— 显式设置的 env 永远优先。
const (
	AppEnvProd = "prod" // 权威生产站:可被索引、对外推送、真实支付
	AppEnvTest = "test" // 测试 / 预发 / 克隆:默认不可索引、不对外推送
	AppEnvDev  = "dev"  // 本机开发
)

// AppEnvName 返回归一化后的 APP_ENV。
//
// 🔴 未设置时返回 prod。这是刻意的向后兼容:本变量 2026-08-13 才引入,而生产的
// .env 里没有这一行 —— 若未设置按 test 处理,一次升级就会让已上线的站点静默
// 从搜索引擎里掉出去(几周后才发现、恢复更久)。让「旧配置 = 旧行为」。
// 新环境靠 deploy.sh 的强制检查来保证它被显式写上,而不是靠这个默认值。
func AppEnvName() string {
	switch strings.ToLower(strings.TrimSpace(getEnv("APP_ENV", ""))) {
	case AppEnvTest, "testing", "staging", "stage", "preview":
		return AppEnvTest
	case AppEnvDev, "development", "local":
		return AppEnvDev
	default:
		return AppEnvProd
	}
}

// IsProdEnv 本环境是不是权威生产站。
func IsProdEnv() bool { return AppEnvName() == AppEnvProd }

// AppConfig_ 通用应用配置（避免与全局变量 AppConfig 冲突）
type AppConfig_ struct {
	Env                string   // APP_ENV: prod / test / dev —— 这台机器扮演的角色
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
			// 默认必须为空,不能是任何真实邮箱 —— 这个值会 ① 下发给前端当客服邮箱兜底,
			// ② 拼进 Unpaywall / Crossref 的礼貌池请求(对方按 email 维度限速)。
			// 留一个生产邮箱当默认值,等于让任何漏配 SUPPORT_EMAIL 的环境冒用生产身份
			// 对外发请求,被限速的是生产。空值时调用方各自降级(见 openaccess.go)。
			SupportEmail: getEnv("SUPPORT_EMAIL", ""),
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
		BucketNewsCovers:          getEnv("MINIO_BUCKET_NEWS_COVERS", "scholar-news-covers"),
		UseSSL:                    getEnvAsBool("MINIO_USE_SSL", false),
		AttachmentReaperDelete:    getEnvAsBool("AGENT_ATTACHMENT_REAPER_DELETE", false),
	}

	// Umami —— backend 用内网 umami:3000 + 默认 admin/umami 拿 token 调统计 API
	AppConfig.Umami = UmamiConfig{
		WebsiteID:        getEnv("UMAMI_WEBSITE_ID", ""),
		AppSecret:        getEnv("UMAMI_APP_SECRET", ""),
		CrawlerWebsiteID: getEnv("UMAMI_CRAWLER_WEBSITE_ID", ""),
		CrawlerBaseURL:   getEnv("UMAMI_CRAWLER_BASE_URL", ""),
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
		Env:                AppEnvName(),
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
		// SEO_BASE_URL 同样 hard-fail:它是全站唯一的对外绝对 URL 来源(canonical /
		// og:url / sitemap <loc> / 邮件正文链接 / SEO 主动推送 origin,共 24 处消费点)。
		// 以前它有个生产域名的默认值,于是「漏配」和「配对了」在启动时完全同形 ——
		// 任何环境漏配都会静默宣称自己是生产站。现在没有默认值了,必须显式给。
		if strings.TrimSpace(getEnv("SEO_BASE_URL", "")) == "" {
			errs = append(errs, "release 模式必须显式设置 SEO_BASE_URL(站点权威域名,如 https://www.example.com);compose 由 .env 的 SITE_URL fan-out")
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

// devFallbackBaseURL debug 模式下 SEO_BASE_URL 缺省时的回落值。
//
// 刻意是 localhost 而**不是**任何真实域名:回落值会流进 canonical、og:url、
// sitemap <loc>、邮件正文里的绝对链接、SEO 主动推送的 origin。一旦回落到某个
// 真实站点的域名,漏配 SEO_BASE_URL 的环境就会静默宣称自己是那个站点 ——
// 这类错误不报错、不留日志,只在搜索引擎那头显形。localhost 至少是自证的错。
const devFallbackBaseURL = "http://localhost:5411"

// CanonicalBaseURL 站点权威域名，用作 sitemap <loc> 前缀和 HTML canonical 标签。
// 唯一来源是环境变量 SEO_BASE_URL(compose 里由 .env 的 SITE_URL fan-out)。
//
// 权威域名要与全站对外 URL 完全一致(含 www 与否):
//   - 整站统一一个 host,避免两套 URL 让 Google 判定 duplicate content
//   - sitemap <loc>、canonical link、Open Graph url 必须逐字一致
//   - 非权威形态(如 apex)应通过 301 跳到权威 host,在 nginx/CDN 层做
//
// 缺省行为:release 模式下 Validate() 已把「为空」拦成启动失败,走不到回落;
// debug / 本地裸跑回落 localhost。**任何情况下都不回落到真实生产域名。**
// 返回值保证无尾部 "/"，调用方直接拼接 path 即可。
func CanonicalBaseURL() string {
	v := strings.TrimSpace(getEnv("SEO_BASE_URL", ""))
	if v == "" {
		v = devFallbackBaseURL
	}
	// 去掉尾部 "/" 让拼接更一致
	for len(v) > 0 && v[len(v)-1] == '/' {
		v = v[:len(v)-1]
	}
	return v
}

// CanonicalHost 从 CanonicalBaseURL 取裸 host(如 "www.example.com")。
// 解析失败或未配置时返回空串 —— 调用方必须把空串当作「无法判定」,
// 不能当作「不匹配」(否则漏配会把生产自己判成非权威 host)。
func CanonicalHost() string {
	u, err := url.Parse(CanonicalBaseURL())
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Host
}

// SEOIndexable 本环境是否允许被搜索引擎索引。
//
// 取值:显式的 SEO_INDEXABLE 优先;未设置时**从 APP_ENV 派生** —— prod 可索引,
// test/dev 不可索引。
//
// 这个派生解掉了一个本来两头不讨好的默认值选择:单独看 SEO_INDEXABLE,默认 true
// 会让新环境忘配就被收录,默认 false 会让老生产升级后静默掉出索引 —— 两种误配
// 代价都不小。挂到 APP_ENV 上之后,两边同时正确:生产不写 APP_ENV(或写 prod)
// 保持可索引,测试环境写一次 APP_ENV=test 就自动关掉,不必再记住这一行。
//
// false 时的完整效果(见 internal/seo/handler.go 与 internal/config/handler_ssr.go):
//   - /robots.txt 只输出 Disallow: /,且不输出 Sitemap 指令
//   - /sitemap*.xml 与 IndexNow key 文件返回 404
//   - 所有 SSR 响应带 X-Robots-Tag: noindex, nofollow 并注入 <meta name="robots">
//
// robots.txt 只劝阻抓取,已被外链/CT 日志发现的 URL 仍需 noindex 才不进索引,
// 所以三者必须一起生效,少一样都堵不住。
func SEOIndexable() bool {
	return getEnvAsBool("SEO_INDEXABLE", IsProdEnv())
}

// RequestIndexable 判断某个具体请求能否被索引。
//
// 目前等价于 SEOIndexable() —— 保留这个按请求取值的入口,是为了将来真要按请求
// 维度分流时有个统一的地方,调用方(robots / sitemap 路由 / SSR 写出口)不用再改。
//
// ── 这里曾经有一道「请求 Host ≠ 权威 host 就强制 noindex」的守卫,已移除 ──
// 初衷是给「某个环境忘了声明自己不是权威站、却对外可达」兜底。但它的失败模式
// 与它要防的问题严重不对称:
//
//   · 它能防的:一个配置照抄了权威站、又用别的域名对外服务的环境被收录。
//     而这个场景现在由 APP_ENV 覆盖 —— 那是一次显式决策,deploy.sh 还强制它必须存在。
//   · 它会误伤的:**任何 Host 头与配置不完全一致的情况都会让权威站静默全站 noindex**。
//     CDN / 反代改写 Host、apex 在 301 生效前被直接访问、SEO_BASE_URL 写法有细微
//     出入(带不带 www)、健康检查用 IP 访问…… 全都会命中。
//
// 也就是说,这道「保险」自身的故障后果,恰好就是它想避免的那一个(权威站掉出索引),
// 而且是静默的、要几周后排名塌了才会被发现。用一个不可靠的自动判断去兜一个已经
// 有显式开关的场景,是净负收益。
//
// 参数保留是为了调用点不必改动;当前不使用。
func RequestIndexable(_ string) bool {
	return SEOIndexable()
}

// defaultSEOOnMissHourlyBudget SSR 冷门实体「现拉上游」的每小时全局默认配额。
//
// 200/h 的来路:生产 24h 实测**真人**实体页浏览量 31 次/天,而爬虫 6.5 万次/天。
// 200/h ≈ 真人用量的 100 倍余量,对真实用户等于不存在;它存在的唯一理由是
// 「伪装成浏览器 UA 的爬虫不能把 minicod 配额抽干」—— UA 闸门挡不住谎报 UA 的,
// 预算能。
const defaultSEOOnMissHourlyBudget = 200

// SEOOnMissHourlyBudget SSR on-miss 现拉上游的每小时全局配额(env SEO_ONMISS_HOURLY_BUDGET)。
//
//	0        = 不限(仅解除预算,**不解除**爬虫 UA 闸门)
//	负数/缺省/非法值 = 默认 200
func SEOOnMissHourlyBudget() int {
	v := getEnvAsInt("SEO_ONMISS_HOURLY_BUDGET", defaultSEOOnMissHourlyBudget)
	if v < 0 {
		return defaultSEOOnMissHourlyBudget
	}
	return v
}

// GoogleSiteVerification 返回 Google Search Console 的 HTML-tag 验证 token
// (env GOOGLE_SITE_VERIFICATION,即 <meta name="google-site-verification"> 的
// content 值,不含标签本身)。非空时 SSR 会在每个页面 <head> 注入验证 meta。
// 留空 = 不注入(推荐用 DNS TXT 做域名级验证时无需此项)。
func GoogleSiteVerification() string {
	return strings.TrimSpace(getEnv("GOOGLE_SITE_VERIFICATION", ""))
}
