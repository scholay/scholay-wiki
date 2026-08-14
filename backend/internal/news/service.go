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
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// ErrBadPayload body 解析失败(→ 400,重试无意义但仍按契约让上游重试到死信)。
var ErrBadPayload = errors.New("bad payload")

const maxNewsSlugLength = 200

// newsSlugRE 接受 Unicode 字母/数字(含中文)+ RFC 3986 unreserved 的四个标点。
// 上游真实推送的 slug 形如「2026-08-10-小型热带蝙蝠寿命纪录翻倍-…」(日期前缀+中文);
// 2026-08-10 事故:旧版只收 ASCII,线上 1055 条已发布中文 slug 全部被滤出 sitemap,
// 且入库校验会把上游后续推送整体 400 拒收 —— 校验契约必须与真实数据契约一致。
// 仍不接受 '%'(percent-encoded 字面量二次解码会出现斜杠/多 canonical 形态)、
// 斜杠、空白与控制字符(均不在白名单内);URL 输出侧统一走 url.PathEscape。
var newsSlugRE = regexp.MustCompile(`^[\p{L}\p{N}._~-]+$`)

// 外层 Nginx 的静态资源正则与 SSR 的扫描器后缀拦截都会在情报
// resolver 前截停这些路径。入库/sitemap 必须共用该可路由契约，否则会
// 对外发布一个确定 404 的 URL。
var newsBlockedSuffixRE = regexp.MustCompile(`(?i)\.(?:jpe?g|png|gif|ico|svg|webp|woff2?|ttf|eot|css|m?js|wasm|php|asp|aspx|jsp|cgi|pl|env|git|bak|sql|ya?ml|xml|log|ini|conf|config)$`)

func isValidNewsSlug(slug string) bool {
	if len(slug) == 0 || slug[0] == '.' {
		return false
	}
	// 无效 UTF-8 显式拒绝:PathEscape/XML 输出与 \p{L} 匹配都假定合法 UTF-8。
	if !utf8.ValidString(slug) {
		return false
	}
	// 长度按【字符】数比较:DB 列是 utf8mb4 VARCHAR(200) = 200 字符。按 len(字节)算
	// 会把 >66 个汉字的合法 slug 拒掉 —— 正是「校验契约窄于真实数据契约」的同类事故复发点。
	if utf8.RuneCountInString(slug) > maxNewsSlugLength {
		return false
	}
	return newsSlugRE.MatchString(slug) && !newsBlockedSuffixRE.MatchString(slug)
}

// PushSubmitter 由 seosubmit.Service 实现:把 /news/{slug} 喂给主动收录队列(百度/IndexNow…)。
// 可选;nil 或队列未启用时为 no-op。news 不直接 import seosubmit(解耦)。
type PushSubmitter interface {
	EnqueuePaths(ctx context.Context, paths []string)
}

type Service struct {
	repo      *Repository
	submitter PushSubmitter
	// coverProxyBase 内部 nginx 基址(如 http://nginx):取 minicod 原图时经它的
	// /img-remote 走,顺带预热 30d proxy_cache。空 = 直连上游。见 thumbnail.go。
	coverProxyBase string
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

func (s *Service) GetConfig() (*NewsWebhookConfig, error)   { return s.repo.GetConfig() }
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
	// id 是幂等/覆盖主键，slug 是 URL + 唯一索引键，title 是 SSR 详情页可索引的最低契约。
	// 任一缺失都是坏负载；空 slug 还会撞 uk_news_slug 变成「毒丸」：同一空 slug 第二条
	// insert 失败 → 500 → 上游无限重试到死信。
	if p.Item.ID == "" || !isValidNewsSlug(p.Item.Slug) || strings.TrimSpace(p.Item.Title) == "" {
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
	// 封面缩略图:后台异步生成(不阻塞 webhook 应答;失败由回填任务兜底)。见 thumbnail.go。
	s.scheduleCoverThumb(item.ID)
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
	// 不通过 Enabled() 读。Enabled 为公开页面采用 fail-closed 语义，会把 DB 错误
	// 伪装成“功能关闭”；sitemap 必须将此类仓储错误上报给 handler 返回 500，
	// 不能发布200空站点地图让搜索引擎误判 URL 被批量删除。
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return nil, err
	}
	if !cfg.Enabled {
		return nil, nil
	}
	// 单个 sitemap 协议上限是 50,000 URL；handler 还会加 1 条 /news hub，
	// 所以详情最多取 49,999。规模超过后应改为分页 sitemap。
	items, err := s.repo.AllSlugsForSitemap(49999, 0)
	if err != nil {
		return nil, err
	}
	return sitemapEntriesFromItems(items), nil
}

// sitemapEntriesFromItems 是对历史数据的第二道闸：即使旧版曾经放进了非法 slug，
// 它也不会被拼进 sitemap。顺序保留 repository 的 published_at DESC 结果。
func sitemapEntriesFromItems(items []NewsItem) []SitemapEntry {
	out := make([]SitemapEntry, 0, len(items))
	for i := range items {
		it := items[i]
		// SSR 对空 title 的详情页返回 404，因此 sitemap eligibility 必须与之对齐。
		if !isValidNewsSlug(it.Slug) || strings.TrimSpace(it.Title) == "" {
			continue
		}
		out = append(out, SitemapEntry{Slug: it.Slug, LastMod: sitemapLastMod(&it)})
	}
	return out
}

