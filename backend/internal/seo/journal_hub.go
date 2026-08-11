// ============================================================================
// Scholay学术 V1.0
// SEO 期刊枢纽(发现层)—— /journals/browse 及各维度枢纽页的领域逻辑
//
// 职责:
//  1. 中科院大类中文名 → 固定 pinyin slug 映射(URL 稳定性的单一真源)
//  2. 枢纽数据形状(JournalCard / 概览 / 列表)—— SSR 与公开 JSON API 共用
//  3. Service 编排:slug 反解、分页夹取、概览 Redis 短缓存、hub sitemap 枚举
//
// 铁律:所有查询走 repository 的 publishedJournalRows/journalHubScope ——
// staged 行经枢纽列表泄漏 = 绕过发布闸门(journal_hub_test.go dry-run 钉住)。
// ============================================================================

package seo

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/ctxutil"
)

// JournalHubPerPage 枢纽页固定页大小(路径式真分页;与前端 SPA 契约一致)。
const JournalHubPerPage = 50

// JournalHubWarningPageSize 预警专题一页放完(现存 134 刊;spec 定为单页)。
// SSR 侧用它取整个集合;远超现存量,超限也只是截断展示而非报错。
const JournalHubWarningPageSize = 500

// journalCategorySlugMap 中科院大类中文名 → 固定 pinyin slug。
//
// slug 一旦对外(sitemap / 收录 / 外链)就**永不改动** —— 改 slug = 改 URL = 已收录
// 页面全部 404。新增大类只允许追加;上游若出现表外值,走 fallbackJournalCategorySlug
// 的稳定哈希 slug,绝不 404 一个 DB 里真实存在的大类。
//
// 覆盖面:基础版 18 大类(2022–今)+ 升级版/历史口径的常见变体(上游 fqb 数据
// 混有两代口径;宁多勿漏,map 里多余的键无副作用)。
var journalCategorySlugMap = map[string]string{
	// ── 基础版 18 大类 ──
	"数学":       "shuxue",
	"物理与天体物理":  "wuli-yu-tianti-wuli",
	"化学":       "huaxue",
	"地球科学":     "diqiu-kexue",
	"环境科学与生态学": "huanjing-kexue-yu-shengtaixue",
	"生物学":      "shengwuxue",
	"农林科学":     "nonglin-kexue",
	"医学":       "yixue",
	"工程技术":     "gongcheng-jishu",
	"材料科学":     "cailiao-kexue",
	"计算机科学":    "jisuanji-kexue",
	"综合性期刊":    "zonghexing-qikan",
	"经济学":      "jingjixue",
	"管理学":      "guanlixue",
	"法学":       "faxue",
	"教育学":      "jiaoyuxue",
	"心理学":      "xinlixue",
	"人文科学":     "renwen-kexue",
	// ── 升级版 / 历史口径变体 ──
	"物理":   "wuli",
	"生物":   "shengwu",
	"地学":   "dixue",
	"地学天文": "dixue-tianwen",
	"环境科学": "huanjing-kexue",
	"社会科学": "shehui-kexue",
	"管理科学": "guanli-kexue",
}

// JournalCategorySlug 大类中文名 → URL slug。表内固定映射优先;表外值走稳定哈希
// fallback("qita-<sha1 前 8 hex>"),同名恒同 slug,DB 里存在的大类永不 404。
func JournalCategorySlug(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	if slug, ok := journalCategorySlugMap[name]; ok {
		return slug
	}
	return fallbackJournalCategorySlug(name)
}

// fallbackJournalCategorySlug 表外大类的稳定 slug:qita-<sha1(name) 前 8 hex>。
// 哈希不可逆 —— slug → 名称的反解走 DB 现存大类集合逐个比对(见 resolveCategorySlug)。
func fallbackJournalCategorySlug(name string) string {
	sum := sha1.Sum([]byte(name))
	return "qita-" + hex.EncodeToString(sum[:])[:8]
}

// ─── 枢纽数据形状(SSR 与公开 JSON API 共用)──────────────────────────────────

