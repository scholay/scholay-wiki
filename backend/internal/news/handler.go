// ============================================================================
// 情报(学术新闻)—— HTTP handler。
//   webhook(公开,验签即闸):POST /api/v1/webhook/minicod-news
//   public(免登录):GET /news · /news/trending · /news/detail/:slug
//   admin(AdminAuthMiddleware 之后):GET/PUT /admin/news-webhook/config
// ============================================================================

package news

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// deliveryLockTTL Redis 去重锁存活时长(覆盖上游 1m→6h 共 5 次重试窗口,留足余量)。
const deliveryLockTTL = 24 * time.Hour

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ─── webhook 接收 ──────────────────────────────────────────────────────────

// ReceiveWebhook POST /api/v1/webhook/minicod-news —— 公开端点,验签即闸,禁挂认证中间件。
// 返回:200=已接收 · 401=验签失败/未配密钥 · 400=body坏 · 500=落库失败(触发上游退避重试)。
func (h *Handler) ReceiveWebhook(c *gin.Context) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.String(http.StatusBadRequest, "read body failed")
		return
	}

	cfg, err := h.svc.GetConfig()
	if err != nil {
		slog.Error("news webhook: load config failed", "err", err)
		c.String(http.StatusInternalServerError, "config error")
		return
	}
	if cfg.WebhookSecret == "" {
		slog.Warn("news webhook: secret not configured, rejecting", "ip", c.ClientIP())
		c.String(http.StatusUnauthorized, "not configured")
		return
	}

	sig := c.GetHeader("X-Minicod-News-Signature")
	if !h.svc.VerifySignature(raw, sig, cfg.WebhookSecret) {
		slog.Warn("news webhook: signature verification failed", "ip", c.ClientIP())
		c.String(http.StatusUnauthorized, "signature verification failed")
		return
	}

	event := c.GetHeader("X-Minicod-News-Event")
	deliveryID := c.GetHeader("X-Minicod-News-Delivery")
	ctx := c.Request.Context()

	// 幂等:Redis 一次性锁(秒级)+ DB 已处理短路。idempotency 的真正安全网是 upsert by id。
	rdb := cache.GetRedis()
	lockKey := "news:delivery:" + deliveryID
	if rdb != nil && deliveryID != "" {
		ok, serr := rdb.SetNX(ctx, lockKey, "1", deliveryLockTTL).Result()
		if serr == nil && !ok {
			c.JSON(http.StatusOK, gin.H{"ok": true, "duplicate": true})
			return
		}
	}
	if exists, _ := h.svc.repo.DeliveryExists(deliveryID); exists {
		c.JSON(http.StatusOK, gin.H{"ok": true, "duplicate": true})
		return
	}

	// 处理失败:释放锁(让上游退避重试能重新处理),不写 deliveries。
	fail := func(status int, msg string) {
		if rdb != nil && deliveryID != "" {
			_ = rdb.Del(ctx, lockKey).Err()
		}
		c.String(status, msg)
	}

	switch event {
	case "news.created", "news.updated":
		if perr := h.svc.ProcessContent(raw); perr != nil {
			if errors.Is(perr, ErrBadPayload) {
				slog.Error("news webhook: bad content payload", "event", event, "err", perr)
				fail(http.StatusBadRequest, "bad payload")
				return
			}
			slog.Error("news webhook: process content failed", "event", event, "err", perr)
			fail(http.StatusInternalServerError, "process failed")
			return
		}
	case "news.heat":
		n, perr := h.svc.ProcessHeat(raw)
		if perr != nil {
			if errors.Is(perr, ErrBadPayload) {
				slog.Error("news webhook: bad heat payload", "err", perr)
				fail(http.StatusBadRequest, "bad payload")
				return
			}
			slog.Error("news webhook: process heat failed", "err", perr)
			fail(http.StatusInternalServerError, "process failed")
			return
		}
		slog.Info("news webhook: heat applied", "count", n)
	default:
		// 未知事件:记一条 ignored,回 200 避免上游无谓重试。
		_ = h.svc.repo.RecordDelivery(deliveryID, event, "ignored")
		slog.Warn("news webhook: unknown event ignored", "event", event)
		c.JSON(http.StatusOK, gin.H{"ok": true, "ignored": true})
		return
	}

	// 成功:记录已处理(DB 长期去重/审计)。冲突无害(并发去重已生效)。
	if rerr := h.svc.repo.RecordDelivery(deliveryID, event, "ok"); rerr != nil && !errors.Is(rerr, ErrDuplicateDelivery) {
		slog.Warn("news webhook: record delivery failed", "delivery_id", deliveryID, "err", rerr)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ─── 公开读取 ──────────────────────────────────────────────────────────────

// ListPublic GET /api/v1/news?sort=latest|heat&section=&page=&page_size=
func (h *Handler) ListPublic(c *gin.Context) {
	if !h.svc.Enabled() {
		c.JSON(http.StatusOK, gin.H{"items": []CardDTO{}, "has_more": false})
		return
	}
	sort := "latest"
	if c.Query("sort") == "heat" {
		sort = "heat"
	}
	section := c.Query("section")
	page := atoiDefault(c.Query("page"), 1, 1, 100000)
	pageSize := atoiDefault(c.Query("page_size"), 12, 1, 50)
	offset := (page - 1) * pageSize
	// 多取一条判断 has_more
	items, err := h.svc.ListCards(sort, section, pageSize+1, offset)
	if err != nil {
		slog.Error("news: list failed", "err", err)
		utils.ServerError(c, "获取情报列表失败")
		return
	}
	hasMore := len(items) > pageSize
	if hasMore {
		items = items[:pageSize]
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "has_more": hasMore})
}

