// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/usagestat"

	"github.com/gin-gonic/gin"
)

// issnRE 标准 ISSN 形态(4 位数字-3 位数字+校验位[数字或 X])。入库前校验,
// 挡住上游偶发的占位/垃圾串;大小写已在调用侧统一为大写 X。
var issnRE = regexp.MustCompile(`^[0-9]{4}-[0-9]{3}[0-9X]$`)

// AuthorSEORecorder 由 seo.Service 直接实现, 作者详情命中时写入 SEO 索引库 tier=1。
// 历史上 minicod 自定义了一份 AuthorSEOSeed 与 seo.AuthorSeed 字段镜像, 中间靠
// cmd/server/authorSEORecorderAdapter 翻译; 现在改成 minicod 直接 import seo 用
// seo.AuthorSeed, adapter 已下线。
type AuthorSEORecorder interface {
	RecordAuthorDetailClick(seed *seo.AuthorSeed) error
}

// PaperSEORecorder 只接收 minicod 已验证响应映射出的 seed。不能用匿名
// 客户端 /seo/expose 传来的元数据实现此接口，否则可被灌入 SEO spam。
type PaperSEORecorder interface {
	RecordDetailClick(seed *seo.PaperSeed) error
	RecordSearchSeeds(seeds []seo.PaperSeed) (int, error)
	RecordAuthorSearchSeeds(seeds []seo.AuthorSeed) (int, error)
}

// JournalSEORecorder 同构 — 也直接用 seo.JournalSeed。
type JournalSEORecorder interface {
	RecordJournalDetailClick(seed *seo.JournalSeed) error
	RecordJournalSearchSeeds(seeds []seo.JournalSeed) (int, error)
}

// HotContentRecorder 由 hotcontent.Service 直接实现 —— 落热门搜索词 / 论文曝光。
//   - RecordSearch: 关键词按类型(文献/期刊)分桶计数
//   - RecordImpressions: 一次搜索结果集的曝光量 +1
//
// 点击量 / SEO 直访量改由前端主动上报 (POST /public/hot-content/track):
// 站内从结果点开详情走前端缓存、不打 GET /papers/:id, 服务端这里看不到, 故不再在 GetPaper 记点击。
type HotContentRecorder interface {
	RecordSearch(keyword string, searchType hotcontent.SearchType) error
	RecordImpressions(papers []hotcontent.PaperViewData) error
}

// FavoriteChecker 由 library.Handler 实现 —— 把「当前用户是否已收藏」标注进搜索结果,
// 让结果直接显示「已收藏」、省掉前端额外的 /user/library/check 往返。
// 用接口注入(而非 minicod import library)避免反向依赖。
type FavoriteChecker interface {
	CheckFavorites(userID uint64, source string, ids []string) map[string]bool
}

// MembershipChecker 由 vip.Service 实现(EffectiveTier(uint) string)。
// 仅用于「期刊投稿资源下载」的会员门槛(Max 专享),用接口注入避免 minicod import vip。
type MembershipChecker interface {
	EffectiveTier(userID uint) string
}

// membershipTierMax 与 vip.TierMax 同值;此处不 import vip,用常量对齐(见 vip/model.go)。
const membershipTierMax = "max"

// 投稿资源下载门槛未达时返回的业务码(前端据此弹「升级到 Max」)。
const codeJournalSubmissionUpgradeRequired = 40310

// Handler handles HTTP requests for Minicod API
type Handler struct {
	manager            *Manager
	paperSEORecorder   PaperSEORecorder
	authorSEORecorder  AuthorSEORecorder
	journalSEORecorder JournalSEORecorder
	hotRecorder        HotContentRecorder
	statRecorder       usagestat.Recorder
	favChecker         FavoriteChecker
	membership         MembershipChecker
}

// SetPaperSEORecorder 注入论文搜索/详情的服务端可信 SEO 记录器。
func (h *Handler) SetPaperSEORecorder(r PaperSEORecorder) {
	h.paperSEORecorder = r
}

// NewHandler creates a new Minicod handler
func NewHandler(manager *Manager) *Handler {
	return &Handler{
		manager: manager,
	}
}

// SetAuthorSEORecorder 注入作者 SEO 记录器（详情命中时记录 tier=1 click）
func (h *Handler) SetAuthorSEORecorder(r AuthorSEORecorder) {
	h.authorSEORecorder = r
}

// SetJournalSEORecorder 注入期刊 SEO 记录器 (详情命中时记录 tier=1 click)
func (h *Handler) SetJournalSEORecorder(r JournalSEORecorder) {
	h.journalSEORecorder = r
}

// SetHotContentRecorder 注入热门内容记录器（搜索词 / 曝光 / 点击统计）
func (h *Handler) SetHotContentRecorder(r HotContentRecorder) {
	h.hotRecorder = r
}

// SetUsageStatRecorder 注入使用统计录入器(用户实际提交搜索时记一次)
func (h *Handler) SetUsageStatRecorder(r usagestat.Recorder) {
	h.statRecorder = r
}

// SetFavoriteChecker 注入收藏态查询器(已登录时给搜索结果标注 isFavorited)
func (h *Handler) SetFavoriteChecker(fc FavoriteChecker) {
	h.favChecker = fc
}

// SetMembershipChecker 注入会员等级查询器(期刊投稿资源下载的 Max 门槛)。
func (h *Handler) SetMembershipChecker(m MembershipChecker) {
	h.membership = m
}

// optionalUserID 从 gin 上下文读 user_id(OptionalUserAuth 注入;匿名返回 0)。
func optionalUserID(c *gin.Context) uint64 {
	v, ok := c.Get("user_id")
	if !ok {
		return 0
	}
	switch id := v.(type) {
	case uint64:
		return id
	case uint:
		return uint64(id)
	case int:
		return uint64(id)
	case int64:
		return uint64(id)
	case float64:
		return uint64(id)
	default:
		return 0
	}
}

// annotateFavorites 给搜索结果逐篇标注 isFavorited(在公共缓存命中之后、逐请求标注,不污染缓存)。
// source=all 时各篇 source 不同 → 按 source 分组分别查。
func annotateFavorites(uid uint64, papers []Paper, fc FavoriteChecker) {
	bySource := make(map[string][]string)
	for i := range papers {
		if papers[i].PaperID == "" || papers[i].Source == "" {
			continue
		}
		bySource[papers[i].Source] = append(bySource[papers[i].Source], papers[i].PaperID)
	}
	favored := make(map[string]bool) // key = source + "\x00" + paperID
	for src, ids := range bySource {
		for id := range fc.CheckFavorites(uid, src, ids) {
			favored[src+"\x00"+id] = true
		}
	}
	for i := range papers {
		// new(bool) 每轮新分配 —— fav 本是 body 作用域(各版本 Go 都逐轮新建,取址安全),
		// 这里写成最不易误读的形式,杜绝「取循环变量地址」的歧义。
		fav := new(bool)
		*fav = favored[papers[i].Source+"\x00"+papers[i].PaperID]
		papers[i].IsFavorited = fav
	}
}

