// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"scholar-backend/internal/common/upstream"
)

const (
	// 注:不再有 DefaultBaseURL 兜底常量 —— baseURL 严格来自 third_party_accounts
	// 的 minicod 配置, 没配就报错, 不允许隐式回落到任何固定域名。
	DefaultTimeout      = 60 * time.Second
	DialTimeout         = 15 * time.Second
	TLSHandshakeTimeout = 15 * time.Second
	KeepAlive           = 30 * time.Second

	// Search source constants — 与 api-1.json 上游 path 前缀对齐。
	// 注意:PMD 上游**只有** papers/{search,authors,get,doi,...},
	// 既没有 papers/autocomplete 也没有 authors/search —— 搜索补全 / 作者补全
	// 一律只用 STC + OLX 两源(见下面 PaperSources / AuthorSources)。
	SourceSTC = "stc" // Scholay 精选 (STC / Semantic Scholar)
	SourceOLX = "olx" // Scholay 全域 (OpenAlex)
	SourcePMD = "pmd" // Scholay 医学 (PubMed / NCBI E-utilities)
)

// PaperSources lists the paper sources we fan out to in suggestion (autocomplete) mode.
// **只** STC + OLX:PMD 上游无 papers/autocomplete(命中即 404),补全用这两源足够。
// 顺序即"优先级"(展示时 STC 优先,OLX 其次)。
var PaperSources = []string{SourceSTC, SourceOLX}

// AuthorSources lists the author sources(PMD 上游无 authors/search,作者补全只用 STC + OLX)。
var AuthorSources = []string{SourceSTC, SourceOLX}

// sourcePrefix returns the API path prefix for the given source
// e.g. "stc" → "/v1/stc", "olx" → "/v1/olx", "pmd" → "/v1/pmd"
func sourcePrefix(source string) string {
	switch source {
	case SourceOLX:
		return "/v1/olx"
	case SourcePMD:
		return "/v1/pmd"
	default:
		return "/v1/stc"
	}
}

// paperPath 返回某源 + 某动作的论文端点完整路径。
//
// 命名陷阱:OpenAlex 把论文叫 "works", 所以 OLX 是 `/v1/olx/works/<action>`,
// 而 STC / PMD 用 `/v1/<source>/papers/<action>`。早期 `sourcePrefix + "/papers/X"`
// 这种简单拼接对 OLX 全错(404 page not found)。所有调论文端点的地方都走这里。
//
// 不存在的端点也通过这个函数派发(例:PMD 不支持 autocomplete),
// 调用方须自行做能力检查,本函数只负责"如果支持,正确 URL 是什么"。
func paperPath(source, action string) string {
	if source == SourceOLX {
		return "/v1/olx/works/" + action
	}
	return sourcePrefix(source) + "/papers/" + action
}

// 共享 HTTP transport — 跟原实现一致, 自带 TLS 1.2 / 100 idle / 30s response header timeout。
// upstream.Client 用 http.Client 包它, 共享底层连接池避免每个 Minicod Client 都开新池。
var (
	sharedHTTPClient     *http.Client
	sharedHTTPClientOnce sync.Once
)

func getSharedHTTPClient() *http.Client {
	sharedHTTPClientOnce.Do(func() {
		tr := &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   DialTimeout,
				KeepAlive: KeepAlive,
			}).DialContext,
			TLSHandshakeTimeout:   TLSHandshakeTimeout,
			ResponseHeaderTimeout: 30 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			MaxIdleConns:          100,
			MaxIdleConnsPerHost:   20,
			IdleConnTimeout:       90 * time.Second,
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		}
		sharedHTTPClient = &http.Client{Timeout: DefaultTimeout, Transport: tr}
	})
	return sharedHTTPClient
}

// upstream.Client 按 baseURL 缓存 — 不同 third_party_accounts 可以配不同 host,
// 同一个 host 共享同一份 breaker / 池子。
var (
	upstreamMu     sync.RWMutex
	upstreamByBase = make(map[string]*upstream.Client)
)

