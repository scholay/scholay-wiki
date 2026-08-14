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

// canonicalPaperSource 与 sourcePrefix 的默认 STC 语义保持一致，但显式返回
// 真实路由源，避免把请求中任意 source 原样写回 SEO/canonical。
func canonicalPaperSource(source string) string {
	switch source {
	case SourceOLX:
		return source
	case SourcePMD, "pubmed":
		return SourcePMD
	default:
		return SourceSTC
	}
}

func canonicalAuthorSource(source string) string {
	if source == SourceOLX {
		return SourceOLX
	}
	return SourceSTC
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
	// 双信封兼容(对齐审计 #16):api-1.json 把 stc/olx/pmd/uni/today 记为 {success,error,meta} 信封
	// (与本客户端假设的 {code,message,data} 不同)。成功态两者都带 data、上面已覆盖;唯一缺口是**错误态**
	// 以 {success:false, error:{code,message}} 返回时:top-level code 恒 0、无 data key → 会被当成「空结果」
	// 静默吞掉。仅在「code==0 且响应无 data key」这一本就会静默的分支探测该信封,命中转成可见 APIStatusError;
	// 未命中(success!=false 且无 error)维持原「空结果」语义 —— 对成功路径(data 非空)零影响。
	if len(apiResp.Data) == 0 {
		var alt struct {
			Success *bool `json:"success"`
			Error   *struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(resp.Body, &alt) == nil && ((alt.Success != nil && !*alt.Success) || alt.Error != nil) {
			code, msg := 0, "minicod upstream error"
			if alt.Error != nil {
				code, msg = alt.Error.Code, alt.Error.Message
			}
			return nil, &APIStatusError{Code: code, Message: msg}
		}
	}
	return apiResp.Data, nil
}

// IsNotFoundError 导出版 isNotFoundErr,供上层(seoenrich on-miss)把「上游明确说
// 不存在」与「上游故障」区分开:前者应折叠为 404(死链可被搜索引擎清除),
// 后者才是 503。刻意不用 IsClientSideError —— 那个还包含 401/403(我方 key 失效),
// key 失效时把有效论文页 404 掉是更糟的事故。
func IsNotFoundError(err error) bool { return isNotFoundErr(err) }

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
	actualSource := canonicalPaperSource(opts.Source)
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
	// 2026-07 线上审计:fields 一律过白名单再透传(剔除 tldr 等已废/未知字段,防上游 400)。
	if fs := filterPaperFields(opts.Fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
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
	data, err := c.doPost(ctx, paperPath(actualSource, "search"), body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper search result: %w", err)
	}

	// Convert to frontend-compatible format. 已选中的上游端点是 source 真源；
	// 即使某源响应漏了 raw.source，也必须返回可路由的归一 ID。
	papers := ConvertPapers(raw.Items)
	normalizePapersForSource(papers, actualSource)
	result := &SearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   papers,
		// W6 P1-5:上游实际查询的库 + 本次命中的 minicod 源(此前 raw.SourcesQueried 解析后丢弃)。
		SourcesQueried: raw.SourcesQueried,
		ActualSource:   actualSource,
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaper retrieves paper details
func (c *Client) GetPaper(ctx context.Context, paperID string, opts PaperDetailsOptions) (*Paper, error) {
	source, upstreamID := paperSourceAndUpstreamID(paperID)
	body := map[string]any{
		"id": upstreamID,
	}
	// 2026-07 线上审计:fields 过白名单再透传(见 fields.go)。
	if fs := filterPaperFields(opts.Fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
	}

	path := paperPath(source, "get")
	if source == SourceOLX {
		// 对齐 api-1.json:olx works get 走共享 PaperGetRequest，字段过滤参数是 `fields`(不是历史的
		// `select`)。旧代码把 fields 换成 select 会被上游忽略(裁剪失效)甚至 400。保留上面已设的 fields 即可。
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 || string(data) == "null" {
		return nil, nil
	}

	var raw RawPaper
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper detail: %w", err)
	}
	if strings.TrimSpace(raw.ID) == "" && strings.TrimSpace(raw.Title) == "" {
		return nil, nil
	}

	paper := ConvertPaper(raw)
	// 请求端点已由 entity ID 选定，它比可能缺失的 raw.source 更权威。
	paper.Source = source
	if strings.TrimSpace(paper.PaperID) == "" {
		paper.PaperID = upstreamID
	}
	paper.PaperID = normalizeID(paper.PaperID, source)
	for i := range paper.Authors {
		paper.Authors[i].Source = source
		paper.Authors[i].AuthorID = normalizeID(paper.Authors[i].AuthorID, source)
	}
	return &paper, nil
}

// paperSourceAndUpstreamID 是详情深链与上游端点的唯一路由真源。
// 入库/URL 中非 STC ID 被归一为 `olx:` / `pmd:`，但上游 body 只接受裸 ID。
// PMD search 的历史契约会返回 `pubmed:`，这里将它作为 `pmd:` 的输入别名。
func paperSourceAndUpstreamID(paperID string) (string, string) {
	switch {
	case strings.HasPrefix(paperID, SourceOLX+":"):
		return SourceOLX, strings.TrimPrefix(paperID, SourceOLX+":")
	case strings.HasPrefix(paperID, SourcePMD+":"):
		return SourcePMD, strings.TrimPrefix(paperID, SourcePMD+":")
	case strings.HasPrefix(paperID, "pubmed:"):
		return SourcePMD, strings.TrimPrefix(paperID, "pubmed:")
	case strings.HasPrefix(paperID, SourceSTC+":"):
		return SourceSTC, strings.TrimPrefix(paperID, SourceSTC+":")
	default:
		return SourceSTC, paperID
	}
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
	source = canonicalPaperSource(source)
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
	raw.Source = canonicalPaperSource(source)
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
// 注:三源 batch 均走各自的 PaperBatchRequest,字段过滤统一为 `fields`(olx works 的历史 `select`
// 命名已随 api-1.json 收敛掉;仅 /v1/olx/works/related 这类新端点仍用 select,本客户端未用到)。
func (c *Client) GetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]Paper, error) {
	if len(paperIDs) == 0 {
		return nil, nil
	}
	// 2026-07 线上审计:fields 过白名单再透传(下面 stc/olx/pmd 三桶共用,见 fields.go)。
	fields = filterPaperFields(fields)

	var stcIDs, olxIDs, pmdIDs []string
	for _, id := range paperIDs {
		source, upstreamID := paperSourceAndUpstreamID(id)
		switch source {
		case SourceOLX:
			olxIDs = append(olxIDs, upstreamID)
		case SourcePMD:
			pmdIDs = append(pmdIDs, upstreamID)
		default:
			stcIDs = append(stcIDs, upstreamID)
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
		papers := ConvertPapers(raws)
		normalizePapersForSource(papers, SourceSTC)
		out = append(out, papers...)
	}

	if len(olxIDs) > 0 {
		body := map[string]any{"ids": olxIDs}
		if len(fields) > 0 {
			// 对齐 api-1.json:olx works batch 走共享 PaperBatchRequest,字段过滤是 `fields`(非历史 `select`)。
			body["fields"] = strings.Join(fields, ",")
		}
		data, err := c.doPost(ctx, "/v1/olx/works/batch", body)
		if err != nil {
			return nil, err
		}
		var raws []RawPaper
		if err := json.Unmarshal(data, &raws); err != nil {
			return nil, fmt.Errorf("failed to parse olx batch papers: %w", err)
		}
		papers := ConvertPapers(raws)
		normalizePapersForSource(papers, SourceOLX)
		out = append(out, papers...)
	}

	if len(pmdIDs) > 0 {
		// PMD batch 只返 esummary 元数据，为了拿到 abstract 按单篇 PMD get fan-out。
		// 路由必须仍是 /v1/pmd/papers/get，不能把 PMID 误发到 STC。
		// sem 限并发避免上游打爆;单篇失败静默丢弃,不阻塞整批。
		const pmdConcurrency = 8
		results := make([]Paper, len(pmdIDs))

		eg, egCtx := errgroup.WithContext(ctx)
		eg.SetLimit(pmdConcurrency)

		for i, id := range pmdIDs {
			i, id := i, id
			fullID := SourcePMD + ":" + id
			eg.Go(func() error {
				paper, err := c.GetPaper(egCtx, fullID, PaperDetailsOptions{Fields: fields})
				if err != nil {
					return fmt.Errorf("get PMD paper %s: %w", id, err)
				}
				if paper == nil || strings.TrimSpace(paper.Title) == "" {
					return fmt.Errorf("get PMD paper %s: incomplete response", id)
				}
				results[i] = *paper
				return nil
			})
		}
		if err := eg.Wait(); err != nil {
			// Manager 会缓存 nil error 的 batch 24 小时，因此不能把部分/全部
			// 上游失败伪装成成功空集，否则会长时污染搜索摘要与 SEO。
			return nil, err
		}
		out = append(out, results...)
	}

	return out, nil
}

// GetPaperCitations retrieves papers that cite the given paper
func (c *Client) GetPaperCitations(ctx context.Context, paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	source, upstreamID := paperSourceAndUpstreamID(paperID)
	body := map[string]any{
		"paper_id": upstreamID,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	// 2026-07 线上审计:fields 过白名单再透传(见 fields.go)。
	if fs := filterPaperFields(opts.Fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
	}

	path := paperPath(source, "citations")

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse citations: %w", err)
	}

	citations := ConvertPapersToCitations(raw.Items)
	normalizeCitationsForSource(citations, source)
	result := &CitationsResponse{
		Offset: raw.Offset,
		Data:   citations,
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaperReferences retrieves papers referenced by the given paper
func (c *Client) GetPaperReferences(ctx context.Context, paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	source, upstreamID := paperSourceAndUpstreamID(paperID)
	body := map[string]any{
		"paper_id": upstreamID,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	// 2026-07 线上审计:线上旧构建前端仍传已废 `tldr`,references 恒 400 —— fields 过白名单再透传。
	if fs := filterPaperFields(opts.Fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
	}

	path := paperPath(source, "references")

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse references: %w", err)
	}

	references := ConvertPapersToCitations(raw.Items)
	normalizeCitationsForSource(references, source)
	result := &ReferencesResponse{
		Offset: raw.Offset,
		Data:   references,
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaperAuthors retrieves authors of a specific paper
func (c *Client) GetPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	source, upstreamID := paperSourceAndUpstreamID(paperID)
	body := map[string]any{
		"paper_id": upstreamID,
	}
	if limit > 0 {
		body["limit"] = limit
	}
	if offset > 0 {
		body["offset"] = offset
	}
	// 2026-07 线上审计:作者字段词表过白名单再透传(见 fields.go)。
	if fs := filterAuthorFields(fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
	}

	path := paperPath(source, "authors")

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawAuthorSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper authors: %w", err)
	}

	authors := ConvertAuthors(raw.Items)
	normalizeAuthorsForSource(authors, source)
	return &AuthorSearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   authors,
	}, nil
}

func normalizeCitationsForSource(citations []Citation, source string) {
	for i := range citations {
		citations[i].Source = source
		citations[i].PaperId = normalizeID(citations[i].PaperId, source)
		for j := range citations[i].Authors {
			citations[i].Authors[j].Source = source
			citations[i].Authors[j].AuthorID = normalizeID(citations[i].Authors[j].AuthorID, source)
		}
	}
}

func normalizePapersForSource(papers []Paper, source string) {
	source = canonicalPaperSource(source)
	for i := range papers {
		papers[i].Source = source
		papers[i].PaperID = normalizeID(papers[i].PaperID, source)
		normalizeAuthorsForSource(papers[i].Authors, source)
	}
}

func normalizeAuthorsForSource(authors []Author, source string) {
	source = canonicalPaperSource(source)
	for i := range authors {
		authors[i].Source = source
		authors[i].AuthorID = normalizeID(authors[i].AuthorID, source)
	}
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
	actualSource := canonicalAuthorSource(opts.Source)
	body := map[string]any{
		"query": opts.Query,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	// 2026-07 线上审计:作者字段词表过白名单再透传(见 fields.go)。
	if fs := filterAuthorFields(opts.Fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
	}

	prefix := sourcePrefix(actualSource)
	data, err := c.doPost(ctx, prefix+"/authors/search", body)
	if err != nil {
		return nil, err
	}

	var raw RawAuthorSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse author search: %w", err)
	}

	authors := ConvertAuthors(raw.Items)
	normalizeAuthorsForSource(authors, actualSource)
	return &AuthorSearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   authors,
	}, nil
}

// GetAuthor retrieves author details
func (c *Client) GetAuthor(ctx context.Context, authorID string, fields []string) (*Author, error) {
	source, upstreamID := authorSourceAndUpstreamID(authorID)
	body := map[string]any{
		"id": upstreamID,
	}
	// 2026-07 线上审计:作者字段词表过白名单再透传(见 fields.go)。
	if fs := filterAuthorFields(fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
	}

	path := sourcePrefix(source) + "/authors/get"
	if source == SourceOLX {
		// olx(OpenAlex 源)用 `select` 选字段,且字段名词表与 STC 不同
		// (STC 的 paperCount/hIndex vs OpenAlex 的 works_count/summary_stats)。
		// 旧代码把 STC 字段名原样塞进 select → OpenAlex 报 400。这里直接不发 select,
		// 取上游默认字段;响应由 minicod 归一成 RawAuthor(snake_case),解析不受影响。
		delete(body, "fields")
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
	author.Source = source
	if strings.TrimSpace(author.AuthorID) == "" {
		author.AuthorID = upstreamID
	}
	author.AuthorID = normalizeID(author.AuthorID, source)
	return &author, nil
}

func authorSourceAndUpstreamID(authorID string) (string, string) {
	if strings.HasPrefix(authorID, SourceOLX+":") {
		return SourceOLX, strings.TrimPrefix(authorID, SourceOLX+":")
	}
	if strings.HasPrefix(authorID, SourceSTC+":") {
		return SourceSTC, strings.TrimPrefix(authorID, SourceSTC+":")
	}
	return SourceSTC, authorID
}

// GetAuthorPapers retrieves papers by a specific author
func (c *Client) GetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	source, upstreamID := authorSourceAndUpstreamID(authorID)
	body := map[string]any{
		"author_id": upstreamID,
	}
	if limit > 0 {
		body["limit"] = limit
	}
	if offset > 0 {
		body["offset"] = offset
	}
	// 2026-07 线上审计:线上旧构建前端仍传已废 `tldr`,authors/papers 恒 400 —— fields 过白名单再透传。
	//
	// 🔴 2026-08-03 追加:过滤后为空**不能**留空(旧行为是不发 fields、取上游默认)。
	// 该端点的上游默认字段集含 `tldr`,而上游自己的校验器拒绝 `tldr` → 不发 fields 必 400。
	// 前端从不传 fields,所以这条路径自上线起对**所有 stc 学者 100% 失败**。
	// 详见 fields.go 的 authorPapersDefaultFields 红字。
	fs := filterPaperFields(fields)
	if len(fs) == 0 {
		fs = authorPapersDefaultFields
	}
	body["fields"] = strings.Join(fs, ",")

	path := sourcePrefix(source) + "/authors/papers"
	if source == SourceOLX {
		// 同 GetAuthor:olx 源字段名词表与 STC 不同,不转发 STC 字段名(否则 400),取上游默认。
		// olx 的上游默认是好的(实测 200),故这里维持"不发 fields"。
		delete(body, "fields")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse author papers: %w", err)
	}

	papers := ConvertPapers(raw.Items)
	normalizePapersForSource(papers, source)
	result := &SearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   papers,
		// W6 P1-5:同 SearchPapers 透传上游实际查询库(作者论文按 ID 前缀路由,无 opts.Source)。
		SourcesQueried: raw.SourcesQueried,
		ActualSource:   source,
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
	// 2026-07 线上审计:fields 过白名单再透传(见 fields.go)。
	if fs := filterPaperFields(opts.Fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
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
	// 2026-07 线上审计:fields 过白名单再透传(见 fields.go)。
	if fs := filterPaperFields(opts.Fields); len(fs) > 0 {
		body["fields"] = strings.Join(fs, ",")
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

// GetJournalMeta 拉上游期刊库构建元信息(2026-08-11 实测):
//
//	{"totalJournals":327327,"lastBuiltAt":"2026-07-04T17:30:40.000Z","sources":[...]}
//
// lastBuiltAt 变化 = 上游重建了期刊库 → seoingest 每日检查据此触发全量 resync
// (上游无 updated_since 语义,只能整库重摄;哈希比对保证未变行零写入)。
func (c *Client) GetJournalMeta(ctx context.Context) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/meta", map[string]any{})
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
