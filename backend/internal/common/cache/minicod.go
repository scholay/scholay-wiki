// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"context"
	"time"
)

// ======================== Minicod Cache Prefixes ========================

const (
	minicodSearchPrefix       = "minicod:search"
	minicodPaperPrefix        = "minicod:paper"
	minicodPaperBatchPrefix   = "minicod:paperbatch"
	minicodCitationsPrefix    = "minicod:citations"
	minicodReferencesPrefix   = "minicod:references"
	minicodPaperAuthorsPrefix = "minicod:paperauthors"
	minicodAutocompletePrefix = "minicod:autocomplete"
	minicodAuthorSearchPrefix = "minicod:authorsearch"
	minicodAuthorPrefix       = "minicod:author"
	minicodAuthorPapersPrefix = "minicod:authorpapers"
	minicodRecForPaperPrefix  = "minicod:recforpaper"
	minicodRecPrefix          = "minicod:rec"
	minicodSuggestionsPrefix  = "minicod:suggestions"
	minicodPaperByDOIPrefix   = "minicod:paperdoi"
	minicodPaperMatchPrefix   = "minicod:papermatch"
)

// ======================== Minicod TTL Settings ========================
// Minicod 是付费接口，论文元数据变化极慢，可以较激进地缓存降低 API 调用成本。

const (
	MinicodSearchTTL         = 30 * time.Minute // 搜索结果：用户行为敏感，半小时
	MinicodPaperTTL          = 24 * time.Hour   // 论文详情：变化极慢，1 天
	MinicodPaperBatchTTL     = 24 * time.Hour
	MinicodCitationsTTL      = 1 * time.Hour // 引用列表：会增长但不频繁
	MinicodReferencesTTL     = 1 * time.Hour // 参考文献：论文发布后几乎不变
	MinicodPaperAuthorsTTL   = 24 * time.Hour
	MinicodAutocompleteTTL   = 1 * time.Hour // 前缀自动补全：query 热点集中，命中率高
	MinicodAuthorSearchTTL   = 1 * time.Hour
	MinicodAuthorTTL         = 24 * time.Hour
	MinicodAuthorPapersTTL   = 6 * time.Hour
	MinicodRecommendationTTL = 6 * time.Hour // 推荐：相对稳定但有一定更新
	MinicodSuggestionsTTL    = 1 * time.Hour
)

// ======================== Generic Helper ========================

// getOrSetMinicod 是所有 Minicod helper 的底层复用：构造 cache key → 调 GetOrSet
// (GetOrSet 内置 singleflight + TTL 抖动 + null 哨兵防穿透)
func getOrSetMinicod(
	ctx context.Context,
	prefix string,
	ttl time.Duration,
	params map[string]any,
	fetchFn func() (any, error),
	result any,
) error {
	key := GenerateCacheKey(prefix, params)
	return GetOrSet(ctx, key, ttl, fetchFn, result)
}

// ======================== Paper Endpoints ========================

// GetOrSetMinicodSearch 缓存论文搜索结果。
// params 应包含 query、filters、offset、limit、source 等所有影响结果的字段。
func GetOrSetMinicodSearch(ctx context.Context, params map[string]any, fetchFn func() (any, error), result any) error {
	return getOrSetMinicod(ctx, minicodSearchPrefix, MinicodSearchTTL, params, fetchFn, result)
}

// GetOrSetMinicodPaper 缓存单篇论文详情，按 paperID + fields 区分。
func GetOrSetMinicodPaper(ctx context.Context, paperID string, fields []string, fetchFn func() (any, error), result any) error {
	params := map[string]any{"paperId": paperID, "fields": fields}
	return getOrSetMinicod(ctx, minicodPaperPrefix, MinicodPaperTTL, params, fetchFn, result)
}

// GetOrSetMinicodPaperBatch 缓存批量论文详情。
func GetOrSetMinicodPaperBatch(ctx context.Context, paperIDs []string, fields []string, fetchFn func() (any, error), result any) error {
	params := map[string]any{"paperIds": paperIDs, "fields": fields}
	return getOrSetMinicod(ctx, minicodPaperBatchPrefix, MinicodPaperBatchTTL, params, fetchFn, result)
}

// GetOrSetMinicodPaperByDOI 缓存按 DOI 精确解析的单篇论文,按 source + doi 区分。
// DOI→论文是稳定映射,复用 24h 论文详情 TTL。
func GetOrSetMinicodPaperByDOI(ctx context.Context, source, doi string, fetchFn func() (any, error), result any) error {
	params := map[string]any{"source": source, "doi": doi}
	return getOrSetMinicod(ctx, minicodPaperByDOIPrefix, MinicodPaperTTL, params, fetchFn, result)
}