func getUpstream(baseURL string) *upstream.Client {
	upstreamMu.RLock()
	cli, ok := upstreamByBase[baseURL]
	upstreamMu.RUnlock()
	if ok {
		return cli
	}
	upstreamMu.Lock()
	defer upstreamMu.Unlock()
	if cli, ok := upstreamByBase[baseURL]; ok {
		return cli
	}
	// 不在 upstream 层重试 — 上层 manager.executeWithRetry 已经做账户轮换,
	// 把重试集中在那一层更清晰 (上层有"换账户"语义, upstream 只能"同账户重打")。
	cli = upstream.New("minicod").
		BaseURL(baseURL).
		HTTPClient(getSharedHTTPClient()).
		Breaker(upstream.BreakerConfig{
			MaxRequests:  3,
			MinRequests:  3,
			FailureRatio: 0.6,
			Timeout:      30 * time.Second,
		}).
		MustBuild()
	upstreamByBase[baseURL] = cli
	return cli
}

// Client represents a Minicod API client
type Client struct {
	apiKey  string
	baseURL string
	up      *upstream.Client
}

// NewClientWithBaseURL creates a new Minicod API client.
// baseURL 必须由调用方(manager)从 DB 配置取到非空值; 传空会导致请求时
// upstream.buildURL 报 "baseURL not configured" —— 这是预期的硬失败, 不兜底。
func NewClientWithBaseURL(apiKey string, baseURL string) *Client {
	return &Client{
		apiKey:  apiKey,
		baseURL: baseURL,
		up:      getUpstream(baseURL),
	}
}

// HasAPIKey returns true if the client has an API key configured
func (c *Client) HasAPIKey() bool {
	return c.apiKey != ""
}

// GetAPIKeyLength returns the length of the API key (for debugging)
func (c *Client) GetAPIKeyLength() int {
	return len(c.apiKey)
}

// doPost performs a POST request with JSON body and Bearer auth, parses Minicod
// envelope { code, message, data }.
//
// 走 common/upstream — HTTP 层错误已经 typed (ErrAuth / ErrRateLimit / ...),
// manager.isRetryableError 用 errors.Is 判别, 然后切账户重试。
// 业务层 (envelope.Code != 0) 仍在这里识别 — 这是 Minicod 私有协议, 不在通用基建职责内。
func (c *Client) doPost(ctx context.Context, path string, body any) (json.RawMessage, error) {
	headers := http.Header{}
	if c.apiKey != "" {
		headers.Set("Authorization", "Bearer "+c.apiKey)
		slog.Debug("minicod request", "path", path, "keyLength", len(c.apiKey))
	}

	resp, err := c.up.Do(ctx, upstream.Request{
		Method:   http.MethodPost,
		Path:     path,
		Headers:  headers,
		BodyJSON: body,
	})
	if err != nil {
		// 透传 *upstream.Error — manager 能用 errors.Is 判 ErrAuth / ErrRateLimit 走重试
		return nil, err
	}

	var apiResp APIResponse
	if err := json.Unmarshal(resp.Body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse minicod response: %w (body: %s)", err, string(resp.Body))
	}
	if apiResp.Code != 0 {
		// typed error（Error() 串保持与旧 fmt.Errorf 一致），调用方可 errors.As 拿 Code
		// 区分「资源未找到」等正常业务态与真故障。
		return nil, &APIStatusError{Code: apiResp.Code, Message: apiResp.Message}
	}
	return apiResp.Data, nil
}

// isNotFoundErr 判断是否「资源未找到」——HTTP 404(upstream.ErrNotFound)或上游业务码
// 40401/40400。DOI/标题精确查询在某源未命中是**正常结果**,不能当上游故障计入熔断
// (否则一个 DOI 只在 1 源命中、另 2 源"未找到"就会把与主搜索共享的源级熔断器打开)。
func isNotFoundErr(err error) bool {
	if errors.Is(err, upstream.ErrNotFound) {
		return true
	}
	var se *APIStatusError
	if errors.As(err, &se) {
		return se.Code == 40401 || se.Code == 40400 || se.Code == 404
	}
	return false
}

// ======================== STC Paper Endpoints ========================