// paperToViewData 把上游 Paper 映射成 hotcontent 落库用的 PaperViewData。
func paperToViewData(p *Paper) hotcontent.PaperViewData {
	vd := hotcontent.PaperViewData{PaperID: p.PaperID}
	if p.Title != "" {
		t := p.Title
		vd.Title = &t
	}
	if p.Abstract != "" {
		a := p.Abstract
		vd.Abstract = &a
	}
	if p.Year > 0 {
		y := p.Year
		vd.Year = &y
	}
	if p.Venue != "" {
		v := p.Venue
		vd.Venue = &v
	}
	if doi, ok := p.ExternalIDs["DOI"].(string); ok && doi != "" {
		vd.DOI = &doi
	}
	if len(p.Authors) > 0 {
		names := make([]string, 0, len(p.Authors))
		for _, a := range p.Authors {
			if a.Name != "" {
				names = append(names, a.Name)
			}
		}
		if len(names) > 0 {
			if b, err := json.Marshal(names); err == nil {
				s := string(b)
				vd.Authors = &s
			}
		}
	}
	return vd
}

// papersToViewData 批量映射(用于曝光)。
func papersToViewData(papers []Paper) []hotcontent.PaperViewData {
	out := make([]hotcontent.PaperViewData, 0, len(papers))
	for i := range papers {
		if papers[i].PaperID == "" {
			continue
		}
		out = append(out, paperToViewData(&papers[i]))
	}
	return out
}

// SearchPapersRequest 定义学术检索的POST请求结构
type SearchPapersRequest struct {
	Query             string   `json:"query" binding:"required"`
	Year              string   `json:"year"`
	YearFrom          string   `json:"yearFrom"`
	YearTo            string   `json:"yearTo"`
	DateFrom          string   `json:"dateFrom"` // YYYY-MM-DD,比 yearFrom 精度更高
	DateTo            string   `json:"dateTo"`
	Offset            int      `json:"offset"`
	Limit             int      `json:"limit"`
	Fields            []string `json:"fields"`
	PublicationTypes  []string `json:"publicationTypes"`
	Venue             []string `json:"venue"`
	FieldsOfStudy     []string `json:"fieldsOfStudy"`
	OpenAccessPdf     string   `json:"openAccessPdf"`
	MinCitationCount  int      `json:"minCitationCount"`
	EnableTranslation *bool    `json:"enableTranslation,omitempty"`
	Source            string   `json:"source,omitempty"` // stc | olx | pmd | all
	Sort              string   `json:"sort,omitempty"`   // relevance | citations | date
}

// SearchPapersResponse 定义学术检索的响应结构
type SearchPapersResponse struct {
	Data              any      `json:"data"`
	OriginalQuery     string   `json:"originalQuery"`
	SearchSuggestions []string `json:"searchSuggestions"`
	ActualQuery       string   `json:"actualQuery"`
	HasSuggestions    bool     `json:"hasSuggestions"`
	SearchStrategy    string   `json:"searchStrategy"`
	// W6 P1-5 failover 透明化(纯增量,omitempty 前端零改动兼容):
	// SourcesTried = 本次依次尝试过的源;SourcesFailed = 其中上游报错的源。
	SourcesTried  []string `json:"sourcesTried,omitempty"`
	SourcesFailed []string `json:"sourcesFailed,omitempty"`
}

// searchSourceOrder 决定一次搜索依次尝试哪些源:
//   - "" / "auto" → 自动换源 stc → olx → pmd(某源上游报错则换下一个,任一成功即返回)
//   - 具体源       → 只查该源(用户手动选源时不自动换)
func searchSourceOrder(source string) []string {
	switch source {
	case "", "auto":
		return []string{SourceSTC, SourceOLX, SourcePMD}
	default:
		return []string{source}
	}
}

