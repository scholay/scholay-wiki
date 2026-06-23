// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/thirdparty"

	"github.com/sony/gobreaker"
)

const MaxRetries = 5

// retryBackoff 第 attempt 次重试前的等待:指数退避 + ±50% 抖动, 封顶 1s。
// 上游 429/5xx 时账号轮转若零间隔连发会放大冲击; 小退避削平重试风暴。注: 调用方取消
// (context.Canceled/DeadlineExceeded)在外层已先于本退避 return, 故已取消的请求不会在此 sleep。
func retryBackoff(attempt int) time.Duration {
	base := 100 * time.Millisecond
	d := base << uint(attempt) // 100ms, 200ms, 400ms, 800ms, ...
	const maxBackoff = 1000 * time.Millisecond
	if d > maxBackoff || d <= 0 {
		d = maxBackoff
	}
	return d/2 + time.Duration(rand.Int63n(int64(d)/2+1))
}

// Manager manages Minicod API clients with key rotation
type Manager struct {
	accountService *thirdparty.Service
}

// NewManager creates a new Minicod client manager.
//
// base URL **唯一**来源:third_party_accounts 当前账户的 MinicodConfig.BaseURL
// (管理后台配)。没配 base_url → getClientWithAccountID 直接报错, 不兜底任何域名。
func NewManager(accountService *thirdparty.Service) *Manager {
	return &Manager{
		accountService: accountService,
	}
}

// isRetryableError 判断 Minicod 调用是否值得切到下一个 thirdparty 账户重试。
//
// 走两条判断:
//  1. typed errors (走 common/upstream 后, HTTP 层错误都是 *upstream.Error):
//     - ErrAuth (401/403)        — 当前 key 失效, 换账户
//     - ErrRateLimit (429)       — 当前 key 配额耗尽, 换账户
//     - ErrCircuit               — 本地 breaker open, 等下次 GC 周期
//     - 其他 (5xx/network/timeout) → 也允许换账户重试 (上游 host 可能临时挂)
//  2. 字符串 fallback — 业务级 envelope.Code != 0 的字符串里如果含 "401/429/...",
//     兼容 Minicod 上游业务码 (40101/42901 等)。
func isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	// 优先 typed error
	switch {
	case errors.Is(err, upstream.ErrAuth),
		errors.Is(err, upstream.ErrRateLimit),
		errors.Is(err, upstream.ErrCircuit),
		errors.Is(err, upstream.ErrServer),
		errors.Is(err, upstream.ErrNetwork),
		errors.Is(err, upstream.ErrTimeout):
		return true
	}
	// 业务层错误码字符串嗅探 (envelope.Code != 0 的 Minicod 私有码)
	errStr := err.Error()
	return strings.Contains(errStr, "40101") ||
		strings.Contains(errStr, "42901") ||
		strings.Contains(errStr, "Too Many Requests") ||
		strings.Contains(errStr, "Unauthorized")
}