// SearchPapers searches for papers via STC source
func (c *Client) SearchPapers(ctx context.Context, opts PaperSearchOptions) (*SearchResponse, error) {
	// 通用字段(所有源都支持):query / limit / offset / year_from / year_to /
	//   date_from / date_to / venue / fields / sort
	body := map[string]any{
		"query": opts.Query,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	if opts.YearFrom > 0 {
		body["year_from"] = opts.YearFrom
	}
	if opts.YearTo > 0 {
		body["year_to"] = opts.YearTo
	}
	if opts.DateFrom != "" {
		body["date_from"] = opts.DateFrom
	}
	if opts.DateTo != "" {
		body["date_to"] = opts.DateTo
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}
	if len(opts.Venue) > 0 {
		body["venue"] = strings.Join(opts.Venue, ",")
	}
	if opts.Sort != "" && opts.Sort != "relevance" {
		// 上游 stc 的 relevance 端点忽略 sort;只在用户明确选择 citations/date 时传。
		body["sort"] = opts.Sort
	}

	// types / open_access / min_citations / subjects —— api-1.json 显示 stc/olx/pmd
	// 的 SearchOptions 都接受这些字段, 所以三源统一透传 (此前误把 PMD 排除掉了)。
	if len(opts.PublicationTypes) > 0 {
		body["types"] = opts.PublicationTypes
	}
	if opts.OpenAccessPDF == "true" {
		body["open_access"] = true
	}
	if opts.MinCitationCount > 0 {
		body["min_citations"] = opts.MinCitationCount
	}
	if len(opts.FieldsOfStudy) > 0 {
		body["subjects"] = opts.FieldsOfStudy
	}

	// OLX 是 /v1/olx/works/search,不是 /papers/search,统一走 paperPath
	data, err := c.doPost(ctx, paperPath(opts.Source, "search"), body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper search result: %w", err)
	}

	// Convert to frontend-compatible format
	result := &SearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   ConvertPapers(raw.Items),
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaper retrieves paper details
func (c *Client) GetPaper(ctx context.Context, paperID string, opts PaperDetailsOptions) (*Paper, error) {
	body := map[string]any{
		"id": paperID,
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	// Determine endpoint based on ID prefix
	path := "/v1/stc/papers/get"
	if strings.HasPrefix(paperID, "olx:") {
		path = "/v1/olx/works/get"
		// Strip prefix — OLX API expects raw ID (e.g., "W2726369860")
		body["id"] = strings.TrimPrefix(paperID, "olx:")
		// OLX uses "select" instead of "fields"
		if len(opts.Fields) > 0 {
			delete(body, "fields")
			body["select"] = strings.Join(opts.Fields, ",")
		}
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaper
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper detail: %w", err)
	}

	paper := ConvertPaper(raw)
	return &paper, nil
}

// GetPaperByDOI 通过 DOI **精确解析**单篇论文(POST /v1/{src}/papers/doi,olx 是 /works/doi)。
//
// 与 SearchPapers(把 DOI 当模糊查询词)不同:这是按 DOI 精确取,DOI 是唯一标识,命中即权威。
// 上传 PDF 识别时优先走它 —— 抽到 DOI 就直接锁定论文,不靠全文检索碰运气。
// 未命中(该源无此 DOI)上游一般返 code!=0 或空 data,统一当"未找到"返回 (nil, nil)。
func (c *Client) GetPaperByDOI(ctx context.Context, source, doi string) (*Paper, error) {
	doi = strings.TrimSpace(doi)
	if doi == "" {
		return nil, nil
	}
	// 不限制 fields —— 识别要拿完整元数据做在线增补层(被引/OA/venue 等)
	data, err := c.doPost(ctx, paperPath(source, "doi"), map[string]any{"doi": doi})
	if err != nil {
		if isNotFoundErr(err) {
			return nil, nil // 该源没有这个 DOI:正常未命中,不算失败(不污染熔断)
		}
		return nil, err // 真故障(auth/5xx/网络)照常上抛,交给重试/熔断
	}
	return convertSinglePaperOrNil(data, source)
}

// MatchPaperByTitle 按标题**精确匹配**单篇论文(POST /v1/stc/papers/search/match,仅 stc)。
//
// Semantic Scholar 的 title-match 端点:返回与标题最匹配的单篇(比 /papers/search 的模糊
// 关键词检索精准得多)。上传 PDF 无 DOI 时用它按抽到的标题锁定论文。未命中返 (nil, nil)。
func (c *Client) MatchPaperByTitle(ctx context.Context, title string) (*Paper, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, nil
	}
	data, err := c.doPost(ctx, "/v1/stc/papers/search/match", map[string]any{"query": title})
	if err != nil {
		if isNotFoundErr(err) {
			return nil, nil // 标题无精确匹配:正常未命中,不算失败
		}
		return nil, err
	}
	return convertSinglePaperOrNil(data, SourceSTC)
}

// convertSinglePaperOrNil 把 doPost 返回的单篇 data 转成 Paper;空 data / 空 id 视为"未找到"。
// source 强制回填:doi/match 端点响应里可能不带 source,而 normalizeID 要靠它给 olx/pmd
// 的 id 加前缀(如 "olx:W123"),否则 source_paper_id 少前缀会导致后续 GetPaper 路由错。
func convertSinglePaperOrNil(data json.RawMessage, source string) (*Paper, error) {
	if len(data) == 0 || string(data) == "null" {
		return nil, nil
	}
	var raw RawPaper
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper: %w", err)
	}
	if strings.TrimSpace(raw.Source) == "" {
		raw.Source = source
	}
	paper := ConvertPaper(raw)
	if strings.TrimSpace(paper.PaperID) == "" && strings.TrimSpace(paper.Title) == "" {
		return nil, nil // 空壳,当未命中
	}
	return &paper, nil
}

// GetPaperBatch retrieves multiple papers by IDs.
//
// 按 ID 前缀分桶分别请求各源批量端点,合并结果。前缀约定:
//   - "olx:..."  → /v1/olx/works/batch  (剥前缀)
//   - "pmd:..."  → /v1/pmd/papers/batch (剥前缀)
//   - 其他       → /v1/stc/papers/batch (原值)
//
// 跨源混合 ID 也 OK,三组各发一个请求,并行/串行(此处串行,样本量小)。
// 注:OLX 用 "select" 替代 "fields" 字段名 —— 上游历史命名差异。
func (c *Client) GetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]Paper, error) {
	if len(paperIDs) == 0 {
		return nil, nil
	}

	var stcIDs, olxIDs, pmdIDs []string
	for _, id := range paperIDs {
		switch {
		case strings.HasPrefix(id, "olx:"):
			olxIDs = append(olxIDs, strings.TrimPrefix(id, "olx:"))
		case strings.HasPrefix(id, "pmd:"):
			pmdIDs = append(pmdIDs, strings.TrimPrefix(id, "pmd:"))
		default:
			stcIDs = append(stcIDs, id)
		}
	}

	out := make([]Paper, 0, len(paperIDs))

	if len(stcIDs) > 0 {
		body := map[string]any{"ids": stcIDs}
		if len(fields) > 0 {
			body["fields"] = strings.Join(fields, ",")
		}
		data, err := c.doPost(ctx, "/v1/stc/papers/batch", body)
		if err != nil {
			return nil, err
		}
		var raws []RawPaper
		if err := json.Unmarshal(data, &raws); err != nil {
			return nil, fmt.Errorf("failed to parse stc batch papers: %w", err)
		}
		out = append(out, ConvertPapers(raws)...)
	}

	if len(olxIDs) > 0 {
		body := map[string]any{"ids": olxIDs}
		if len(fields) > 0 {
			body["select"] = strings.Join(fields, ",")
		}
		data, err := c.doPost(ctx, "/v1/olx/works/batch", body)
		if err != nil {
			return nil, err
		}
		var raws []RawPaper
		if err := json.Unmarshal(data, &raws); err != nil {
			return nil, fmt.Errorf("failed to parse olx batch papers: %w", err)
		}
		out = append(out, ConvertPapers(raws)...)
	}

	if len(pmdIDs) > 0 {
		// PMD 的 /v1/pmd/papers/batch 上游走 NCBI esummary,**只返元数据,没 abstract**。
		// 经实测,STC 的 /v1/stc/papers/get 单篇接口会用同一 ID 跑 efetch 拿 abstract
		// (与 GetPaper 单篇路径一致)—— fan-out 复用这个,保留 `pmd:` 前缀。
		// sem 限并发避免上游打爆;单篇失败静默丢弃,不阻塞整批。
		const pmdConcurrency = 8
		results := make([]Paper, len(pmdIDs))
		ok := make([]bool, len(pmdIDs))

		eg, egCtx := errgroup.WithContext(ctx)
		eg.SetLimit(pmdConcurrency)

		for i, id := range pmdIDs {
			i, id := i, id
			fullID := "pmd:" + id // 上面把前缀剥掉了,这里要补回
			eg.Go(func() error {
				body := map[string]any{"id": fullID}
				if len(fields) > 0 {
					body["fields"] = strings.Join(fields, ",")
				}
				data, err := c.doPost(egCtx, "/v1/stc/papers/get", body)
				if err != nil {
					return nil // 单篇失败不冒泡,后面 ok[i]=false 即可
				}
				var raw RawPaper
				if err := json.Unmarshal(data, &raw); err != nil {
					return nil
				}
				results[i] = ConvertPaper(raw)
				ok[i] = true
				return nil
			})
		}
		_ = eg.Wait()

		for i, p := range results {
			if ok[i] {
				out = append(out, p)
			}
		}
	}

	return out, nil
}