// SearchPapers handles paper search requests
// POST /api/v1/scholar/papers/search
func (h *Handler) SearchPapers(c *gin.Context) {
	var req SearchPapersRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	if len(req.Query) > 500 {
		utils.Error(c, 4001, "搜索词过长,请精简到 500 字以内")
		return
	}
	if req.Query == "" {
		utils.Error(c, 4001, "请输入搜索词")
		return
	}

	// AI 搜索建议已下线 (新前端不消费 searchSuggestions, 详见 ai 包瘦身)。
	// SearchSuggestions / HasSuggestions 字段保留但恒为空, 维持响应 JSON 形状兼容。

	// Parse year range (upstream expects integers year_from/year_to)
	yearFrom, yearTo := parseYearRange(req.Year, req.YearFrom, req.YearTo)

	opts := PaperSearchOptions{
		Query:            req.Query,
		YearFrom:         yearFrom,
		YearTo:           yearTo,
		DateFrom:         req.DateFrom,
		DateTo:           req.DateTo,
		Offset:           req.Offset,
		Limit:            req.Limit,
		Fields:           req.Fields,
		PublicationTypes: req.PublicationTypes,
		Venue:            req.Venue,
		FieldsOfStudy:    req.FieldsOfStudy,
		OpenAccessPDF:    req.OpenAccessPdf,
		MinCitationCount: req.MinCitationCount,
		Source:           req.Source,
		Sort:             req.Sort,
	}

	if opts.Limit <= 0 {
		opts.Limit = 10
	}
	// 上游 Semantic Scholar 单次最多返回 100；大于 100 会被截断反而浪费带宽和缓存 key 空间，
	// 还可能被拿来批量爬库。这里硬性夹在 [1,100]，与 DefaultLimit 保持一致。
	if opts.Limit > 100 {
		opts.Limit = 100
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}

	// 自动换源:source 为空 / "auto" 时按 stc→olx→pmd 依次尝试,某源上游报错就换下一个;
	// 用户显式选了某个源(stc/olx/pmd)则只查该源、不换(尊重用户选择)。
	// W6 P1-6 空集续查:auto 模式下某源 total==0 的空集不再当终点 —— 记住首个空集继续下一源,
	// 全空/后续源失败则回落 firstEmpty(空集是合法结果,不算失败)。
	// W6 P1-5:tried/failed 逐源留痕,随响应透出(SourcesTried/SourcesFailed)。
	var result *SearchResponse
	var err error
	var firstEmpty *SearchResponse
	var tried, failed []string
	order := searchSourceOrder(req.Source)
	for i, src := range order {
		o := opts
		o.Source = src
		tried = append(tried, src)
		result, err = h.manager.SearchPapers(c.Request.Context(), o)
		if err == nil {
			if result != nil && result.Total == 0 && len(order) > 1 && i < len(order)-1 {
				if firstEmpty == nil {
					firstEmpty = result
				}
				slog.Debug("minicod search: empty result, trying next source", "source", src)
				continue
			}
			break
		}
		failed = append(failed, src)
		// 换源是设计内的正常降级(stc→olx→pmd),单源失败 → DEBUG;只有全源都失败才在下面 WARN。
		slog.Debug("minicod search: source failed, trying next", "source", src, "err", err)
	}
	// 全部源都是空集 / 前面出过空集而最后一源失败 → 回落首个空集(不把「已成功拿到的空集」升级成报错)。
	if firstEmpty != nil && (err != nil || result == nil || result.Total == 0) {
		result, err = firstEmpty, nil
	}
	if err != nil || result == nil {
		// 客户端主动取消(翻页/离开)不算真失败,不打 WARN;只有上游确实全挂才记一条聚合 WARN。
		if c.Request.Context().Err() == nil {
			slog.Warn("minicod search: all sources failed", "query_len", len(req.Query), "err", err)
		}
		utils.Error(c, 4002, "搜索论文失败,请稍后重试")
		return
	}

	// 已登录:逐请求标注 isFavorited(在公共缓存命中之后,不污染按 query 缓存的公共结果)。
	if h.favChecker != nil && result != nil && len(result.Data) > 0 {
		if uid := optionalUserID(c); uid != 0 {
			annotateFavorites(uid, result.Data, h.favChecker)
		}
	}

	// W6 P1-7 零重叠沉底:上游按关键词匹配的排序噪声可能把「一个查询词都不含」的条目顶到最前
	//(审计:文莱论文登顶)。逐请求纯重排(缓存写入之外),不删除、不改字段;中文 query / 词数<2 豁免。
	if result != nil && len(result.Data) > 1 {
		sinkZeroOverlap(req.Query, result.Data)
	}

	// SEO 入库只信任本次 minicod 已验证的上游响应，不再信任匿名前端 expose。
	if h.paperSEORecorder != nil && len(result.Data) > 0 {
		papers, authors := buildVerifiedSearchSEOSeeds(result.Data)
		recorder := h.paperSEORecorder
		safego.Record("seo-verified-paper-search", func() {
			if len(papers) > 0 {
				if _, err := recorder.RecordSearchSeeds(papers); err != nil {
					slog.Warn("seo verified paper search record failed", "err", err)
				}
			}
			if len(authors) > 0 {
				if _, err := recorder.RecordAuthorSearchSeeds(authors); err != nil {
					slog.Warn("seo verified author search record failed", "err", err)
				}
			}
		})
	}

	response := SearchPapersResponse{
		Data:           result,
		OriginalQuery:  req.Query,
		ActualQuery:    req.Query,
		HasSuggestions: false,
		SearchStrategy: "original",
		SourcesTried:   tried,
		SourcesFailed:  failed,
	}

	// 热门内容: 记文献搜索词 + 结果集曝光量。异步, 不阻塞响应。
	if h.hotRecorder != nil && result != nil {
		rec := h.hotRecorder
		query := req.Query
		impressions := papersToViewData(result.Data)
		safego.Record("hotcontent-paper-search", func() {
			_ = rec.RecordSearch(query, hotcontent.SearchTypePaper)
			if len(impressions) > 0 {
				_ = rec.RecordImpressions(impressions)
			}
		})
	}

	// 功能使用统计: "文献搜索" 真实被用了一次(公开接口, 匿名 user_id 为 nil 也记)。
	// 自身已 safego, 不必再包一层。
	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeaturePaperSearch, "search",
			map[string]any{"query": req.Query})
	}

	utils.Success(c, response)
}

// GetPaper handles get paper details requests
// GET /api/v1/scholar/papers/:paperId
func (h *Handler) GetPaper(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4003, "请提供论文 ID")
		return
	}

	opts := PaperDetailsOptions{}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	result, err := h.manager.GetPaper(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4004, "加载论文详情失败,请稍后重试")
		return
	}

	if h.paperSEORecorder != nil {
		if seed := buildVerifiedPaperSEOSeed(result); seed != nil {
			recorder := h.paperSEORecorder
			safego.Record("seo-verified-paper-detail", func() {
				if err := recorder.RecordDetailClick(seed); err != nil {
					slog.Warn("seo verified paper detail record failed", "paper_id", seed.PaperID, "err", err)
				}
			})
		}
	}

	// 点击量不再在这里记 —— 站内从结果点开详情走前端缓存、根本不打本接口;
	// 改由前端在"点开论文"那一刻上报 POST /public/hot-content/track。
	utils.Success(c, result)
}

func buildVerifiedPaperSEOSeed(p *Paper) *seo.PaperSeed {
	if p == nil || strings.TrimSpace(p.PaperID) == "" || strings.TrimSpace(p.Title) == "" {
		return nil
	}
	seed := &seo.PaperSeed{
		PaperID:       strings.TrimSpace(p.PaperID),
		Title:         strings.TrimSpace(p.Title),
		Abstract:      p.Abstract,
		Venue:         p.Venue,
		CitationCount: p.CitationCount,
		FieldsOfStudy: append([]string(nil), p.FieldsOfStudy...),
		Source:        seo.AuthoritativeSource(p.Source, p.PaperID),
	}
	if p.Year > 0 {
		year := p.Year
		seed.Year = &year
	}
	if p.ExternalIDs != nil {
		if doi, ok := p.ExternalIDs["DOI"].(string); ok {
			seed.DOI = strings.TrimSpace(doi)
		}
	}
	seed.Authors = make([]seo.Author, 0, len(p.Authors))
	for _, author := range p.Authors {
		if name := strings.TrimSpace(author.Name); name != "" {
			seed.Authors = append(seed.Authors, seo.Author{Name: name, AuthorID: strings.TrimSpace(author.AuthorID)})
		}
	}
	return seed
}