// executeWithRetry executes an operation with retry logic and key rotation
func (m *Manager) executeWithRetry(operation func(client *Client) (any, error)) (any, error) {
	var lastErr error
	usedAccountIDs := make(map[uint]bool)

	for attempt := 0; attempt <= MaxRetries; attempt++ {
		client, accountID, err := m.getClientWithAccountID()
		if err != nil {
			slog.Warn("minicod: failed to get client", "attempt", attempt+1, "err", err)
			lastErr = err
			continue
		}

		if attempt > 0 && usedAccountIDs[accountID] {
			slog.Debug("minicod: account already tried, skipping", "attempt", attempt+1, "accountID", accountID)
			continue
		}

		usedAccountIDs[accountID] = true

		if attempt > 0 {
			slog.Info("minicod: retry attempt", "attempt", attempt, "maxRetries", MaxRetries, "accountID", accountID)
		}

		start := time.Now()
		result, err := operation(client)
		latencyMs := time.Since(start).Milliseconds()
		// 记一次三方账号(minicod)用量 —— 后端直连的搜索/详情/期刊/作者等调用都过这里
		// (含重试; RecordAPIUsage 内部异步, 不阻塞)。注: agent 容器内的 minicod MCP
		// 用量后端看不到, 不计在此。熔断在外层 fetch (MinicodBreaker), 故此处都是真实请求。
		m.accountService.RecordAPIUsage(accountID, err == nil, latencyMs)
		if err == nil {
			return result, nil
		}

		lastErr = err

		// 调用方取消(用户关页 / 跳走 → 请求 ctx 被 cancel):既不该重试,也不是系统错误。
		// 不拦的话会被当成 "network error" 误判为可重试,白白重试一个已被取消的请求 + 刷日志。
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) ||
			strings.Contains(err.Error(), "context canceled") {
			slog.Debug("minicod: request canceled by caller", "attempt", attempt+1)
			return nil, err
		}

		if isRetryableError(err) {
			// DEBUG 而非 WARN: 这条与 upstream 层的 "upstream call failed" 一一对应,
			// 留 WARN 会让每次重试刷两条同义日志(429 风暴时尤其明显)。真正失败由本函数
			// 末尾 "all N retry attempts failed" 兜底,可重试中途态降到 DEBUG。
			slog.Debug("minicod: retryable error, switching account", "attempt", attempt+1, "accountID", accountID, "err", err)
			// 退避 + 抖动后再换账号重试, 避免零间隔背靠背放大上游故障。
			time.Sleep(retryBackoff(attempt))
			continue
		}

		slog.Error("minicod: non-retryable error", "attempt", attempt+1, "err", err)
		return nil, err
	}

	return nil, fmt.Errorf("minicod: all %d retry attempts failed, last error: %w", MaxRetries+1, lastErr)
}

// fetch 是所有上游调用的**唯一**编排入口:circuit breaker → 账户轮换重试 → typed
// 类型还原。以前每个 Manager 方法都手抄一遍这套 (MinicodBreaker.Execute +
// executeWithRetry + breaker-open 检查 + result.(T) 断言), 现在收敛到这一个泛型函数。
//
// call 只需描述"给定一个 client 怎么发这次请求", 不关心重试/熔断/账户。
func fetch[T any](m *Manager, call func(c *Client) (T, error)) (T, error) {
	return fetchVia[T](m, circuitbreaker.MinicodBreaker, call)
}

// fetchSrc 同 fetch,但用「按源隔离」的熔断器(stc/olx/pmd 各一把)。
// 这样某个源故障只熔断该源,搜索的自动换源才能落到下一个好源。
func fetchSrc[T any](m *Manager, source string, call func(c *Client) (T, error)) (T, error) {
	return fetchVia[T](m, circuitbreaker.MinicodBreakerFor(source), call)
}

func fetchVia[T any](m *Manager, breaker *gobreaker.CircuitBreaker, call func(c *Client) (T, error)) (T, error) {
	var zero T
	result, err := breaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return call(client)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return zero, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return zero, err
	}
	return result.(T), nil
}

// getClientWithAccountID gets a client with API key from account service
func (m *Manager) getClientWithAccountID() (*Client, uint, error) {
	apiKey, accountID, err := m.accountService.GetRandomAPIKey(thirdparty.AccountTypeMinicod)
	if err != nil {
		return nil, 0, fmt.Errorf("minicod: no API key available: %w", err)
	}

	slog.Debug("minicod: got API key", "keyLength", len(apiKey), "accountID", accountID)

	// baseURL 严格来自 third_party_accounts 的 minicod 配置, 不允许兜底域名。
	accounts, err := m.accountService.GetActiveAccountsByType(thirdparty.AccountTypeMinicod)
	if err != nil {
		return nil, 0, fmt.Errorf("minicod: load accounts: %w", err)
	}
	baseURL := ""
	for _, account := range accounts {
		if account.ID == accountID {
			if config, cerr := account.GetMinicodConfig(); cerr == nil {
				baseURL = strings.TrimSpace(config.BaseURL)
			}
			break
		}
	}
	if baseURL == "" {
		return nil, 0, fmt.Errorf("minicod: 账户 %d 未配置 base_url, 请在第三方账号里填写后再用", accountID)
	}
	return NewClientWithBaseURL(apiKey, baseURL), accountID, nil
}