// GetPaperCitations retrieves papers that cite the given paper
func (c *Client) GetPaperCitations(ctx context.Context, paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	body := map[string]any{
		"paper_id": paperID,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	// Determine endpoint based on ID prefix
	path := "/v1/stc/papers/citations"
	if strings.HasPrefix(paperID, "olx:") {
		path = "/v1/olx/works/citations"
		body["paper_id"] = strings.TrimPrefix(paperID, "olx:")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse citations: %w", err)
	}

	result := &CitationsResponse{
		Offset: raw.Offset,
		Data:   ConvertPapersToCitations(raw.Items),
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaperReferences retrieves papers referenced by the given paper
func (c *Client) GetPaperReferences(ctx context.Context, paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	body := map[string]any{
		"paper_id": paperID,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	path := "/v1/stc/papers/references"
	if strings.HasPrefix(paperID, "olx:") {
		path = "/v1/olx/works/references"
		body["paper_id"] = strings.TrimPrefix(paperID, "olx:")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse references: %w", err)
	}

	result := &ReferencesResponse{
		Offset: raw.Offset,
		Data:   ConvertPapersToCitations(raw.Items),
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaperAuthors retrieves authors of a specific paper
func (c *Client) GetPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	body := map[string]any{
		"paper_id": paperID,
	}
	if limit > 0 {
		body["limit"] = limit
	}
	if offset > 0 {
		body["offset"] = offset
	}
	if len(fields) > 0 {
		body["fields"] = strings.Join(fields, ",")
	}

	path := "/v1/stc/papers/authors"
	if strings.HasPrefix(paperID, "olx:") {
		path = "/v1/olx/works/authors"
		body["paper_id"] = strings.TrimPrefix(paperID, "olx:")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawAuthorSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper authors: %w", err)
	}

	return &AuthorSearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   ConvertAuthors(raw.Items),
	}, nil
}

// PaperAutocomplete returns paper title suggestions.
//
// 支持矩阵:
//
//	STC → /v1/stc/papers/autocomplete  ✓  data 是裸数组 [SemanticAutocompleteItem]
//	OLX → /v1/olx/works/autocomplete   ✓  data 是对象 {items:[AutocompleteItem], total}
//	PMD → ✗ 无此端点, 调用方 (suggestPapersForSource) 不会传 PMD 进来
//
// 两家上游的 autocomplete 返回结构不同:STC 直接给数组,OLX 包了一层 {items,total}。
// 早期统一按数组解析 → OLX 必报 "cannot unmarshal object into []RawAutocompleteItem"。
func (c *Client) PaperAutocomplete(ctx context.Context, query, source string) (*AutocompleteResponse, error) {
	body := map[string]any{
		"query": query,
	}

	data, err := c.doPost(ctx, paperPath(source, "autocomplete"), body)
	if err != nil {
		return nil, err
	}

	var raws []RawAutocompleteItem
	if source == SourceOLX {
		// OLX(OpenAlex)autocomplete 的 data 是对象 {items:[...], total},取 items。
		var wrap struct {
			Items []RawAutocompleteItem `json:"items"`
		}
		if err := json.Unmarshal(data, &wrap); err != nil {
			return nil, fmt.Errorf("failed to parse autocomplete (olx): %w", err)
		}
		raws = wrap.Items
	} else {
		// STC autocomplete 的 data 直接是数组。
		if err := json.Unmarshal(data, &raws); err != nil {
			return nil, fmt.Errorf("failed to parse autocomplete (stc): %w", err)
		}
	}

	matches := make([]AutocompleteMatch, 0, len(raws))
	for _, r := range raws {
		matches = append(matches, AutocompleteMatch{
			ID:    r.ID,
			Title: r.Label(), // STC: title / OLX: display_name
		})
	}

	return &AutocompleteResponse{Matches: matches}, nil
}

// ======================== STC Author Endpoints ========================

// SearchAuthors searches for authors
func (c *Client) SearchAuthors(ctx context.Context, opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	body := map[string]any{
		"query": opts.Query,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	prefix := sourcePrefix(opts.Source)
	data, err := c.doPost(ctx, prefix+"/authors/search", body)
	if err != nil {
		return nil, err
	}

	var raw RawAuthorSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse author search: %w", err)
	}

	return &AuthorSearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   ConvertAuthors(raw.Items),
	}, nil
}

// GetAuthor retrieves author details
func (c *Client) GetAuthor(ctx context.Context, authorID string, fields []string) (*Author, error) {
	body := map[string]any{
		"id": authorID,
	}
	if len(fields) > 0 {
		body["fields"] = strings.Join(fields, ",")
	}

	path := "/v1/stc/authors/get"
	if strings.HasPrefix(authorID, "olx:") {
		path = "/v1/olx/authors/get"
		body["id"] = strings.TrimPrefix(authorID, "olx:")
		if len(fields) > 0 {
			delete(body, "fields")
			body["select"] = strings.Join(fields, ",")
		}
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawAuthor
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse author detail: %w", err)
	}

	author := ConvertAuthor(raw)
	return &author, nil
}

// GetAuthorPapers retrieves papers by a specific author
func (c *Client) GetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	body := map[string]any{
		"author_id": authorID,
	}
	if limit > 0 {
		body["limit"] = limit
	}
	if offset > 0 {
		body["offset"] = offset
	}
	if len(fields) > 0 {
		body["fields"] = strings.Join(fields, ",")
	}

	path := "/v1/stc/authors/papers"
	if strings.HasPrefix(authorID, "olx:") {
		path = "/v1/olx/authors/papers"
		body["author_id"] = strings.TrimPrefix(authorID, "olx:")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse author papers: %w", err)
	}

	result := &SearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   ConvertPapers(raw.Items),
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// ======================== STC Recommendation Endpoints ========================

// GetRecommendationsForPaper gets recommendations based on a single paper
func (c *Client) GetRecommendationsForPaper(ctx context.Context, paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	body := map[string]any{
		"paper_id": paperID,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	data, err := c.doPost(ctx, "/v1/stc/recommendations/paper", body)
	if err != nil {
		return nil, err
	}

	var raw RawRecommendationResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse recommendations: %w", err)
	}

	return &RecommendationsResponse{
		RecommendedPapers: ConvertPapers(raw.RecommendedPapers),
	}, nil
}

// GetRecommendations gets recommendations based on positive/negative examples
func (c *Client) GetRecommendations(ctx context.Context, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	body := map[string]any{
		"positive_paper_ids": opts.PositivePaperIDs,
	}
	if len(opts.NegativePaperIDs) > 0 {
		body["negative_paper_ids"] = opts.NegativePaperIDs
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	data, err := c.doPost(ctx, "/v1/stc/recommendations", body)
	if err != nil {
		return nil, err
	}

	var raw RawRecommendationResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse recommendations: %w", err)
	}

	return &RecommendationsResponse{
		RecommendedPapers: ConvertPapers(raw.RecommendedPapers),
	}, nil
}

// ======================== JNL Journal Endpoints ========================

// SearchJournals searches journals with multi-dimensional filtering
func (c *Client) SearchJournals(ctx context.Context, opts JournalSearchOptions) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/search", opts)
}

// ListJournals lists journals with basic filtering and sorting
func (c *Client) ListJournals(ctx context.Context, opts JournalListOptions) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/list", opts)
}

// GetJournal retrieves a single journal by ID
func (c *Client) GetJournal(ctx context.Context, id int, full string) (json.RawMessage, error) {
	body := map[string]any{
		"id": id,
	}
	if full != "" {
		body["full"] = full
	}
	return c.doPost(ctx, "/v1/jnl/get", body)
}

// GetJournalFilters returns available filter options for journal search
func (c *Client) GetJournalFilters(ctx context.Context) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/filters", map[string]any{})
}