func buildVerifiedSearchSEOSeeds(papers []Paper) ([]seo.PaperSeed, []seo.AuthorSeed) {
	paperSeeds := make([]seo.PaperSeed, 0, len(papers))
	authorSeeds := make([]seo.AuthorSeed, 0)
	seenAuthors := make(map[string]struct{})
	for i := range papers {
		seed := buildVerifiedPaperSEOSeed(&papers[i])
		if seed == nil {
			continue
		}
		paperSeeds = append(paperSeeds, *seed)
		for _, author := range papers[i].Authors {
			id := strings.TrimSpace(author.AuthorID)
			name := strings.TrimSpace(author.Name)
			if id == "" || name == "" {
				continue
			}
			if _, exists := seenAuthors[id]; exists {
				continue
			}
			seenAuthors[id] = struct{}{}
			authorSeeds = append(authorSeeds, seo.AuthorSeed{
				AuthorID: id,
				Name:     name,
				Source:   seo.AuthoritativeSource(author.Source, id),
			})
		}
	}
	return paperSeeds, authorSeeds
}

// GetPaperReferences handles get paper references requests
// GET /api/v1/scholar/papers/:paperId/references
func (h *Handler) GetPaperReferences(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4007, "请提供论文 ID")
		return
	}

	opts := CitationsOptions{
		Offset: clampOffset(parseIntQuery(c, "offset", 0)),
		Limit:  clampLimit(parseIntQuery(c, "limit", 100)),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	result, err := h.manager.GetPaperReferences(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4008, "加载参考文献失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// GetAuthor handles get author details requests
// GET /api/v1/scholar/authors/:authorId
func (h *Handler) GetAuthor(c *gin.Context) {
	authorID := c.Param("authorId")
	if authorID == "" {
		utils.Error(c, 4013, "请提供作者 ID")
		return
	}

	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	result, err := h.manager.GetAuthor(c.Request.Context(), authorID, fields)
	if err != nil {
		utils.Error(c, 4014, "加载作者详情失败,请稍后重试")
		return
	}

	// 详情命中即 tier=1 写入 seo_authors。异步执行，失败不影响主响应。
	if h.authorSEORecorder != nil && result != nil && result.Name != "" {
		seed := &seo.AuthorSeed{
			AuthorID:      result.AuthorID,
			Name:          result.Name,
			Affiliations:  result.Affiliations,
			Homepage:      result.Homepage,
			PaperCount:    result.PaperCount,
			CitationCount: result.CitationCount,
			Source:        result.Source,
			ORCID:         result.ORCID,
		}
		if result.HIndex > 0 {
			hi := result.HIndex
			seed.HIndex = &hi
		}
		recorder := h.authorSEORecorder
		safego.Record("seo-author-detail-click", func() {
			if err := recorder.RecordAuthorDetailClick(seed); err != nil {
				slog.Warn("seo author detail click record failed", "author_id", seed.AuthorID, "err", err)
			}
		})
	}

	utils.Success(c, result)
}

// GetAuthorPapers handles get author papers requests
// GET /api/v1/scholar/authors/:authorId/papers
func (h *Handler) GetAuthorPapers(c *gin.Context) {
	authorID := c.Param("authorId")
	if authorID == "" {
		utils.Error(c, 4015, "请提供作者 ID")
		return
	}

	offset := clampOffset(parseIntQuery(c, "offset", 0))
	limit := clampLimit(parseIntQuery(c, "limit", 100))
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	result, err := h.manager.GetAuthorPapers(c.Request.Context(), authorID, fields, offset, limit)
	if err != nil {
		utils.Error(c, 4016, "加载作者论文列表失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// BatchPaperRequestBody represents POST body for batch paper request
type BatchPaperRequestBody struct {
	PaperIDs []string `json:"paperIds" binding:"required"`
	Fields   []string `json:"fields"`
}

// GetPaperBatch handles batch paper details requests
// POST /api/v1/scholar/papers/batch
func (h *Handler) GetPaperBatch(c *gin.Context) {
	var req BatchPaperRequestBody
	if !utils.BindJSON(c, &req) {
		return
	}

	// 去重 + 空值过滤：上游 Semantic Scholar batch 接口按 count 计费，
	// 客户端重复传同一个 paperID 会白白浪费额度，且命中的 paper 也会在响应中重复。
	// 同时夹一个硬上限（500）防止恶意巨量请求。
	ids := dedupNonEmpty(req.PaperIDs, 500)
	if len(ids) == 0 {
		utils.Error(c, 4021, "请选择要查询的论文")
		return
	}

	fields := verifiedBatchFields(req.Fields, h.paperSEORecorder != nil)
	result, err := h.manager.GetPaperBatch(c.Request.Context(), ids, fields)
	if err != nil {
		utils.Error(c, 4022, "批量加载论文失败,请稍后重试")
		return
	}

	// Batch 也是后端已验证的上游结果。PMD 搜索只返元数据，前端会
	// 用本接口补 abstract；在这里按 tier=2 回写可以让有实质内容的页面进入
	// sitemap，又不会把“批量查询”伪装成用户详情点击。
	if h.paperSEORecorder != nil && len(result) > 0 {
		papers, authors := buildVerifiedSearchSEOSeeds(result)
		recorder := h.paperSEORecorder
		safego.Record("seo-verified-paper-batch", func() {
			if len(papers) > 0 {
				if _, err := recorder.RecordSearchSeeds(papers); err != nil {
					slog.Warn("seo verified paper batch record failed", "err", err)
				}
			}
			if len(authors) > 0 {
				if _, err := recorder.RecordAuthorSearchSeeds(authors); err != nil {
					slog.Warn("seo verified paper batch authors record failed", "err", err)
				}
			}
		})
	}

	utils.Success(c, result)
}

// verifiedBatchFields 保证需要 SEO 回写时不依赖上游“即使只请求
// abstract 也顺带返回 title”的宽松实现。未请求字段裁剪时保持 nil，
// 避免把原本的完整响应意外缩成单字段。
func verifiedBatchFields(fields []string, seoEnabled bool) []string {
	if !seoEnabled || len(fields) == 0 {
		return fields
	}
	for _, field := range fields {
		if strings.EqualFold(strings.TrimSpace(field), "title") {
			return fields
		}
	}
	out := append([]string(nil), fields...)
	return append(out, "title")
}

// dedupNonEmpty 返回去重、去空、按首现顺序排列的切片，最多保留 maxLen 条。
func dedupNonEmpty(in []string, maxLen int) []string {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
		if maxLen > 0 && len(out) >= maxLen {
			break
		}
	}
	return out
}

// GetSearchSuggestions handles search suggestions requests
// GET /api/v1/public/search/suggestions
func (h *Handler) GetSearchSuggestions(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		utils.Error(c, 4023, "请输入搜索词")
		return
	}
	if len(query) > 100 {
		query = query[:100]
	}

	source := c.Query("source") // stc or olx
	paperLimit := parseIntQuery(c, "paperLimit", 5)
	authorLimit := parseIntQuery(c, "authorLimit", 5)
	if paperLimit > 10 {
		paperLimit = 10
	}
	if authorLimit > 10 {
		authorLimit = 10
	}

	result, err := h.manager.GetSearchSuggestions(c.Request.Context(), query, source, paperLimit, authorLimit)
	if err != nil {
		utils.Error(c, 4024, "获取搜索建议失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// ======================== JNL Journal Handlers ========================

// SearchJournals handles journal search requests
// POST /api/v1/scholar/journals/search
func (h *Handler) SearchJournals(c *gin.Context) {
	var req JournalSearchOptions
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.PageSize == 0 {
		req.PageSize = 20
	}
	if req.Page == 0 {
		req.Page = 1
	}

	result, err := h.manager.SearchJournals(c.Request.Context(), req)
	if err != nil {
		utils.Error(c, 4030, "搜索期刊失败,请稍后重试")
		return
	}

	// 和论文同口径：仅把 minicod 已验证的搜索响应写成 tier-2 seed。
	// 匿名前端 expose 已禁止落库，因此这是动态期刊 sitemap 的可信发现链。
	if h.journalSEORecorder != nil {
		if seeds := buildVerifiedJournalSearchSEOSeeds(result); len(seeds) > 0 {
			recorder := h.journalSEORecorder
			safego.Record("seo-verified-journal-search", func() {
				if _, err := recorder.RecordJournalSearchSeeds(seeds); err != nil {
					slog.Warn("seo verified journal search record failed", "err", err)
				}
			})
		}
	}

	// 热门内容: 记期刊搜索词(与文献搜索词分桶)。hot_papers 是论文专用, 期刊不记曝光。
	if h.hotRecorder != nil && req.Keyword != "" {
		rec := h.hotRecorder
		keyword := req.Keyword
		safego.Record("hotcontent-journal-search", func() {
			_ = rec.RecordSearch(keyword, hotcontent.SearchTypeJournal)
		})
	}

	// 功能使用统计: "期刊搜索" 真实被用了一次。
	if h.statRecorder != nil {
		h.statRecorder.RecordFromGin(c, usagestat.FeatureJournalSearch, "search",
			map[string]any{"keyword": req.Keyword})
	}

	// 字段投影(必须在 SEO 种子采集之后):full=1 或显式 fields= 的请求保留上游原样
	//(调用方自己收口了字段,别替它二次裁剪),常规请求按白名单裁剪。
	if req.Full != "1" && req.Fields == "" {
		result = projectJournalRows(result)
	}
	utils.Success(c, redactJournalSubmissionURLs(result))
}

// ListJournals handles journal listing requests
// POST /api/v1/scholar/journals/list
func (h *Handler) ListJournals(c *gin.Context) {
	var req JournalListOptions
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.PageSize == 0 {
		req.PageSize = 20
	}
	if req.Page == 0 {
		req.Page = 1
	}

	result, err := h.manager.ListJournals(c.Request.Context(), req)
	if err != nil {
		utils.Error(c, 4031, "加载期刊列表失败,请稍后重试")
		return
	}

	// 字段投影:full=1 或显式 fields= 保留上游原样(seoingest 走 Go 层 Manager 不经这里,不受影响)。
	if req.Full != "1" && req.Fields == "" {
		result = projectJournalRows(result)
	}
	utils.Success(c, redactJournalSubmissionURLs(result))
}

// GetJournal handles get journal detail requests
// POST /api/v1/scholar/journals/get
func (h *Handler) GetJournal(c *gin.Context) {
	var req struct {
		ID   int    `json:"id" binding:"required"`
		Full string `json:"full"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	result, err := h.manager.GetJournal(c.Request.Context(), req.ID, req.Full)
	if err != nil {
		utils.Error(c, 4032, "加载期刊详情失败,请稍后重试")
		return
	}

	// 详情命中即 tier=1 写入 seo_journals。异步执行,失败不阻断主响应。
	// result 是 json.RawMessage,顶层结构 {unified: {...}, cover: ..., sources: ...},
	// SEO 关心的元数据都在 unified 下,但字段名是上游多源原貌
	// (publisher 在 crossref_publisher / doaj_publisher; issns 拆成 print/electronic 两列)。
	// 这里做一次轻量映射,失败回写就好,日志带 journal_id 方便排查。
	if len(result) > 0 {
		if seed := buildJournalSEOSeed(result); seed != nil {
			// The Go-generated slug is the single canonical truth for SSR,
			// sitemap and React. JavaScript Unicode lowercasing is observably
			// different for e.g. Greek final sigma and Turkish dotted I.
			result = injectJournalSEOSlug(result, seo.GenerateJournalSlug(seed.CanonicalName))
			if h.journalSEORecorder != nil {
				recorder := h.journalSEORecorder
				safego.Record("seo-journal-detail-click", func() {
					if err := recorder.RecordJournalDetailClick(seed); err != nil {
						slog.Warn("seo journal detail click record failed", "journal_id", seed.JournalID, "err", err)
					}
				})
			}
		}
	}

	// 抹掉投稿资源下载地址再回前端(保留 has_guideline/has_latex/latex_class)——
	// 下载必须走 Max 会员专享的后端代理,不能让公开详情泄漏上游可直链的下载地址。
	utils.Success(c, redactJournalSubmissionURLs(result))
}

// buildVerifiedJournalSearchSEOSeeds 解析 /v1/jnl/search 的
// {rows:[{unified:{...}}]} 响应。每行仍复用详情 seed 的字段兼容/验证逻辑，
// 避免前后端两套期刊质量口径漂移。
func buildVerifiedJournalSearchSEOSeeds(raw json.RawMessage) []seo.JournalSeed {
	var payload struct {
		Rows []json.RawMessage `json:"rows"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil || len(payload.Rows) == 0 {
		return nil
	}
	out := make([]seo.JournalSeed, 0, len(payload.Rows))
	seen := make(map[int64]struct{}, len(payload.Rows))
	for _, row := range payload.Rows {
		seed := buildJournalSEOSeed(row)
		if seed == nil {
			continue
		}
		if _, exists := seen[seed.JournalID]; exists {
			continue
		}
		seen[seed.JournalID] = struct{}{}
		out = append(out, *seed)
	}
	return out
}

// injectJournalSEOSlug adds the authoritative backend slug to both supported
// response shapes. The top-level copy supports flat responses; the nested copy
// is consumed by the current `{unified: ...}` frontend detail contract.
func injectJournalSEOSlug(raw json.RawMessage, slug string) json.RawMessage {
	if len(raw) == 0 || slug == "" {
		return raw
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return raw
	}
	doc["seo_slug"] = slug
	if unified, ok := doc["unified"].(map[string]any); ok {
		unified["seo_slug"] = slug
	}
	if encoded, err := json.Marshal(doc); err == nil {
		return encoded
	}
	return raw
}

// journalSeedFields 是 SEO 入库需要的期刊字段。**同时**带两套字段名以兼容上游两种响应形状:
//   - 新形状(api-1.json:Journal):字段全在 `data` 顶层,国家/类型/OA 用 openalex_* 前缀;
//   - 老形状:包在 { "unified": {...} } 里,国家/类型/OA 用裸 country/type/is_oa。
//
// 一个 struct 带全部别名 → 无论顶层解还是 unified 解都能填满,取值时按优先级挑非空的(见 buildJournalSEOSeed)。
type journalSeedFields struct {
	ID                int    `json:"id"`
	CanonicalName     string `json:"canonical_name"`
	CrossrefPublisher string `json:"crossref_publisher"`
	DOAJPublisher     string `json:"doaj_publisher"`
	ISSNL             string `json:"issn_l"`
	PrintISSN         string `json:"print_issn"`
	ElectronicISSN    string `json:"electronic_issn"`
	AllISSNs          string `json:"all_issns"`
	// 国家/类型:新 flat 用 openalex_*/doaj_*,老 unified 用裸名。
	Country         string `json:"country"`
	OpenAlexCountry string `json:"openalex_country"`
	DOAJCountry     string `json:"doaj_country"`
	Type            string `json:"type"`
	OpenAlexType    string `json:"openalex_type"`
	// 上游字段类型不稳定 (bool / 数字 0|1 / null) —— 用 RawMessage 兜底, 后面手动解。
	IsOA            json.RawMessage `json:"is_oa"`
	OpenAlexIsOA    json.RawMessage `json:"openalex_is_oa"`
	JCRImpactFactor json.RawMessage `json:"jcr_impact_factor"`
	JCRQuartile     string          `json:"jcr_quartile"`
	OpenAlexHIndex  json.RawMessage `json:"openalex_h_index"`
}

// buildJournalSEOSeed 从 GetJournal raw 响应里抽出 SEO 入库需要的字段。
//
// 形状兼容(对齐审计 #3):api-1.json 的 Journal 字段直接在 `data` 顶层(无 `unified` 包装);
// 历史部署可能仍返回 { "unified": {...} }。**先按顶层 flat 解,ID/name 不足再回退 unified 包装**,
// 两种形状都能正确 seeding(避免上游改扁平后 seo_journals 静默停更)。
//
// 返回 nil 表示数据不足以入库 (id<=0 / canonical_name 空 / 解码失败), 调用方应跳过。
func buildJournalSEOSeed(raw []byte) *seo.JournalSeed {
	// 先按新 flat 形状(顶层)解。
	var u journalSeedFields
	if err := json.Unmarshal(raw, &u); err != nil {
		return nil
	}
	// 顶层解不出有效期刊 → 回退老的 { "unified": {...} } 包装。
	if u.ID <= 0 || u.CanonicalName == "" {
		var wrap struct {
			Unified journalSeedFields `json:"unified"`
		}
		if err := json.Unmarshal(raw, &wrap); err == nil && wrap.Unified.ID > 0 {
			u = wrap.Unified
		}
	}
	if u.ID <= 0 || u.CanonicalName == "" {
		return nil
	}

	// publisher: 优先 crossref(覆盖率高), 退到 doaj
	publisher := u.CrossrefPublisher
	if publisher == "" {
		publisher = u.DOAJPublisher
	}
	// country / type:新 flat 无裸 country/type,回退 openalex_*/doaj_*。
	country := u.Country
	if country == "" {
		country = u.OpenAlexCountry
	}
	if country == "" {
		country = u.DOAJCountry
	}
	journalType := u.Type
	if journalType == "" {
		journalType = u.OpenAlexType
	}
	// is_oa:老裸名优先,回退 openalex_is_oa。
	isOARaw := u.IsOA
	if len(isOARaw) == 0 {
		isOARaw = u.OpenAlexIsOA
	}

	// issns: 收集 print + electronic 去重, 若仍空再切 all_issns CSV
	// 2026-08-10 审计:上游 print_issn/electronic_issn 字段本身可能是逗号拼接的多 ISSN 串
	// (Nature/JAMA 等 18 刊实测),不拆分会把 "A" 与 "A, B" 当两个元素双双入库 →
	// Periodical JSON-LD 输出重复+拼接的脏 issn 数组。所有字段统一:拆分 → TrimSpace →
	// 大写 X → 格式校验(^\d{4}-\d{3}[\dX]$)→ 保序去重。存量 18 行由迁移 0122 清洗
	// (「更长才覆盖」策略使干净值无法自然盖回)。
	seen := make(map[string]struct{}, 4)
	var issns []string
	add := func(raw string) {
		for _, part := range strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ';' }) {
			s := strings.ToUpper(strings.TrimSpace(part))
			if !issnRE.MatchString(s) {
				continue
			}
			if _, ok := seen[s]; ok {
				continue
			}
			seen[s] = struct{}{}
			issns = append(issns, s)
		}
	}
	add(u.ISSNL)
	add(u.PrintISSN)
	add(u.ElectronicISSN)
	if len(issns) == 0 && u.AllISSNs != "" {
		add(u.AllISSNs)
	}

	seed := &seo.JournalSeed{
		JournalID:       int64(u.ID),
		CanonicalName:   u.CanonicalName,
		Publisher:       publisher,
		ISSNs:           issns,
		Country:         country,
		Type:            journalType,
		IsOA:            parseFlexibleBool(isOARaw),
		JCRImpactFactor: parseFlexibleFloat(u.JCRImpactFactor),
		JCRQuartile:     u.JCRQuartile,
	}
	if h := parseFlexibleInt(u.OpenAlexHIndex); h > 0 {
		seed.OpenAlexHIndex = &h
	}
	return seed
}

// parseFlexibleBool 接受 true/false / 1/0 / "1"/"0" / null, 默认 false。
// 上游不同源会用不同形态的"是否 OA",这里统一兼容。
func parseFlexibleBool(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return false
	}
	switch s {
	case "true", "1", `"1"`, `"true"`, `"True"`:
		return true
	}
	return false
}

// parseFlexibleFloat 接受 number / "number" / null, 默认 0。
func parseFlexibleFloat(raw json.RawMessage) float64 {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0
	}
	// 去引号(若上游用字符串包数字)
	s = strings.Trim(s, `"`)
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}

// parseFlexibleInt 接受 number / "number" / null, 默认 0。
func parseFlexibleInt(raw json.RawMessage) int {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0
	}
	s = strings.Trim(s, `"`)
	v, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return v
}

// JournalsByNames batches journal lookups by canonical_name.
// POST /api/v1/public/journals/byNames
//
// 主要场景：搜索结果页一次拿一整页 venue 的分区/IF 信息回灌到论文卡。
// 上游约定：names 逗号分隔，可选 fields 字段白名单。
func (h *Handler) JournalsByNames(c *gin.Context) {
	var req struct {
		Names  string `json:"names" binding:"required"`
		Fields string `json:"fields"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	result, err := h.manager.JournalsByNames(c.Request.Context(), req.Names, req.Fields)
	if err != nil {
		utils.Error(c, 4040, "批量加载期刊失败,请稍后重试")
		return
	}
	utils.Success(c, redactJournalSubmissionURLs(result))
}

// ======================== 投稿资源 (submission, v2) ========================

// redactJournalSubmissionURLs 把 journal 响应里 submission.{guideline_url,latex_url}
// 抹成 null,防止公开端点把上游可直链的下载地址泄漏给非会员。
// 常见路径(无 full / 无 submission)零成本:先按子串探测,没命中就原样返回。
// journalRowProjection —— /public/journals/{list,search} 行内 unified 对象的字段白名单。
// 上游 /v1/jnl 的 unified 有 ~88 个字段,这两个公网端点的全部 HTTP 消费方
// (web 桌面 RawJournal / 移动 web feed JournalFeedCard / 小程序 journals.ts /
// 审稿 JournalPickerStep)合计只读下面这些;逐行白传其余字段 = 列表页每页 12-20 行的
// 纯带宽浪费(2026-08-12 全消费方盘点)。详情页全字段走 /journals/get,不投影。
// ⚠️ 三个注意点:
//  1. 投影必须在 handler 层、SEO 种子采集(buildVerifiedJournalSearchSEOSeeds)之后 ——
//     seoingest 走 Manager.ListJournals(Go 层)不经这里,manager/client 层投影会毁掉它;
//  2. full=1 的请求跳过投影(保留既有全量能力);
//  3. 前端要新消费字段,先加进这里再上线,否则拿到的是 undefined。
var journalRowProjection = map[string]struct{}{
	// 标识与名称
	"id": {}, "canonical_name": {}, "wikidata_label_zh": {}, "seo_slug": {},
	"issn_l": {}, "print_issn": {}, "electronic_issn": {}, "all_issns": {},
	// 来源与出版方
	"source_count": {}, "sources": {}, "crossref_publisher": {}, "doaj_publisher": {},
	"openalex_country": {}, "doaj_country": {}, "country": {}, "type": {}, "openalex_type": {},
	// OA 与体量
	"is_oa": {}, "openalex_is_oa": {}, "doaj_is_in_doaj": {},
	"openalex_works_count": {}, "openalex_cited_by_count": {}, "openalex_h_index": {},
	// 分区与指标
	"scimago_best_quartile": {}, "scimago_sjr": {},
	"jcr_impact_factor": {}, "jcr_quartile": {},
	"fqb_major_quartile": {}, "fqb_major_category": {}, "fqb_top": {},
	"xr_major_quartile": {}, "xr_top": {}, "ccf_rank": {},
	// 预警与投稿
	"gjqk_year": {}, "gjqk_warning_level": {}, "has_submission": {},
	"scirev_first_review_months": {},
	// 展示资产
	"cover": {},
}

// projectJournalRows 对 {rows:[{unified:...}]} 信封按白名单裁剪 unified 字段。
// fail-open:信封/行形状不符合预期就原样返回 —— 投影是带宽优化,不承担正确性语义。
func projectJournalRows(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return raw
	}
	var envelope map[string]any
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return raw
	}
	rows, ok := envelope["rows"].([]any)
	if !ok {
		return raw
	}
	for _, r := range rows {
		row, ok := r.(map[string]any)
		if !ok {
			continue
		}
		unified, ok := row["unified"].(map[string]any)
		if !ok {
			continue
		}
		for k := range unified {
			if _, keep := journalRowProjection[k]; !keep {
				delete(unified, k)
			}
		}
	}
	if b, err := json.Marshal(envelope); err == nil {
		return b
	}
	return raw
}

func redactJournalSubmissionURLs(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return raw
	}
	// 真实下载地址键:sources.submission.latex.zip_url / sources.submission.guidelines_md_url
	//(老文档里的 guideline_url / latex_url 一并兜底)。都不出现就零成本返回。
	if !bytes.Contains(raw, []byte("zip_url")) &&
		!bytes.Contains(raw, []byte("guidelines_md_url")) &&
		!bytes.Contains(raw, []byte("guideline_url")) &&
		!bytes.Contains(raw, []byte("latex_url")) {
		return raw
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return raw
	}
	redactSubmissionURLsDeep(v)
	if b, err := json.Marshal(v); err == nil {
		return b
	}
	return raw
}

// redactSubmissionURLsDeep 递归把投稿下载地址键置 null。这些键(zip_url /
// guidelines_md_url / guideline_url / latex_url)只出现在 submission 子树里,
// 直接全局抹掉即可 —— 防止公开端点泄漏上游可直链的下载地址(下载须走 Max 会员专享代理)。
func redactSubmissionURLsDeep(v any) {
	urlKeys := []string{"zip_url", "guidelines_md_url", "guideline_url", "latex_url"}
	switch t := v.(type) {
	case map[string]any:
		for _, k := range urlKeys {
			if _, ok := t[k]; ok {
				t[k] = nil
			}
		}
		for _, val := range t {
			redactSubmissionURLsDeep(val)
		}
	case []any:
		for _, val := range t {
			redactSubmissionURLsDeep(val)
		}
	}
}

// DownloadJournalSubmission 期刊投稿资源下载(投稿须知 .md / LaTeX 模板 .zip)。
// GET /api/v1/user/journals/:id/submission/:kind  (kind = guideline | latex)
//
// 双重门槛:① 后端校验【站内】用户 tier=max(下面)② 上游再校验 API Key 账号为最高价位套餐。
// 后端持 key 代理 POST 上游 /v1/jnl/submission/{kind} 并把文件流原样回传(key 不出后端)。
func (h *Handler) DownloadJournalSubmission(c *gin.Context) {
	id, err := strconv.Atoi(strings.TrimSpace(c.Param("id")))
	if err != nil || id <= 0 {
		utils.Error(c, 40001, "无效的期刊 ID")
		return
	}
	kind := c.Param("kind")
	if kind != "guideline" && kind != "latex" {
		utils.Error(c, 40001, "无效的资源类型")
		return
	}

	uid, ok := utils.GetUserID(c)
	if !ok {
		utils.Unauthorized(c, "请先登录")
		return
	}
	if h.membership == nil || h.membership.EffectiveTier(uid) != membershipTierMax {
		utils.ForbiddenWithCode(c, codeJournalSubmissionUpgradeRequired,
			"投稿须知与 LaTeX 模板下载为 Max 会员专享,升级后即可下载")
		return
	}

	// 上游 v2:POST /v1/jnl/submission/{kind} {id} 直接回文件流(按次计费 + 要求 key 账号
	// 是最高价位套餐;否则 403,该刊无文件 404)。我们已先在上面校验了**站内**用户 tier=max。
	resp, err := h.manager.DownloadJournalSubmission(c.Request.Context(), kind, id)
	if err != nil {
		slog.Warn("journal submission download failed", "journal_id", id, "kind", kind, "err", err)
		utils.Error(c, 4032, "下载投稿资源失败,请稍后重试")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		switch resp.StatusCode {
		case http.StatusNotFound:
			utils.Error(c, 40401, "该期刊暂无该投稿资源")
		case http.StatusForbidden:
			// 上游:API Key 账号非最高价位套餐(我们的 key 应为 max,真到这说明上游账号掉级)
			slog.Warn("journal submission upstream 403 (api key account not top-tier)", "journal_id", id, "kind", kind)
			utils.Error(c, 4032, "投稿资源下载暂不可用,请联系管理员")
		default:
			slog.Warn("journal submission upstream non-200", "journal_id", id, "kind", kind, "status", resp.StatusCode)
			utils.Error(c, 4032, "下载投稿资源失败,请稍后重试")
		}
		return
	}

	var contentType, fileSuffix string
	if kind == "latex" {
		contentType, fileSuffix = "application/zip", "-LaTeX模板.zip"
	} else {
		contentType, fileSuffix = "text/markdown; charset=utf-8", "-投稿须知.md"
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(ct, "text/html") {
		contentType = ct
	}
	// 文件名:前端可带 ?name=<期刊名> 作友好名(前端 blob 下载也会自己再命名,这里是兜底)。
	name := strings.TrimSpace(c.Query("name"))
	if name == "" {
		name = "journal-" + strconv.Itoa(id)
	}
	filename := sanitizeFilename(name) + fileSuffix
	c.Header("Content-Type", contentType)
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		c.Header("Content-Length", cl)
	}
	// RFC 5987: ASCII 回退 + UTF-8 文件名,中文名才不乱码。
	c.Header("Content-Disposition",
		"attachment; filename=\"submission"+fileSuffix+"\"; filename*=UTF-8''"+url.PathEscape(filename))
	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, resp.Body); err != nil {
		slog.Warn("journal submission stream copy failed", "journal_id", id, "kind", kind, "err", err)
	}
}

// sanitizeFilename 去掉文件名里的路径分隔符 / 控制字符,截断到合理长度。
func sanitizeFilename(s string) string {
	s = strings.TrimSpace(s)
	repl := strings.NewReplacer("/", "_", "\\", "_", "\n", " ", "\r", " ", "\t", " ", "\"", "")
	s = repl.Replace(s)
	if r := []rune(s); len(r) > 80 {
		s = string(r[:80])
	}
	if s == "" {
		s = "journal"
	}
	return s
}

// SuggestJournals returns journal-name prefix autocomplete suggestions.
// POST /api/v1/scholar/journals/suggest  (or /public/journals/suggest)
//
// 前端用来做"搜索框联想"。upstream /v1/jnl/suggest 返回轻量字段
// （id / canonical_name / issn_l / source_count / openalex_works_count）。
func (h *Handler) SuggestJournals(c *gin.Context) {
	var req struct {
		Q     string `json:"q" binding:"required"`
		Limit int    `json:"limit"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.Limit <= 0 || req.Limit > 20 {
		req.Limit = 10
	}

	result, err := h.manager.SuggestJournals(c.Request.Context(), req.Q, req.Limit)
	if err != nil {
		utils.Error(c, 4039, "获取期刊建议失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// GetJournalStats returns journal statistics
// POST /api/v1/scholar/journals/stats
func (h *Handler) GetJournalStats(c *gin.Context) {
	result, err := h.manager.GetJournalStats(c.Request.Context())
	if err != nil {
		utils.Error(c, 4034, "加载期刊统计数据失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// Helper function to parse integer query parameters
func parseIntQuery(c *gin.Context, key string, defaultValue int) int {
	if val := c.Query(key); val != "" {
		if intVal, err := strconv.Atoi(val); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// maxPageSize Semantic Scholar 单次最大返回条数；超过会被上游截断。
const maxPageSize = 100

// clampLimit 将 limit 夹在 [1, maxPageSize]。
// 用于所有 list/search 接口参数校验，防止客户端传 10000 触发上游慢查询或大量流量。
func clampLimit(limit int) int {
	if limit <= 0 {
		return 10
	}
	if limit > maxPageSize {
		return maxPageSize
	}
	return limit
}

// clampOffset 保证 offset 非负。
func clampOffset(offset int) int {
	if offset < 0 {
		return 0
	}
	return offset
}

// parseYearRange 将前端传入的 year / yearFrom / yearTo 统一转换为上游需要的 int 对。
// 支持 "2020", "2020-", "-2023", "2020-2023" 以及分离字段两种来源。
func parseYearRange(year, yearFrom, yearTo string) (int, int) {
	from := atoiSafe(yearFrom)
	to := atoiSafe(yearTo)
	if from == 0 && to == 0 && year != "" {
		if strings.Contains(year, "-") {
			parts := strings.SplitN(year, "-", 2)
			from = atoiSafe(parts[0])
			if len(parts) == 2 {
				to = atoiSafe(parts[1])
			}
		} else {
			from = atoiSafe(year)
		}
	}
	return from, to
}

func atoiSafe(s string) int {
	if s == "" {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0
	}
	return n
}