// GetOrSetMinicodPaperMatch 缓存按标题精确匹配的单篇论文,按 title 区分。
func GetOrSetMinicodPaperMatch(ctx context.Context, title string, fetchFn func() (any, error), result any) error {
	params := map[string]any{"title": title}
	return getOrSetMinicod(ctx, minicodPaperMatchPrefix, MinicodPaperTTL, params, fetchFn, result)
}

// GetOrSetMinicodCitations 缓存论文引用列表。
func GetOrSetMinicodCitations(ctx context.Context, paperID string, params map[string]any, fetchFn func() (any, error), result any) error {
	params["paperId"] = paperID
	return getOrSetMinicod(ctx, minicodCitationsPrefix, MinicodCitationsTTL, params, fetchFn, result)
}

// GetOrSetMinicodReferences 缓存论文参考文献列表。
func GetOrSetMinicodReferences(ctx context.Context, paperID string, params map[string]any, fetchFn func() (any, error), result any) error {
	params["paperId"] = paperID
	return getOrSetMinicod(ctx, minicodReferencesPrefix, MinicodReferencesTTL, params, fetchFn, result)
}

// GetOrSetMinicodPaperAuthors 缓存论文作者列表。
func GetOrSetMinicodPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int, fetchFn func() (any, error), result any) error {
	params := map[string]any{"paperId": paperID, "fields": fields, "offset": offset, "limit": limit}
	return getOrSetMinicod(ctx, minicodPaperAuthorsPrefix, MinicodPaperAuthorsTTL, params, fetchFn, result)
}

// GetOrSetMinicodAutocomplete 缓存论文前缀补全。query 前缀集中，命中率高。
func GetOrSetMinicodAutocomplete(ctx context.Context, query, source string, fetchFn func() (any, error), result any) error {
	params := map[string]any{"query": query, "source": source}
	return getOrSetMinicod(ctx, minicodAutocompletePrefix, MinicodAutocompleteTTL, params, fetchFn, result)
}

// ======================== Author Endpoints ========================

// GetOrSetMinicodAuthorSearch 缓存作者搜索结果。
func GetOrSetMinicodAuthorSearch(ctx context.Context, params map[string]any, fetchFn func() (any, error), result any) error {
	return getOrSetMinicod(ctx, minicodAuthorSearchPrefix, MinicodAuthorSearchTTL, params, fetchFn, result)
}

// GetOrSetMinicodAuthor 缓存单个作者详情。
func GetOrSetMinicodAuthor(ctx context.Context, authorID string, fields []string, fetchFn func() (any, error), result any) error {
	params := map[string]any{"authorId": authorID, "fields": fields}
	return getOrSetMinicod(ctx, minicodAuthorPrefix, MinicodAuthorTTL, params, fetchFn, result)
}

// GetOrSetMinicodAuthorPapers 缓存作者论文列表。
func GetOrSetMinicodAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int, fetchFn func() (any, error), result any) error {
	params := map[string]any{"authorId": authorID, "fields": fields, "offset": offset, "limit": limit}
	return getOrSetMinicod(ctx, minicodAuthorPapersPrefix, MinicodAuthorPapersTTL, params, fetchFn, result)
}

// ======================== Recommendation Endpoints ========================

// GetOrSetMinicodRecForPaper 缓存基于论文的推荐。
func GetOrSetMinicodRecForPaper(ctx context.Context, paperID string, params map[string]any, fetchFn func() (any, error), result any) error {
	params["paperId"] = paperID
	return getOrSetMinicod(ctx, minicodRecForPaperPrefix, MinicodRecommendationTTL, params, fetchFn, result)
}

// GetOrSetMinicodRec 缓存基于正/负样本列表的推荐。
func GetOrSetMinicodRec(ctx context.Context, params map[string]any, fetchFn func() (any, error), result any) error {
	return getOrSetMinicod(ctx, minicodRecPrefix, MinicodRecommendationTTL, params, fetchFn, result)
}

// ======================== Suggestions (combined) ========================

// GetOrSetMinicodSuggestions 缓存合并后的论文+作者搜索建议。
func GetOrSetMinicodSuggestions(ctx context.Context, query, source string, paperLimit, authorLimit int, fetchFn func() (any, error), result any) error {
	params := map[string]any{
		"query":       query,
		"source":      source,
		"paperLimit":  paperLimit,
		"authorLimit": authorLimit,
	}
	return getOrSetMinicod(ctx, minicodSuggestionsPrefix, MinicodSuggestionsTTL, params, fetchFn, result)
}
