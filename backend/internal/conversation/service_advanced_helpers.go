// ============================================================================
// Scholay学术 V1.0
// 高级搜索辅助：并行搜索、MCP工具调用、合并去重
// ============================================================================

package conversation

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/semanticscholar"
)

// ParallelSearchResult 并行搜索结果
type ParallelSearchResult struct {
	Papers     []map[string]any
	TotalCount int
	BulkCount  int // bulk通道获取的论文数
	RelCount   int // relevance通道获取的论文数
}

// getParallelSearchSystemPrompt 生成并行搜索系统提示词（动态计算年份）
func getParallelSearchSystemPrompt() string {
	currentYear := time.Now().Year()
	yearFrom := currentYear - 5

	return fmt.Sprintf(`你是一名专业学术研究助手。你需要同时调用两个搜索工具来获取全面的论文结果：

1. search_papers_advanced: 用于获取高引用的经典论文（使用 bulk API，按引用数排序）
   - keywords: 英文学术关键词列表（3-5个关键词，每个关键词应该是独立的学术术语）
   - year_from: "%d"（最近5年起始）
   - year_to: "%d"（当前年份）
   - min_citations: 5（使用较低阈值以获取更多论文）
   - sort_by: "citationCount:desc"
   - fields_of_study: 若用户明确指定领域则填写

2. search_papers_relevance: 用于获取语义相关的最新论文（使用 search API，按相关性排序）
   - query: 英文关键词组合（用空格分隔，如 "hallucination mitigation large language models"，不要用完整句子）
   - year_from: "%d"（最近5年起始）
   - year_to: "%d"（当前年份）
   - fields_of_study: 若用户明确指定领域则填写

关键词生成规则：
- 无论用户使用什么语言，关键词必须是标准英文学术术语
- 关键词应该覆盖：核心概念、研究方法、应用领域
- 避免使用过于宽泛的词（如 "AI", "machine learning"）或过于具体的完整句子
- search_papers_relevance 的 query 应该是 3-6 个关键词的组合，不是完整句子

你必须同时调用这两个工具，不能只调用其中一个。
你的输出必须只包含工具调用，不能有任何解释或文字回答。`, yearFrom, currentYear, yearFrom, currentYear)
}

// escapeJSONString escapes special characters in a string for JSON
func escapeJSONString(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	s = strings.ReplaceAll(s, "\t", `\t`)
	return s
}

// executeMCPToolCall executes a single MCP tool call and returns papers
func (s *Service) executeMCPToolCall(ctx context.Context, mcpServer *mcp.MCPServer, toolRequest mcp.ToolRequest) ([]map[string]any, int, error) {
	result, err := mcpServer.CallTool(ctx, toolRequest)
	if err != nil {
		return nil, 0, err
	}

	if len(result.Content) == 0 {
		return []map[string]any{}, 0, nil
	}

	var searchResponse semanticscholar.SearchResponse
	if err := json.Unmarshal([]byte(result.Content[0]["text"].(string)), &searchResponse); err != nil {
		return nil, 0, fmt.Errorf("failed to parse search results: %w", err)
	}

	papers := make([]map[string]any, 0, len(searchResponse.Data))
	for _, paper := range searchResponse.Data {
		paperMap := map[string]any{
			"paperId":         paper.PaperID,
			"title":           paper.Title,
			"abstract":        paper.Abstract,
			"year":            paper.Year,
			"citationCount":   paper.CitationCount,
			"url":             paper.URL,
			"venue":           paper.Venue,
			"publicationDate": paper.PublicationDate,
		}

		authors := make([]map[string]any, 0, len(paper.Authors))
		for _, author := range paper.Authors {
			authors = append(authors, map[string]any{
				"authorId": author.AuthorID,
				"name":     author.Name,
			})
		}
		paperMap["authors"] = authors

		if paper.TLDR != nil {
			paperMap["tldr"] = map[string]any{
				"model": paper.TLDR.Model,
				"text":  paper.TLDR.Text,
			}
		}

		if paper.ExternalIDs != nil {
			paperMap["externalIds"] = paper.ExternalIDs
		}

		if paper.FieldsOfStudy != nil {
			paperMap["fieldsOfStudy"] = paper.FieldsOfStudy
		}

		papers = append(papers, paperMap)
	}

	return papers, searchResponse.Total, nil
}