// GetJournalStats returns journal statistics overview
func (c *Client) GetJournalStats(ctx context.Context) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/stats", map[string]any{})
}

// GetJournalByISSN retrieves a journal by ISSN
func (c *Client) GetJournalByISSN(ctx context.Context, issn string, full string) (json.RawMessage, error) {
	body := map[string]any{
		"issn": issn,
	}
	if full != "" {
		body["full"] = full
	}
	return c.doPost(ctx, "/v1/jnl/byIssn", body)
}

// CompareJournals compares 2-10 journals
func (c *Client) CompareJournals(ctx context.Context, ids string) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/compare", map[string]any{"ids": ids})
}

// SuggestJournals returns journal-name prefix autocomplete suggestions.
//
// Upstream contract (POST /v1/jnl/suggest):
//
//	q: required prefix
//	limit / min_sources / has_sources: optional shaping
//
// Lightweight fields: id / canonical_name / issn_l / source_count / openalex_works_count
func (c *Client) SuggestJournals(ctx context.Context, q string, limit int) (json.RawMessage, error) {
	body := map[string]any{"q": q}
	if limit > 0 {
		body["limit"] = limit
	}
	return c.doPost(ctx, "/v1/jnl/suggest", body)
}

// JournalsByNames batches journal lookups by canonical_name.
//
// Upstream contract (POST /v1/jnl/byNames):
//
//	names: required, comma-separated canonical names (e.g. "Nature,Cell")
//	full:  optional, "0" | "1" | "true"
//	fields: optional, comma-separated whitelist (mutually exclusive with full)
//
// 用于"一页搜索结果一次性补 Q 分区/IF"的场景，避免逐篇请求。
func (c *Client) JournalsByNames(ctx context.Context, names, fields string) (json.RawMessage, error) {
	body := map[string]any{"names": names}
	if fields != "" {
		body["fields"] = fields
	}
	return c.doPost(ctx, "/v1/jnl/byNames", body)
}