// TrendingPublic GET /api/v1/news/trending?days=7&limit=10
func (h *Handler) TrendingPublic(c *gin.Context) {
	if !h.svc.Enabled() {
		c.JSON(http.StatusOK, gin.H{"items": []CardDTO{}})
		return
	}
	days := atoiDefault(c.Query("days"), 7, 0, 365)
	limit := atoiDefault(c.Query("limit"), 10, 1, 30)
	items, err := h.svc.Trending(days, limit)
	if err != nil {
		slog.Error("news: trending failed", "err", err)
		utils.ServerError(c, "获取热榜失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// GetDetailPublic GET /api/v1/news/detail/:slug
func (h *Handler) GetDetailPublic(c *gin.Context) {
	// 不存在/未开启统一 404(前端 ResourceError 友好态,防枚举)。
	if !h.svc.Enabled() {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	slug := c.Param("slug")
	detail, related, ok, err := h.svc.GetDetail(slug)
	if err != nil {
		slog.Error("news: get detail failed", "slug", slug, "err", err)
		utils.ServerError(c, "获取情报详情失败")
		return
	}
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": detail, "related": related})
}

// ServeNewsSitemap GET /sitemap-news.xml —— 全部已发布情报(/news/{slug});功能关闭则空。
// 由 news 自己提供(像 featuretool 的 tools sitemap),seo 索引只引用其 URL。
func (h *Handler) ServeNewsSitemap(c *gin.Context) {
	base := appconfig.CanonicalBaseURL()
	entries, err := h.svc.SitemapEntries()
	if err != nil {
		slog.Warn("news: sitemap entries failed", "err", err)
	}
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, e := range entries {
		fmt.Fprintf(&b,
			"  <url>\n    <loc>%s/news/%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>\n",
			base, e.Slug, e.LastMod)
	}
	b.WriteString(`</urlset>` + "\n")
	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.String(http.StatusOK, b.String())
}

// ─── admin 配置 ────────────────────────────────────────────────────────────

// adminConfigView GET 返回结构:接收 URL(展示给上游)+ enabled + 脱敏密钥。
type adminConfigView struct {
	Enabled       bool   `json:"enabled"`
	WebhookURL    string `json:"webhook_url"`
	WebhookSecret string `json:"webhook_secret"`
}

// webhookURL 从 SITE_URL 推导接收地址(纯展示,给上游配置用)。
func webhookURL() string {
	base := strings.TrimRight(os.Getenv("SITE_URL"), "/")
	return base + "/api/v1/webhook/minicod-news"
}

// GetConfig GET /admin/news-webhook/config —— 密钥脱敏(?show_sensitive=true 解蔽)。
func (h *Handler) GetConfig(c *gin.Context) {
	cfg, err := h.svc.GetConfig()
	if err != nil {
		utils.ServerError(c, "获取配置失败")
		return
	}
	secret := cfg.WebhookSecret
	utils.MaskSecret(&secret, utils.IsShowSensitive(c, "show_sensitive"))
	utils.Success(c, adminConfigView{
		Enabled:       cfg.Enabled,
		WebhookURL:    webhookURL(),
		WebhookSecret: secret,
	})
}

// adminConfigUpdate PUT body。
type adminConfigUpdate struct {
	Enabled       bool   `json:"enabled"`
	WebhookSecret string `json:"webhook_secret"`
}

// UpdateConfig PUT /admin/news-webhook/config —— 留空/遮罩保留旧密钥。
func (h *Handler) UpdateConfig(c *gin.Context) {
	var in adminConfigUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.BadRequest(c, "参数格式错误")
		return
	}
	existing, err := h.svc.GetConfig()
	if err != nil {
		utils.ServerError(c, "获取配置失败")
		return
	}
	// 密钥非必填:留空且无旧值 = 暂未配置(允许先开关、后填密钥)。
	// TrimSpace 防「粘贴带尾换行/空格」→ 验签全 401 却查不出原因的隐坑(上游密钥是 hex,无空白)。
	secret := existing.WebhookSecret
	if trimmed := strings.TrimSpace(in.WebhookSecret); trimmed != "" && trimmed != utils.MaskedSecretValue {
		secret = trimmed
	}
	if err := h.svc.UpdateConfig(&NewsWebhookConfig{Enabled: in.Enabled, WebhookSecret: secret}); err != nil {
		slog.Error("news: update config failed", "err", err)
		utils.ServerError(c, "保存配置失败")
		return
	}
	utils.SuccessWithMessage(c, "已保存", nil)
}

// atoiDefault 解析 query int,失败/越界用 def,并夹到 [min,max]。
func atoiDefault(s string, def, min, max int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