// JournalCard 枢纽列表单刊卡片。JSON 键是与前端 SPA 的**精确契约**,全部字段
// 恒定输出(不加 omitempty)—— 前端按固定形状建模,零值即缺失。
type JournalCard struct {
	JournalID        int64   `json:"journal_id"`
	Slug             string  `json:"slug"`
	Name             string  `json:"name"`
	Publisher        string  `json:"publisher"`
	JCRImpactFactor  float64 `json:"jcr_impact_factor"`
	JCRQuartile      string  `json:"jcr_quartile"`
	FQBMajorQuartile string  `json:"fqb_major_quartile"`
	FQBTop           bool    `json:"fqb_top"`
	XRMajorQuartile  string  `json:"xr_major_quartile"`
	IsOA             bool    `json:"is_oa"`
	WarningLevel     string  `json:"warning_level"`
	HIndex           int     `json:"h_index"`
	Country          string  `json:"country"`
}

// JournalHubCategory 概览页大类入口(slug + 中文名 + 已发布刊数)。
type JournalHubCategory struct {
	Slug  string `json:"slug"`
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

// JournalHubCountry 概览页国家入口(openalex 两位码 + 已发布刊数)。
type JournalHubCountry struct {
	Code  string `json:"code"`
	Count int64  `json:"count"`
}

// JournalHubOverview /journals/browse 概览数据(公开 API data 形状)。
type JournalHubOverview struct {
	Categories   []JournalHubCategory `json:"categories"`
	Countries    []JournalHubCountry  `json:"countries"`
	WarningCount int64                `json:"warning_count"`
	OACount      int64                `json:"oa_count"`
	Latest       []JournalCard        `json:"latest"`
}

// JournalHubList 单维度枢纽列表页数据。Label 是展示名(大类中文名 / 国家码大写 /
// 专题固定名),SSR 的 <h1>/title 用;JSON API 只回 items/total/page/per_page。
type JournalHubList struct {
	Dimension string
	Key       string
	Label     string
	Items     []JournalCard
	Total     int64
	Page      int
	PerPage   int
}

// JournalCardFromRow 行 → 卡片。h_index 取 openalex 优先、缺失回落 scimago
// (两者同义指标,页面只展示一个数)。
func JournalCardFromRow(j *SEOJournal) JournalCard {
	h := 0
	if j.OpenAlexHIndex != nil && *j.OpenAlexHIndex > 0 {
		h = *j.OpenAlexHIndex
	} else if j.ScimagoHIndex > 0 {
		h = j.ScimagoHIndex
	}
	return JournalCard{
		JournalID:        j.JournalID,
		Slug:             GenerateJournalSlug(j.CanonicalName),
		Name:             j.CanonicalName,
		Publisher:        j.Publisher,
		JCRImpactFactor:  j.JCRImpactFactor,
		JCRQuartile:      j.JCRQuartile,
		FQBMajorQuartile: j.FQBMajorQuartile,
		FQBTop:           j.FQBTop,
		XRMajorQuartile:  j.XRMajorQuartile,
		IsOA:             j.IsOA || j.IsInDOAJ,
		WarningLevel:     j.GJQKWarningLevel,
		HIndex:           h,
		Country:          j.Country,
	}
}

func journalCardsFromRows(rows []SEOJournal) []JournalCard {
	out := make([]JournalCard, 0, len(rows)) // 非 nil:JSON 契约要 items 恒为数组
	for i := range rows {
		out = append(out, JournalCardFromRow(&rows[i]))
	}
	return out
}

// ─── Service 编排 ────────────────────────────────────────────────────────────

// journalHubOverviewCacheKey 概览 Redis 短缓存。概览要跑 5 个聚合查询(其中
// warning/oa 计数无索引可用,全量后是 30 万行 published 子集扫描),爬虫对
// /journals/browse 的高频抓取不该每次都打穿 DB。10 分钟陈旧度可接受
// (与 sitemap 索引页 TTL 同档);发布批次后的计数偏差同样 ≤10 分钟。
const (
	journalHubOverviewCacheKey = "seo:journal-hub:overview:v1"
	journalHubOverviewCacheTTL = 10 * time.Minute
	journalHubLatestLimit      = 20
	journalHubCountryCap       = 60 // 概览页国家入口上限(长尾国家仍可经 /journals/country/{cc} 直达)
)

// GetJournalHubOverview /journals/browse 概览(SSR + 公开 API 共用,Redis 短缓存)。
func (s *Service) GetJournalHubOverview() (*JournalHubOverview, error) {
	if cached := getCachedJournalHubOverview(); cached != nil {
		return cached, nil
	}

	categories, err := s.repo.ListJournalCategoryCounts()
	if err != nil {
		return nil, err
	}
	countries, err := s.repo.ListJournalCountryCounts()
	if err != nil {
		return nil, err
	}
	warningCount, _, err := s.repo.CountJournalsForHub(JournalHubFilter{WarningOnly: true})
	if err != nil {
		return nil, err
	}
	oaCount, _, err := s.repo.CountJournalsForHub(JournalHubFilter{OAOnly: true})
	if err != nil {
		return nil, err
	}
	latestRows, err := s.repo.ListLatestPublishedJournals(journalHubLatestLimit)
	if err != nil {
		return nil, err
	}

	ov := &JournalHubOverview{
		Categories:   make([]JournalHubCategory, 0, len(categories)),
		Countries:    make([]JournalHubCountry, 0, len(countries)),
		WarningCount: warningCount,
		OACount:      oaCount,
		Latest:       journalCardsFromRows(latestRows),
	}
	for _, c := range categories {
		ov.Categories = append(ov.Categories, JournalHubCategory{
			Slug:  JournalCategorySlug(c.Key),
			Name:  c.Key,
			Count: c.Count,
		})
	}
	for _, c := range countries {
		if len(ov.Countries) >= journalHubCountryCap {
			break
		}
		ov.Countries = append(ov.Countries, JournalHubCountry{
			Code:  strings.ToUpper(c.Key),
			Count: c.Count,
		})
	}

	setCachedJournalHubOverview(ov)
	return ov, nil
}

// GetJournalHubList 单维度枢纽列表。返回 (nil, nil) 表示维度键不存在(调用方 404):
//   - category: slug 反解不到 DB 现存大类
//   - country : 该国家码下没有已发布期刊
//
// page/perPage 由这里统一夹取(page<=0 → 1,perPage<=0 → 50);超尾页返回空
// items + 真实 total,SSR 侧据此 404、API 侧原样返回(契约含 total)。
func (s *Service) GetJournalHubList(dimension, key string, page, perPage int) (*JournalHubList, error) {
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 {
		perPage = JournalHubPerPage
	}

	var (
		filter JournalHubFilter
		label  string
	)
	switch dimension {
	case "category":
		name, err := s.resolveCategorySlug(key)
		if err != nil {
			return nil, err
		}
		if name == "" {
			return nil, nil
		}
		filter.FQBMajorCategory = name
		label = name
	case "country":
		cc := strings.ToUpper(strings.TrimSpace(key))
		if len(cc) != 2 {
			return nil, nil
		}
		filter.Country = cc
		label = cc
	case "warning":
		filter.WarningOnly = true
		label = "国际期刊预警名单"
	case "oa":
		filter.OAOnly = true
		label = "开放获取(OA)期刊"
	default:
		return nil, nil
	}

	rows, total, err := s.repo.ListJournalsForHub(filter, page, perPage)
	if err != nil {
		return nil, err
	}
	if dimension == "country" && total == 0 {
		// 没有已发布期刊的国家码没有落地页语义(country 无注册表,total 即存在性)。
		return nil, nil
	}
	return &JournalHubList{
		Dimension: dimension,
		Key:       key,
		Label:     label,
		Items:     journalCardsFromRows(rows),
		Total:     total,
		Page:      page,
		PerPage:   perPage,
	}, nil
}

// resolveCategorySlug slug → 大类中文名。fallback slug 是单向哈希,只能拿 DB 现存
// 大类集合逐个算 slug 比对 —— 集合极小(≤ 数十个),且经概览同源查询(带缓存路径的
// 调用方可先命中概览缓存)。返回 "" 表示不存在。
func (s *Service) resolveCategorySlug(slug string) (string, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return "", nil
	}
	categories, err := s.repo.ListJournalCategoryCounts()
	if err != nil {
		return "", err
	}
	for _, c := range categories {
		if JournalCategorySlug(c.Key) == slug {
			return c.Key, nil
		}
	}
	return "", nil
}