// JournalsByISSNs batches journal lookups by ISSN.
// Upstream caps at 100 ISSNs per call.
func (c *Client) JournalsByISSNs(ctx context.Context, issns, fields string) (json.RawMessage, error) {
	body := map[string]any{"issns": issns}
	if fields != "" {
		body["fields"] = fields
	}
	return c.doPost(ctx, "/v1/jnl/batch", body)
}

// DownloadSubmission 下载期刊投稿资源(kind = "guideline" | "latex"),流式返回。
//
// 上游 v2(api-1.json):POST /v1/jnl/submission/{kind},body {id};直接回文件流
// (guideline=text/markdown,latex=application/zip)。**按次计费 + 要求 API Key 账号是
// 最高价位套餐会员**,否则 403(不扣次);该刊无对应文件 404。
//
// 不走 c.up(那是 envelope JSON + breaker 语义,不适合二进制流)。**不在客户端判状态码**
// —— 原样把 *http.Response 交给 handler,由它区分 200/403/404 映射友好文案。调用方负责关闭 Body。
func (c *Client) DownloadSubmission(ctx context.Context, kind string, id int) (*http.Response, error) {
	body, err := json.Marshal(map[string]any{"id": id})
	if err != nil {
		return nil, err
	}
	u := strings.TrimRight(c.baseURL, "/") + "/v1/jnl/submission/" + kind
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	return getSharedHTTPClient().Do(req)
}