// mcpSearch performs search using MCP server
func (s *Service) mcpSearch(ctx context.Context, query string, mcpServer *mcp.MCPServer) ([]map[string]any, int, error) {
	toolRequest := mcp.ToolRequest{
		Name: "search_papers",
		Arguments: map[string]any{
			"query":  query,
			"limit":  20,
			"offset": 0,
		},
	}

	return s.executeMCPToolCall(ctx, mcpServer, toolRequest)
}

// parallelSearchPapers 并行执行两种搜索策略
func (s *Service) parallelSearchPapers(
	ctx context.Context,
	mcpServer *mcp.MCPServer,
	userQuery string,
	bulkArgs map[string]any,
	relevanceArgs map[string]any,
) *ParallelSearchResult {
	slog.Debug("parallel search started")
	slog.Debug("parallel search bulk args", "args", bulkArgs)
	slog.Debug("parallel search relevance args", "args", relevanceArgs)

	var wg sync.WaitGroup
	var bulkResult, relevanceResult *PaperFilterResult
	var bulkErr, relevanceErr error

	if bulkArgs != nil {
		wg.Add(1)
		safego.Go("parallel-search-bulk", func() {
			defer wg.Done()
			slog.Debug("channel 1 (bulk) started")
			bulkResult, bulkErr = s.SearchAndFilterPapers(ctx, mcpServer, bulkArgs, userQuery, DefaultPaperFilterConfig)
			if bulkErr != nil {
				slog.Error("channel 1 (bulk) error", "err", bulkErr)
			} else {
				slog.Debug("channel 1 (bulk) completed", "paper_count", len(bulkResult.Papers))
			}
		})
	}

	if relevanceArgs != nil {
		wg.Add(1)
		safego.Go("parallel-search-relevance", func() {
			defer wg.Done()
			slog.Debug("channel 2 (relevance) started")
			relevanceResult, relevanceErr = s.SearchAndFilterPapersRelevance(ctx, mcpServer, relevanceArgs, userQuery, DefaultPaperFilterConfig)
			if relevanceErr != nil {
				slog.Error("channel 2 (relevance) error", "err", relevanceErr)
			} else {
				slog.Debug("channel 2 (relevance) completed", "paper_count", len(relevanceResult.Papers))
			}
		})
	}

	wg.Wait()
	slog.Debug("both channels completed")

	return s.mergeAndDeduplicatePapers(bulkResult, relevanceResult, bulkErr, relevanceErr)
}

// mergeAndDeduplicatePapers 合并并按 paperId 去重，最多返回 maxMergedPapers 篇
func (s *Service) mergeAndDeduplicatePapers(
	bulkResult, relevanceResult *PaperFilterResult,
	bulkErr, relevanceErr error,
) *ParallelSearchResult {
	slog.Debug("merge and deduplicate started")

	const maxMergedPapers = 50

	seen := make(map[string]bool, maxMergedPapers)
	merged := make([]map[string]any, 0, maxMergedPapers)
	bulkCount := 0
	relCount := 0

	if bulkErr == nil && bulkResult != nil {
		slog.Debug("processing bulk results", "paper_count", len(bulkResult.Papers))
		for _, paper := range bulkResult.Papers {
			if len(merged) >= maxMergedPapers {
				break
			}
			if id, ok := paper["paperId"].(string); ok && id != "" && !seen[id] {
				seen[id] = true
				merged = append(merged, paper)
				bulkCount++
			}
		}
	}

	if relevanceErr == nil && relevanceResult != nil {
		slog.Debug("processing relevance results", "paper_count", len(relevanceResult.Papers))
		for _, paper := range relevanceResult.Papers {
			if len(merged) >= maxMergedPapers {
				break
			}
			if id, ok := paper["paperId"].(string); ok && id != "" && !seen[id] {
				seen[id] = true
				merged = append(merged, paper)
				relCount++
			}
		}
	}

	slog.Debug("merge completed", "bulk_count", bulkCount, "relevance_count", relCount, "total", len(merged), "max", maxMergedPapers)
	slog.Debug("merge and deduplicate completed")

	return &ParallelSearchResult{
		Papers:     merged,
		TotalCount: len(merged),
		BulkCount:  bulkCount,
		RelCount:   relCount,
	}
}

// convertMCPToolDefs converts mcp.Tool slice to ai.MCPToolDef slice,
// keeping the ai package decoupled from the mcp package.
func convertMCPToolDefs(tools []mcp.Tool) []ai.MCPToolDef {
	defs := make([]ai.MCPToolDef, len(tools))
	for i, t := range tools {
		defs[i] = ai.MCPToolDef{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.InputSchema,
		}
	}
	return defs
}