// ─── hub sitemap 枚举 ────────────────────────────────────────────────────────

// JournalHubSitemapEntry hub sitemap 单条(路径 + 该集合诚实 lastmod)。
type JournalHubSitemapEntry struct {
	Path    string
	LastMod time.Time
}

// ListJournalHubSitemapEntries 枚举全部枢纽页 URL(含路径式分页页)。
// lastmod = 对应集合的 MAX(updated_at):行级 updated_at 本身是诚实的(发布时刻 /
// 内容真实变化才 bump),集合最大值即「本页可见内容最近一次变化」的上界。
func (s *Service) ListJournalHubSitemapEntries() ([]JournalHubSitemapEntry, error) {
	entries := make([]JournalHubSitemapEntry, 0, 64)

	// 总枢纽:全体已发布期刊的最新变化。
	allCount, allLastMod, err := s.repo.CountJournalsForHub(JournalHubFilter{})
	if err != nil {
		return nil, err
	}
	if allCount == 0 {
		// 库里还没有已发布期刊(冷启动):hub 页面本身仍可访问,但 sitemap 不必列空页。
		return entries, nil
	}
	entries = append(entries, JournalHubSitemapEntry{Path: "/journals/browse", LastMod: allLastMod})

	appendPaged := func(basePath string, count int64, lastMod time.Time, perPage int) {
		for _, p := range journalHubPagedPaths(basePath, count, perPage) {
			entries = append(entries, JournalHubSitemapEntry{Path: p, LastMod: lastMod})
		}
	}

	categories, err := s.repo.ListJournalCategoryCounts()
	if err != nil {
		return nil, err
	}
	for _, c := range categories {
		appendPaged("/journals/category/"+JournalCategorySlug(c.Key), c.Count, c.LastMod, JournalHubPerPage)
	}

	countries, err := s.repo.ListJournalCountryCounts()
	if err != nil {
		return nil, err
	}
	for _, c := range countries {
		appendPaged("/journals/country/"+strings.ToLower(c.Key), c.Count, c.LastMod, JournalHubPerPage)
	}

	warningCount, warningLastMod, err := s.repo.CountJournalsForHub(JournalHubFilter{WarningOnly: true})
	if err != nil {
		return nil, err
	}
	if warningCount > 0 {
		// 预警专题单页(spec:134 刊一页放完),不做分页枚举。
		entries = append(entries, JournalHubSitemapEntry{Path: "/journals/warning", LastMod: warningLastMod})
	}

	oaCount, oaLastMod, err := s.repo.CountJournalsForHub(JournalHubFilter{OAOnly: true})
	if err != nil {
		return nil, err
	}
	appendPaged("/journals/oa", oaCount, oaLastMod, JournalHubPerPage)

	return entries, nil
}