// ======================== Paper Methods ========================

func (m *Manager) SearchPapers(ctx context.Context, opts PaperSearchOptions) (*SearchResponse, error) {
	params := map[string]any{
		"query":    opts.Query,
		"yearFrom": opts.YearFrom,
		"yearTo":   opts.YearTo,
		// date_* / sort 同样会进上游请求体 (见 client.go SearchPapers),
		// 必须进缓存键，否则只是日期范围或排序方式不同的检索会塌缩到同一 Redis key、
		// 返回错误的结果(并诱发更多付费上游调用)。
		"dateFrom":         opts.DateFrom,
		"dateTo":           opts.DateTo,
		"sort":             opts.Sort,
		"publicationTypes": opts.PublicationTypes,
		"openAccessPDF":    opts.OpenAccessPDF,
		"venue":            opts.Venue,
		"fieldsOfStudy":    opts.FieldsOfStudy,
		"fields":           opts.Fields,
		"offset":           opts.Offset,
		"limit":            opts.Limit,
		"minCitations":     opts.MinCitationCount,
		"source":           opts.Source,
	}
	var resp SearchResponse
	err := cache.GetOrSetMinicodSearch(ctx, params, func() (any, error) {
		// 按源隔离熔断:支撑搜索的自动换源(stc 挂了不连累 olx/pmd)
		return fetchSrc(m, opts.Source, func(c *Client) (*SearchResponse, error) { return c.SearchPapers(ctx, opts) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) GetPaper(ctx context.Context, paperID string, opts PaperDetailsOptions) (*Paper, error) {
	var resp Paper
	err := cache.GetOrSetMinicodPaper(ctx, paperID, opts.Fields, func() (any, error) {
		return fetch(m, func(c *Client) (*Paper, error) { return c.GetPaper(ctx, paperID, opts) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) GetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]Paper, error) {
	var resp []Paper
	err := cache.GetOrSetMinicodPaperBatch(ctx, paperIDs, fields, func() (any, error) {
		return fetch(m, func(c *Client) ([]Paper, error) { return c.GetPaperBatch(ctx, paperIDs, fields) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (m *Manager) GetPaperCitations(ctx context.Context, paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	params := map[string]any{"fields": opts.Fields, "offset": opts.Offset, "limit": opts.Limit}
	var resp CitationsResponse
	err := cache.GetOrSetMinicodCitations(ctx, paperID, params, func() (any, error) {
		return fetch(m, func(c *Client) (*CitationsResponse, error) { return c.GetPaperCitations(ctx, paperID, opts) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) GetPaperReferences(ctx context.Context, paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	params := map[string]any{"fields": opts.Fields, "offset": opts.Offset, "limit": opts.Limit}
	var resp ReferencesResponse
	err := cache.GetOrSetMinicodReferences(ctx, paperID, params, func() (any, error) {
		return fetch(m, func(c *Client) (*ReferencesResponse, error) { return c.GetPaperReferences(ctx, paperID, opts) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) GetPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	var resp AuthorSearchResponse
	err := cache.GetOrSetMinicodPaperAuthors(ctx, paperID, fields, offset, limit, func() (any, error) {
		return fetch(m, func(c *Client) (*AuthorSearchResponse, error) {
			return c.GetPaperAuthors(ctx, paperID, fields, offset, limit)
		})
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) PaperAutocomplete(ctx context.Context, query, source string) (*AutocompleteResponse, error) {
	var resp AutocompleteResponse
	err := cache.GetOrSetMinicodAutocomplete(ctx, query, source, func() (any, error) {
		return fetch(m, func(c *Client) (*AutocompleteResponse, error) { return c.PaperAutocomplete(ctx, query, source) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// ======================== Author Methods ========================

func (m *Manager) SearchAuthors(ctx context.Context, opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	params := map[string]any{
		"query":  opts.Query,
		"fields": opts.Fields,
		"offset": opts.Offset,
		"limit":  opts.Limit,
		"source": opts.Source,
	}
	var resp AuthorSearchResponse
	err := cache.GetOrSetMinicodAuthorSearch(ctx, params, func() (any, error) {
		return fetch(m, func(c *Client) (*AuthorSearchResponse, error) { return c.SearchAuthors(ctx, opts) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) GetAuthor(ctx context.Context, authorID string, fields []string) (*Author, error) {
	var resp Author
	err := cache.GetOrSetMinicodAuthor(ctx, authorID, fields, func() (any, error) {
		return fetch(m, func(c *Client) (*Author, error) { return c.GetAuthor(ctx, authorID, fields) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) GetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	var resp SearchResponse
	err := cache.GetOrSetMinicodAuthorPapers(ctx, authorID, fields, offset, limit, func() (any, error) {
		return fetch(m, func(c *Client) (*SearchResponse, error) {
			return c.GetAuthorPapers(ctx, authorID, fields, offset, limit)
		})
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// ======================== Recommendation Methods ========================

func (m *Manager) GetRecommendationsForPaper(ctx context.Context, paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	params := map[string]any{"fields": opts.Fields, "limit": opts.Limit}
	var resp RecommendationsResponse
	err := cache.GetOrSetMinicodRecForPaper(ctx, paperID, params, func() (any, error) {
		return fetch(m, func(c *Client) (*RecommendationsResponse, error) {
			return c.GetRecommendationsForPaper(ctx, paperID, opts)
		})
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) GetRecommendations(ctx context.Context, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	params := map[string]any{
		"fields":      opts.Fields,
		"limit":       opts.Limit,
		"positiveIds": opts.PositivePaperIDs,
		"negativeIds": opts.NegativePaperIDs,
	}
	var resp RecommendationsResponse
	err := cache.GetOrSetMinicodRec(ctx, params, func() (any, error) {
		return fetch(m, func(c *Client) (*RecommendationsResponse, error) { return c.GetRecommendations(ctx, opts) })
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// ======================== Search Suggestions ========================

// GetSearchSuggestions returns combined paper and author suggestions
func (m *Manager) GetSearchSuggestions(ctx context.Context, query, source string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	// 上游 autocomplete 要求 query >= 3 字符;< 3 直接回空,不打上游 —— 否则每次都拿一个
	// 400 "'query' must be >= 3 characters" 还被记成 ERROR(纯用户输入,非系统故障)。
	if len([]rune(strings.TrimSpace(query))) < 3 {
		return &SearchSuggestionsResponse{Papers: []AutocompleteMatch{}, Authors: []Author{}}, nil
	}
	if paperLimit <= 0 {
		paperLimit = 5
	}
	if authorLimit <= 0 {
		authorLimit = 5
	}

	var resp SearchSuggestionsResponse
	err := cache.GetOrSetMinicodSuggestions(ctx, query, source, paperLimit, authorLimit, func() (any, error) {
		return m.fetchSearchSuggestions(ctx, query, source, paperLimit, authorLimit)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchSearchSuggestions(ctx context.Context, query, source string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
	// 多源 fan-out 模式:source 为空时,papers 并行拉 STC/OLX/PMD,authors 并行拉 STC/OLX。
	// 任一源失败不影响其他源,失败仅写日志。
	if source == "" {
		return m.fetchMultiSourceSuggestions(ctx, query, paperLimit, authorLimit), nil
	}
	return m.fetchSingleSourceSuggestions(ctx, query, source, paperLimit, authorLimit)
}

// fetchSingleSourceSuggestions —— 指定 source 时只查该源。
// 与多源模式共用 suggestPapersForSource / suggestAuthorsForSource,因此 PMD(无
// autocomplete / authors/search 接口)在这里也会被安全跳过,不再打出 404。
func (m *Manager) fetchSingleSourceSuggestions(ctx context.Context, query, source string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
	type paperResult struct{ items []AutocompleteMatch }
	type authorResult struct{ items []Author }

	paperChan := make(chan paperResult, 1)
	authorChan := make(chan authorResult, 1)

	safego.Go("minicod-paper-autocomplete", func() {
		paperChan <- paperResult{items: m.suggestPapersForSource(ctx, query, source, paperLimit)}
	})
	safego.Go("minicod-author-search", func() {
		authorChan <- authorResult{items: m.suggestAuthorsForSource(ctx, query, source, authorLimit)}
	})

	papers := (<-paperChan).items
	authors := (<-authorChan).items
	if papers == nil {
		papers = []AutocompleteMatch{}
	}
	if authors == nil {
		authors = []Author{}
	}
	return &SearchSuggestionsResponse{Papers: papers, Authors: authors}, nil
}

// fetchMultiSourceSuggestions —— 多源并行 fan-out。
//
// papers: STC + OLX + PMD 同时拉(PMD 上游无 autocomplete,降级到 /papers/search)
// authors: STC + OLX(PMD 上游无 authors 接口,跳过)
//
// 单源失败仅 warn,不阻塞整个响应。每个 item 的 Source 字段会被设置为来源,
// 前端展示成 minicod-x / minicod-o / minicod-p 标识。
//
// 结果按 PaperSources / AuthorSources 顺序穿插(STC 优先),再截断到 limit。
func (m *Manager) fetchMultiSourceSuggestions(ctx context.Context, query string, paperLimit, authorLimit int) *SearchSuggestionsResponse {
	perSourcePaper := perSource(paperLimit, len(PaperSources))
	perSourceAuthor := perSource(authorLimit, len(AuthorSources))

	type paperBucket struct {
		source string
		items  []AutocompleteMatch
	}
	type authorBucket struct {
		source string
		items  []Author
	}
	paperCh := make(chan paperBucket, len(PaperSources))
	authorCh := make(chan authorBucket, len(AuthorSources))

	for _, src := range PaperSources {
		src := src
		safego.Go("minicod-paper-suggest-"+src, func() {
			paperCh <- paperBucket{source: src, items: m.suggestPapersForSource(ctx, query, src, perSourcePaper)}
		})
	}
	for _, src := range AuthorSources {
		src := src
		safego.Go("minicod-author-suggest-"+src, func() {
			authorCh <- authorBucket{source: src, items: m.suggestAuthorsForSource(ctx, query, src, perSourceAuthor)}
		})
	}

	paperBySource := make(map[string][]AutocompleteMatch, len(PaperSources))
	for i := 0; i < len(PaperSources); i++ {
		b := <-paperCh
		paperBySource[b.source] = b.items
	}
	authorBySource := make(map[string][]Author, len(AuthorSources))
	for i := 0; i < len(AuthorSources); i++ {
		b := <-authorCh
		authorBySource[b.source] = b.items
	}

	papers := make([]AutocompleteMatch, 0, paperLimit)
	for _, src := range PaperSources {
		papers = append(papers, paperBySource[src]...)
	}
	if len(papers) > paperLimit {
		papers = papers[:paperLimit]
	}
	authors := make([]Author, 0, authorLimit)
	for _, src := range AuthorSources {
		authors = append(authors, authorBySource[src]...)
	}
	if len(authors) > authorLimit {
		authors = authors[:authorLimit]
	}

	return &SearchSuggestionsResponse{Papers: papers, Authors: authors}
}

// suggestPapersForSource —— 单源拉论文建议(STC/OLX 走 /papers(works)/autocomplete)。
// PMD 上游无 papers/autocomplete,补全不支持该源 —— 直接跳过,避免打出 /v1/pmd/papers/autocomplete 404。
func (m *Manager) suggestPapersForSource(ctx context.Context, query, source string, limit int) []AutocompleteMatch {
	if source == SourcePMD {
		return nil
	}

	resp, err := m.PaperAutocomplete(ctx, query, source)
	if err != nil {
		slog.Warn("minicod: paper autocomplete failed", "source", source, "err", err)
		return nil
	}
	count := len(resp.Matches)
	if count > limit {
		count = limit
	}
	out := make([]AutocompleteMatch, count)
	for i := 0; i < count; i++ {
		out[i] = resp.Matches[i]
		out[i].Source = source
	}
	return out
}

// suggestAuthorsForSource —— 单源拉作者建议(STC/OLX 用 /authors/search)。
// PMD 上游无 authors/search,作者补全不支持该源 —— 直接跳过,避免打出 /v1/pmd/authors/search 404。
func (m *Manager) suggestAuthorsForSource(ctx context.Context, query, source string, limit int) []Author {
	if source == SourcePMD {
		return nil
	}
	resp, err := m.SearchAuthors(ctx, AuthorSearchOptions{
		Query:  query,
		Limit:  limit,
		Source: source,
	})
	if err != nil {
		slog.Warn("minicod: author search failed", "source", source, "err", err)
		return nil
	}
	count := len(resp.Data)
	if count > limit {
		count = limit
	}
	out := make([]Author, count)
	for i := 0; i < count; i++ {
		out[i] = resp.Data[i]
		out[i].Source = source
	}
	return out
}

// perSource —— 把总额度均匀分给 n 个源,向上取整(保证每源至少 1 条)。
func perSource(total, n int) int {
	if total <= 0 || n <= 0 {
		return 1
	}
	v := (total + n - 1) / n
	if v < 1 {
		return 1
	}
	return v
}

// ======================== JNL Journal Methods ========================

// 期刊端点都是裸 json.RawMessage passthrough, 一律走泛型 fetch。
func (m *Manager) SearchJournals(ctx context.Context, opts JournalSearchOptions) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.SearchJournals(ctx, opts) })
}

func (m *Manager) ListJournals(ctx context.Context, opts JournalListOptions) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.ListJournals(ctx, opts) })
}

func (m *Manager) GetJournal(ctx context.Context, id int, full string) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.GetJournal(ctx, id, full) })
}

func (m *Manager) SuggestJournals(ctx context.Context, q string, limit int) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.SuggestJournals(ctx, q, limit) })
}

func (m *Manager) JournalsByNames(ctx context.Context, names, fields string) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.JournalsByNames(ctx, names, fields) })
}

func (m *Manager) JournalsByISSNs(ctx context.Context, issns, fields string) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.JournalsByISSNs(ctx, issns, fields) })
}

func (m *Manager) GetJournalFilters(ctx context.Context) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.GetJournalFilters(ctx) })
}

func (m *Manager) GetJournalStats(ctx context.Context) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.GetJournalStats(ctx) })
}

func (m *Manager) GetJournalByISSN(ctx context.Context, issn string, full string) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.GetJournalByISSN(ctx, issn, full) })
}

func (m *Manager) CompareJournals(ctx context.Context, ids string) (json.RawMessage, error) {
	return fetch(m, func(c *Client) (json.RawMessage, error) { return c.CompareJournals(ctx, ids) })
}

// DownloadJournalSubmission 取一个账户(含 key + baseURL)流式代理下载投稿资源。
// kind = "guideline" | "latex"。不走 fetch/breaker(envelope JSON 语义);下载是稀有动作
// + 二进制流,单账户直拉即可。原样返回 *http.Response(含非 200),由 handler 判状态码 + 关 Body。
func (m *Manager) DownloadJournalSubmission(ctx context.Context, kind string, id int) (*http.Response, error) {
	client, _, err := m.getClientWithAccountID()
	if err != nil {
		return nil, err
	}
	return client.DownloadSubmission(ctx, kind, id)
}