// GoogleNewsEntry Google News sitemap 的一行(news: 命名空间要求文章标题 + 精确发布时刻)。
type GoogleNewsEntry struct {
	Slug        string
	Title       string
	PublishedAt string // RFC3339
}

// GoogleNewsEntries 最近 48h 发布的情报(Google News sitemap 专用窗口)。
// Google 官方要求:只含最近两天的文章;历史文章继续留在普通 /sitemap-news.xml。
// 错误语义与 SitemapEntries 一致:DB 错误上报(500),功能关闭返回空。
func (s *Service) GoogleNewsEntries() ([]GoogleNewsEntry, error) {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return nil, err
	}
	if !cfg.Enabled {
		return nil, nil
	}
	items, err := s.repo.RecentForGoogleNewsSitemap(time.Now().Add(-48*time.Hour), 1000)
	if err != nil {
		return nil, err
	}
	out := make([]GoogleNewsEntry, 0, len(items))
	for i := range items {
		it := items[i]
		if !isValidNewsSlug(it.Slug) || strings.TrimSpace(it.Title) == "" || it.PublishedAt == nil {
			continue
		}
		out = append(out, GoogleNewsEntry{
			Slug:        it.Slug,
			Title:       it.Title,
			PublishedAt: it.PublishedAt.Format(time.RFC3339),
		})
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
		CoverImage:   proxifyImageURL(it.CoverImage),
		CoverThumb:   coverThumbURL(it.CoverThumbKey),
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
		BodyMD:          stripInlineFigures(it.BodyMD),
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
	// ParseInLocation + time.Local:带偏移的 RFC3339 仍按串内偏移解析;裸时间串(无 Z/offset)
	// 按主机本地时区(容器=北京)解释,而非默认的 UTC —— 避免上游裸时间被当 UTC 后显示偏 8 小时。
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02"} {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			// 2026-07 线上审计:上游发过 '0000-00-00' 类零值日期,落 upstream_created_at
			// (DATETIME)报 Error 1292(×5)。'0000-00-00' 本身月/日越界、Go 解析失败已走 nil;
			// 这里再兜「能解析成功的零值形态」('0000-01-01' / Go 零值 '0001-01-01' 等):
			// MySQL DATETIME 下限是 1000-01-01,年份 <1000 一律视为上游零值占位,归一为 NULL。
			if t.Year() < 1000 {
				return nil
			}
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

// proxifyImageURL 把 minicod 图床的绝对 URL 改写成本站同源代理路径(/img-remote/minicod/…)。
//
// 为什么必须代理:minicod 图床(Caddy)对 /uploads/* 响应带
//
//	Cross-Origin-Resource-Policy: same-site
//
// 头。本站是 www.scholay.com,与 www.minicod.com 非 same-site → 浏览器直接【拦掉】跨站
// <img> 加载 → 封面裂图。CORP 是浏览器强制、图片属性(crossorigin 等)无解,唯一出路是让
// 图片走本站同源:nginx 有一条 `location ^~ /img-remote/minicod/` 把它反代到
//
//	https://www.minicod.com/uploads/…
//
// 并 proxy_hide_header 掉那个 CORP 头(server↔server 取图不受 CORP 约束)。
//
// 只改写 host == www.minicod.com 且 path 以 /uploads/ 开头的 URL(与 nginx 硬编码上游严格对齐);
// 其它 URL 原样返回(空串、已是相对路径、或非 minicod 图都不动)。改写在【下发时】做,
// DB 里仍存上游 canonical URL,故换代理方案/回滚都不需要回填历史行。
func proxifyImageURL(raw string) string {
	if raw == "" {
		return raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if strings.ToLower(u.Hostname()) != "www.minicod.com" || !strings.HasPrefix(u.Path, "/uploads/") {
		return raw
	}
	out := "/img-remote/minicod/" + strings.TrimPrefix(u.Path, "/uploads/")
	if u.RawQuery != "" {
		out += "?" + u.RawQuery
	}
	return out
}

var (
	// 上游 body_md 里内嵌了原始 HTML <figure><img><figcaption> 块(首图=封面)。react-markdown
	// 未挂 rehype-raw(共享渲染器,故意不放开 raw HTML 以防 XSS),这些标签会被【转义成字面文本】
	// (&lt;figure&gt;…)显示成一坨乱码。封面图已在详情页顶部作为 hero 展示,正文里的这张是重复,
	// 故下发时把内嵌 figure/img/figcaption 整段剥掉,正文只保留干净的 markdown 文字。
	reFigureBlock = regexp.MustCompile(`(?is)<figure\b[^>]*>.*?</figure>`)
	reFigcaption  = regexp.MustCompile(`(?is)<figcaption\b[^>]*>.*?</figcaption>`)
	reImgTag      = regexp.MustCompile(`(?is)<img\b[^>]*/?>`)
	reBlankLines  = regexp.MustCompile(`\n{3,}`)
)

// stripInlineFigures 从 body_md 剥掉内嵌的原始 <figure>/<figcaption>/<img> 标签,并把因此
// 留下的连续空行折叠。见 reFigureBlock 注释。
func stripInlineFigures(md string) string {
	if md == "" {
		return md
	}
	md = reFigureBlock.ReplaceAllString(md, "")
	md = reFigcaption.ReplaceAllString(md, "")
	md = reImgTag.ReplaceAllString(md, "")
	md = reBlankLines.ReplaceAllString(md, "\n\n")
	return strings.TrimSpace(md)
}
