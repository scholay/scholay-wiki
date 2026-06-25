// ============================================================================
// 情报(学术新闻)—— 业务层。
//   - 验签:对原始 body 字节做 HMAC-SHA256,常量时间比较(VerifySignature)
//   - 落库:ProcessContent(created/updated) / ProcessHeat(批量热度)
//   - 配置:GetConfig / UpdateConfig / Enabled
//   - 公开读:ListCards / Trending / GetDetail
// 封面图:从 body_html 抽第一张 <img src>(上游链接直用,不再 rehost)。
// ============================================================================

package news

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
)

// ErrBadPayload body 解析失败(→ 400,重试无意义但仍按契约让上游重试到死信)。
var ErrBadPayload = errors.New("bad payload")

// PushSubmitter 由 seosubmit.Service 实现:把 /news/{slug} 喂给主动收录队列(百度/IndexNow…)。
// 可选;nil 或队列未启用时为 no-op。news 不直接 import seosubmit(解耦)。
type PushSubmitter interface {
	EnqueuePaths(ctx context.Context, paths []string)
}

type Service struct {
	repo      *Repository
	submitter PushSubmitter
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// SetPushSubmitter 注入主动 SEO 提交器(bootstrap 调一次)。
func (s *Service) SetPushSubmitter(p PushSubmitter) { s.submitter = p }

// ─── 验签 ──────────────────────────────────────────────────────────────────

// VerifySignature 对原始 body 字节做 HMAC-SHA256(hex),与 sigHeader(去 sha256= 前缀)
// 常量时间比较。secret/sig 为空一律 false(fail-closed)。
func (s *Service) VerifySignature(rawBody []byte, sigHeader, secret string) bool {
	if secret == "" || sigHeader == "" {
		return false
	}
	got := strings.TrimPrefix(sigHeader, "sha256=")
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(rawBody)
	want := hex.EncodeToString(mac.Sum(nil))
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// ─── 配置 ──────────────────────────────────────────────────────────────────

func (s *Service) GetConfig() (*NewsWebhookConfig, error) { return s.repo.GetConfig() }
func (s *Service) UpdateConfig(in *NewsWebhookConfig) error { return s.repo.UpdateConfig(in) }

// Enabled 前端展示总开关(关闭时公开 API 不返数据)。读失败按关闭处理。
func (s *Service) Enabled() bool {
	c, err := s.repo.GetConfig()
	return err == nil && c.Enabled
}

// ─── webhook 落库 ──────────────────────────────────────────────────────────

// contentPayload news.created / news.updated 的 body。
type contentPayload struct {
	Event   string      `json:"event"`
	Version int         `json:"version"`
	Item    itemPayload `json:"item"`
}

type itemPayload struct {
	ID              string   `json:"id"`
	Slug            string   `json:"slug"`
	URL             string   `json:"url"`
	ReportID        string   `json:"report_id"`
	ReportType      string   `json:"report_type"`
	Section         string   `json:"section"`
	SectionLabel    string   `json:"section_label"`
	Title           string   `json:"title"`
	Summary         string   `json:"summary"`
	BodyMD          string   `json:"body_md"`
	BodyHTML        string   `json:"body_html"`
	CredibilityNote string   `json:"credibility_note"`
	OriginalDate    string   `json:"original_date"`
	PublishedAt     string   `json:"published_at"`
	Sources         []Source `json:"sources"`
	Status          string   `json:"status"`
	IsFeatured      bool     `json:"is_featured"`
	Score           float64  `json:"score"`
	ViewCount       int64    `json:"view_count"`
	HeatExternal    float64  `json:"heat_external"`
	HeatTrend       float64  `json:"heat_trend"`
	HeatMeasuredAt  string   `json:"heat_measured_at"`
	CreatedAt       string   `json:"created_at"`
	UpdatedAt       string   `json:"updated_at"`
}

// heatPayload news.heat 的 body(批量,只含热度)。
type heatPayload struct {
	Event      string `json:"event"`
	Version    int    `json:"version"`
	MeasuredAt string `json:"measured_at"`
	Count      int    `json:"count"`
	Items      []struct {
		ID             string  `json:"id"`
		Slug           string  `json:"slug"`
		URL            string  `json:"url"`
		HeatExternal   float64 `json:"heat_external"`
		HeatTrend      float64 `json:"heat_trend"`
		HeatMeasuredAt string  `json:"heat_measured_at"`
	} `json:"items"`
}

// ProcessContent 处理 news.created / news.updated:解析 → 映射 → upsert(按 id)。
func (s *Service) ProcessContent(rawBody []byte) error {
	var p contentPayload
	if err := json.Unmarshal(rawBody, &p); err != nil {
		return ErrBadPayload
	}
	// id 是幂等/覆盖主键;slug 是 URL + 唯一索引键。二者缺一即坏负载(空 slug 还会撞 uk_news_slug
	// 变成「毒丸」:同一空 slug 第二条 insert 失败 → 500 → 上游无限重试到死信)。
	if p.Item.ID == "" || p.Item.Slug == "" {
		return ErrBadPayload
	}
	it := p.Item

	sourcesJSON := "[]"
	if len(it.Sources) > 0 {
		if b, err := json.Marshal(it.Sources); err == nil {
			sourcesJSON = string(b)
		}
	}
	status := it.Status
	if status == "" {
		status = "published"
	}
	now := time.Now()
	item := &NewsItem{
		ID:                it.ID,
		Slug:              it.Slug,
		URL:               it.URL,
		ReportID:          it.ReportID,
		ReportType:        it.ReportType,
		Section:           it.Section,
		SectionLabel:      it.SectionLabel,
		Title:             it.Title,
		Summary:           it.Summary,
		BodyMD:            it.BodyMD,
		BodyHTML:          it.BodyHTML,
		CredibilityNote:   it.CredibilityNote,
		CoverImage:        firstImageURL(it.BodyHTML),
		OriginalDate:      it.OriginalDate,
		PublishedAt:       parseTime(it.PublishedAt),
		Sources:           sourcesJSON,
		Status:            status,
		IsFeatured:        it.IsFeatured,
		Score:             it.Score,
		ViewCount:         it.ViewCount, // 仅首次 insert 用;upsert 不覆盖(见 repo)
		HeatExternal:      it.HeatExternal,
		HeatTrend:         it.HeatTrend,
		HeatMeasuredAt:    parseTime(it.HeatMeasuredAt),
		UpstreamCreatedAt: parseTime(it.CreatedAt),
		UpstreamUpdatedAt: parseTime(it.UpdatedAt),
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := s.repo.UpsertItem(item); err != nil {
		return err
	}
	// 内容首发/更新 → 主动推送该 URL,促搜索引擎/AI 快速重抓(freshness 闭环)。
	// 热度刷新(ProcessHeat)不推(热度≠内容更新)。submitter nil / 队列未启用时为 no-op。
	// 仅在功能已开启时推:未上线时 /news/{slug} 是空壳/404,推过去反伤 SEO。
	if s.submitter != nil && item.Slug != "" && s.Enabled() {
		s.submitter.EnqueuePaths(context.Background(), []string{"/news/" + item.Slug})
	}
	return nil
}

// ProcessHeat 处理 news.heat:批量按 id 覆盖热度三列。返回处理条数。
func (s *Service) ProcessHeat(rawBody []byte) (int, error) {
	var p heatPayload
	if err := json.Unmarshal(rawBody, &p); err != nil {
		return 0, ErrBadPayload
	}
	updates := make([]HeatUpdate, 0, len(p.Items))
	for _, hi := range p.Items {
		if hi.ID == "" {
			continue
		}
		updates = append(updates, HeatUpdate{
			ID:             hi.ID,
			HeatExternal:   hi.HeatExternal,
			HeatTrend:      hi.HeatTrend,
			HeatMeasuredAt: parseTime(hi.HeatMeasuredAt),
		})
	}
	if err := s.repo.ApplyHeat(updates); err != nil {
		return 0, err
	}
	return len(updates), nil
}

// ─── 公开读取 ──────────────────────────────────────────────────────────────

// ListCards 列表卡片(关闭时调用方自行短路;此处只管查)。
func (s *Service) ListCards(sort, section string, limit, offset int) ([]CardDTO, error) {
	items, err := s.repo.ListCards(sort, section, limit, offset)
	if err != nil {
		return nil, err
	}
	return toCards(items), nil
}

// Trending 热榜卡片。
func (s *Service) Trending(days, limit int) ([]CardDTO, error) {
	items, err := s.repo.Trending(days, limit)
	if err != nil {
		return nil, err
	}
	return toCards(items), nil
}

// GetDetail 单篇全文 + 同分区相关(best-effort)。ok=false 表示不存在。
func (s *Service) GetDetail(slug string) (*DetailDTO, []CardDTO, bool, error) {
	item, ok, err := s.repo.GetBySlug(slug)
	if err != nil || !ok {
		return nil, nil, ok, err
	}
	_ = s.repo.IncrViewCount(item.ID) // best-effort,失败不影响展示
	d := toDetail(item)
	related, _ := s.repo.RelatedBySection(item.Section, item.ID, 6)
	return d, toCards(related), true, nil
}

// GetItemForSEO 给 SSR 用:返回原始行(含 body_html)+ 是否存在。
func (s *Service) GetItemForSEO(slug string) (*NewsItem, bool) {
	item, ok, err := s.repo.GetBySlug(slug)
	if err != nil {
		return nil, false
	}
	return item, ok
}

// SitemapEntry sitemap 用的一行(slug + 天粒度 lastmod)。
type SitemapEntry struct {
	Slug    string
	LastMod string
}

// SitemapEntries 全部已发布情报(功能关闭返回空,不进 sitemap)。
// lastmod 取 upstream_updated_at(内容更新真源)→ published_at → 行 updated_at。
func (s *Service) SitemapEntries() ([]SitemapEntry, error) {
	if !s.Enabled() {
		return nil, nil
	}
	items, err := s.repo.AllSlugsForSitemap(50000, 0)
	if err != nil {
		return nil, err
	}
	out := make([]SitemapEntry, 0, len(items))
	for i := range items {
		it := items[i]
		out = append(out, SitemapEntry{Slug: it.Slug, LastMod: sitemapLastMod(&it)})
	}
	return out, nil
}

// SitemapMaxLastMod 全量情报最新 lastmod(天粒度),供 sitemap 索引的 <lastmod> 反映新内容。
// 功能关闭 / 无数据 → ""(seo 索引回落静态常量)。
func (s *Service) SitemapMaxLastMod() string {
	if !s.Enabled() {
		return ""
	}
	t, err := s.repo.MaxUpstreamUpdated()
	if err != nil || t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

func sitemapLastMod(it *NewsItem) string {
	const day = "2006-01-02"
	if it.UpstreamUpdatedAt != nil {
		return it.UpstreamUpdatedAt.Format(day)
	}
	if it.PublishedAt != nil {
		return it.PublishedAt.Format(day)
	}
	if !it.UpdatedAt.IsZero() {
		return it.UpdatedAt.Format(day)
	}
	return ""
}

// ─── 映射 / 工具 ───────────────────────────────────────────────────────────

func parseSources(raw string) []Source {
	if raw == "" {
		return []Source{}
	}
	var out []Source
	if err := json.Unmarshal([]byte(raw), &out); err != nil || out == nil {
		return []Source{}
	}
	return out
}

func toCard(it NewsItem) CardDTO {
	return CardDTO{
		Slug:         it.Slug,
		Title:        it.Title,
		Summary:      it.Summary,
		Section:      it.Section,
		SectionLabel: it.SectionLabel,
		ReportType:   it.ReportType,
		CoverImage:   it.CoverImage,
		Sources:      parseSources(it.Sources),
		IsFeatured:   it.IsFeatured,
		Score:        it.Score,
		ViewCount:    it.ViewCount,
		HeatExternal: it.HeatExternal,
		HeatTrend:    it.HeatTrend,
		PublishedAt:  fmtTime(it.PublishedAt),
	}
}

func toCards(items []NewsItem) []CardDTO {
	out := make([]CardDTO, 0, len(items))
	for _, it := range items {
		out = append(out, toCard(it))
	}
	return out
}

func toDetail(it *NewsItem) *DetailDTO {
	return &DetailDTO{
		CardDTO:         toCard(*it),
		URL:             it.URL,
		BodyMD:          it.BodyMD,
		BodyHTML:        it.BodyHTML,
		CredibilityNote: it.CredibilityNote,
		OriginalDate:    it.OriginalDate,
		HeatMeasuredAt:  fmtTime(it.HeatMeasuredAt),
		UpdatedAt:       fmtTime(it.UpstreamUpdatedAt),
	}
}

// parseTime 解析上游时间字符串(RFC3339 优先,回落几种常见格式);失败 → nil。
func parseTime(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

// fmtTime 把 *time.Time 格式化成 RFC3339;nil → ""。
func fmtTime(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.RFC3339)
}

var imgSrcRe = regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)

// firstImageURL 从 body_html 抽第一张 <img src>(上游已是绝对 URL,直用)。无图 → ""。
func firstImageURL(html string) string {
	m := imgSrcRe.FindStringSubmatch(html)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}