// GetJournalHubSitemapLastMod 主 sitemap 索引里 hub 分片的 <lastmod>
// (= 全体已发布期刊最新 updated_at;失败/空库返回零值,调用方回落静态常量)。
func (s *Service) GetJournalHubSitemapLastMod() (time.Time, error) {
	_, lastMod, err := s.repo.CountJournalsForHub(JournalHubFilter{})
	return lastMod, err
}

// journalHubPagedPaths 路径式分页的 URL 枚举(纯函数,便于钉边界):
// 首页 = 裸路径,第 2 页起追加 /{page};count<=0 返回空(空集合不产软 404 页)。
func journalHubPagedPaths(basePath string, count int64, perPage int) []string {
	if count <= 0 || perPage <= 0 {
		return nil
	}
	pages := int((count + int64(perPage) - 1) / int64(perPage))
	out := make([]string, 0, pages)
	out = append(out, basePath)
	for p := 2; p <= pages; p++ {
		out = append(out, basePath+"/"+strconv.Itoa(p))
	}
	return out
}

// ─── 概览 Redis 缓存(nil-safe:Redis 不可用直接走 DB)──────────────────────────

func getCachedJournalHubOverview() *JournalHubOverview {
	rdb := cache.GetRedis()
	if rdb == nil {
		return nil
	}
	ctx, cancel := ctxutil.With(ctxutil.CacheRead)
	defer cancel()
	raw, err := rdb.Get(ctx, journalHubOverviewCacheKey).Bytes()
	if err != nil {
		return nil
	}
	var ov JournalHubOverview
	if err := json.Unmarshal(raw, &ov); err != nil {
		return nil
	}
	return &ov
}

func setCachedJournalHubOverview(ov *JournalHubOverview) {
	rdb := cache.GetRedis()
	if rdb == nil || ov == nil {
		return
	}
	raw, err := json.Marshal(ov)
	if err != nil {
		return
	}
	ctx, cancel := ctxutil.With(ctxutil.CacheWrite)
	defer cancel()
	if err := rdb.Set(ctx, journalHubOverviewCacheKey, raw, journalHubOverviewCacheTTL).Err(); err != nil {
		slog.Warn("seo journal hub overview cache set failed", "err", err)
	}
}
