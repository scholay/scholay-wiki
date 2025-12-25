/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

package conversation

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/thirdparty"
)

// PaperFilterConfig 论文筛选配置
type PaperFilterConfig struct {
	MinPapersRequired    int // 最少需要的论文数量（有摘要的）
	MaxPagesPerSearch    int // 每次搜索最大翻页次数
	PapersPerPage        int // 每页论文数量
	MinRelevantPapers    int // 最少相关论文数量（筛选后）
	MaxTotalPapers       int // 最大获取论文总数（停止条件）
	TargetRelevantPapers int // 目标相关论文数量（停止条件）
}

// DefaultPaperFilterConfig 默认筛选配置
var DefaultPaperFilterConfig = PaperFilterConfig{
	MinPapersRequired:    30,   // 最少需要30篇论文（有摘要的）
	MaxPagesPerSearch:    20,   // 最多翻20页
	PapersPerPage:        100,  // 每页100篇（API返回最多1000篇）
	MinRelevantPapers:    10,   // 最少10篇相关论文
	MaxTotalPapers:       1000, // 最大获取1000篇论文（降低以减少耗时）
	TargetRelevantPapers: 100,  // 目标筛选出100篇相关论文（与maxPapersToShow一致）
}

// PaperFilterResult 论文筛选结果
type PaperFilterResult struct {
	Papers     []map[string]interface{} // 筛选后的论文
	TotalFound int                      // 总共找到的论文数
	PagesUsed  int                      // 使用的页数
}

// FilterPapersWithAbstract 过滤掉没有摘要的论文
func FilterPapersWithAbstract(papers []map[string]interface{}) []map[string]interface{} {
	filtered := make([]map[string]interface{}, 0)
	for _, paper := range papers {
		abstract, ok := paper["abstract"].(string)
		if ok && strings.TrimSpace(abstract) != "" {
			filtered = append(filtered, paper)
		}
	}
	return filtered
}

// FilterRelevantPapers 使用AI筛选与用户问题相关的论文
// 如果论文数量超过 batchSize，会分批筛选并合并结果
func (s *Service) FilterRelevantPapers(papers []map[string]interface{}, userQuery string, maxPapers int) ([]map[string]interface{}, error) {
	if len(papers) == 0 {
		return papers, nil
	}

	// 每批最多处理100篇论文（100篇是最优平衡点，200篇会导致AI单次调用过慢）
	const batchSize = 100
	
	// 如果论文数量超过 batchSize，分批处理
	if len(papers) > batchSize {
		fmt.Printf("[DEBUG] 论文数量 %d 超过批次大小 %d，分批筛选\n", len(papers), batchSize)
		return s.filterPapersInBatches(papers, userQuery, maxPapers, batchSize)
	}

	// 单批处理
	return s.filterSingleBatch(papers, userQuery, maxPapers)
}

// ScoredPaper 带评分的论文
type ScoredPaper struct {
	Paper  map[string]interface{}
	Score  int
	Reason string
}

// filterPapersInBatches 分批筛选论文（并行评分）
// 策略：并行对所有批次进行评分，然后按分数排序取前 N 篇（避免漏掉高分论文）
func (s *Service) filterPapersInBatches(papers []map[string]interface{}, userQuery string, maxPapers int, batchSize int) ([]map[string]interface{}, error) {
	totalBatches := (len(papers) + batchSize - 1) / batchSize
	
	fmt.Printf("[DEBUG] 分批评分(并行): 共 %d 篇论文，分 %d 批处理\n", len(papers), totalBatches)
	startTime := time.Now()
	
	// 准备批次
	type batchInfo struct {
		batchNum int
		papers   []map[string]interface{}
	}
	batches := make([]batchInfo, 0, totalBatches)
	for i := 0; i < len(papers); i += batchSize {
		end := i + batchSize
		if end > len(papers) {
			end = len(papers)
		}
		batches = append(batches, batchInfo{
			batchNum: len(batches) + 1,
			papers:   papers[i:end],
		})
	}
	
	// 第一阶段：并行对所有批次进行评分
	type batchResult struct {
		batchNum int
		papers   []ScoredPaper
		err      error
	}
	
	resultChan := make(chan batchResult, totalBatches)
	
	// 限制并发数，避免过多 AI 请求（提高到8以加快评分速度）
	const maxConcurrency = 8
	semaphore := make(chan struct{}, maxConcurrency)
	
	var wg sync.WaitGroup
	for _, batch := range batches {
		wg.Add(1)
		go func(b batchInfo) {
			defer wg.Done()
			
			// 获取信号量
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			
			fmt.Printf("[DEBUG] 评分第 %d/%d 批 (%d 篇) [并行]\n", b.batchNum, totalBatches, len(b.papers))
			
			scoredPapers, err := s.scoreSingleBatch(b.papers, userQuery)
			resultChan <- batchResult{
				batchNum: b.batchNum,
				papers:   scoredPapers,
				err:      err,
			}
		}(batch)
	}
	
	// 等待所有批次完成
	go func() {
		wg.Wait()
		close(resultChan)
	}()
	
	// 收集结果
	var allScoredPapers []ScoredPaper
	for result := range resultChan {
		if result.err != nil {
			fmt.Printf("[DEBUG] 第 %d 批评分失败: %v\n", result.batchNum, result.err)
			continue
		}
		fmt.Printf("[DEBUG] 第 %d 批评分完成: %d 篇论文获得评分\n", result.batchNum, len(result.papers))
		allScoredPapers = append(allScoredPapers, result.papers...)
	}
	
	parallelDuration := time.Since(startTime)
	fmt.Printf("[DEBUG] 所有批次评分完成: 共 %d 篇论文获得评分, 耗时 %.2f 秒\n", len(allScoredPapers), parallelDuration.Seconds())
	
	// 第二阶段：按分数排序
	sort.Slice(allScoredPapers, func(i, j int) bool {
		return allScoredPapers[i].Score > allScoredPapers[j].Score
	})
	
	// 第三阶段：取前 N 篇（score >= 5）
	var result []map[string]interface{}
	for _, sp := range allScoredPapers {
		if sp.Score < 5 {
			continue // 跳过低分论文
		}
		
		paper := sp.Paper
		paper["_relevanceScore"] = sp.Score
		paper["_relevanceReason"] = sp.Reason
		result = append(result, paper)
		
		if len(result) >= maxPapers {
			break
		}
	}
	
	fmt.Printf("[DEBUG] 分批筛选完成: 从 %d 篇评分论文中选出 %d 篇 (score >= 5)\n", len(allScoredPapers), len(result))
	
	// 打印前5篇的评分详情
	for i := 0; i < len(result) && i < 5; i++ {
		score := result[i]["_relevanceScore"]
		reason := result[i]["_relevanceReason"]
		fmt.Printf("[DEBUG]   Top %d: score=%v, reason=%v\n", i+1, score, reason)
	}
	
	return result, nil
}

// scoreSingleBatch 对单批论文进行评分（返回所有评分结果，不做筛选）
func (s *Service) scoreSingleBatch(papers []map[string]interface{}, userQuery string) ([]ScoredPaper, error) {
	if len(papers) == 0 {
		return nil, nil
	}

	// 构建论文摘要列表
	paperSummaries := make([]map[string]interface{}, 0, len(papers))
	for i, paper := range papers {
		abstract := ""
		if abs, ok := paper["abstract"].(string); ok {
			if len(abs) > 200 {
				abstract = abs[:200] + "..."
			} else {
				abstract = abs
			}
		}
		
		summary := map[string]interface{}{
			"index":    i,
			"title":    paper["title"],
			"abstract": abstract,
			"year":     paper["year"],
		}
		if citations, ok := paper["citationCount"]; ok {
			summary["citations"] = citations
		}
		paperSummaries = append(paperSummaries, summary)
	}

	summariesJSON, err := json.Marshal(paperSummaries)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal paper summaries: %w", err)
	}

	systemPrompt := `你是一个学术论文相关性判断专家。对给定的论文列表进行相关性评分。

评分规则（1-10分）：
- 9-10分：直接讨论用户问题的核心概念
- 7-8分：讨论相关方法或技术
- 5-6分：同一研究领域，有参考价值
- 3-4分：间接相关
- 1-2分：不相关

输出格式（严格JSON）：
{
  "papers": [
    {"index": 0, "score": 9, "reason": "直接讨论核心问题"},
    {"index": 2, "score": 7, "reason": "相关技术方法"}
  ]
}

注意：
- 对所有论文评分，不要遗漏
- 按score从高到低排序
- reason简短（10字以内）
- 只输出JSON`

	userMessage := fmt.Sprintf(`用户问题：%s

论文列表（共%d篇）：
%s

请对所有论文评分，输出JSON格式结果。`, userQuery, len(papers), string(summariesJSON))

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	response, err := s.aiService.ChatCompletionWithLevel(messages, thirdparty.ModelLevelLow)
	if err != nil {
		return nil, err
	}

	if response == "" {
		return nil, fmt.Errorf("empty response")
	}

	// 解析JSON响应
	content := strings.TrimSpace(response)
	startIdx := strings.Index(content, "{")
	endIdx := strings.LastIndex(content, "}")
	if startIdx == -1 || endIdx == -1 || startIdx >= endIdx {
		return nil, fmt.Errorf("invalid JSON response")
	}

	jsonContent := content[startIdx : endIdx+1]
	
	type PaperScore struct {
		Index  int    `json:"index"`
		Score  int    `json:"score"`
		Reason string `json:"reason"`
	}
	type ScoreResponse struct {
		Papers []PaperScore `json:"papers"`
	}
	
	var scoreResp ScoreResponse
	if err := json.Unmarshal([]byte(jsonContent), &scoreResp); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	// 转换为 ScoredPaper
	var result []ScoredPaper
	for _, ps := range scoreResp.Papers {
		if ps.Index >= 0 && ps.Index < len(papers) {
			result = append(result, ScoredPaper{
				Paper:  papers[ps.Index],
				Score:  ps.Score,
				Reason: ps.Reason,
			})
		}
	}

	return result, nil
}

// filterSingleBatch 筛选单批论文（最多100篇）
func (s *Service) filterSingleBatch(papers []map[string]interface{}, userQuery string, maxPapers int) ([]map[string]interface{}, error) {
	if len(papers) == 0 {
		return papers, nil
	}

	// 构建论文摘要列表（只包含标题和截断的摘要以减少 token 数量）
	paperSummaries := make([]map[string]interface{}, 0, len(papers))
	for i, paper := range papers {
		// 截断摘要到200字符以减少token数量
		abstract := ""
		if abs, ok := paper["abstract"].(string); ok {
			if len(abs) > 200 {
				abstract = abs[:200] + "..."
			} else {
				abstract = abs
			}
		}
		
		summary := map[string]interface{}{
			"index":    i,
			"title":    paper["title"],
			"abstract": abstract,
			"year":     paper["year"],
		}
		if citations, ok := paper["citationCount"]; ok {
			summary["citations"] = citations
		}
		paperSummaries = append(paperSummaries, summary)
	}
	
	papersToFilter := papers

	// 构建AI请求
	summariesJSON, err := json.Marshal(paperSummaries)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal paper summaries: %w", err)
	}

	systemPrompt := `你是一个学术论文相关性判断专家。你的任务是对给定的论文列表进行相关性评分，根据用户的问题筛选出最相关的论文。

评分规则（1-10分）：
- 9-10分：直接讨论用户问题的核心概念，高度相关
- 7-8分：讨论相关方法、技术或应用，较为相关
- 5-6分：同一研究领域，有一定参考价值
- 3-4分：间接相关，可能有边缘参考价值
- 1-2分：基本不相关

评分时考虑因素：
1. 标题和摘要与用户问题的语义匹配度
2. 研究方向与用户问题的一致性
3. 论文的引用数（高引用通常表示重要性）
4. 发表年份（较新的论文可能更有时效性）

输出格式要求（严格JSON）：
{
  "papers": [
    {"index": 0, "score": 9, "reason": "直接讨论LLM幻觉缓解方法"},
    {"index": 2, "score": 7, "reason": "提出相关的事实验证技术"},
    ...
  ]
}

注意：
- 只输出score >= 5的论文（有参考价值的）
- 按score从高到低排序
- reason字段简短说明相关性原因（10字以内）
- 只输出JSON，不要有任何其他文字`

	userMessage := fmt.Sprintf(`用户问题：%s

论文列表（共%d篇）：
%s

请对上述论文进行相关性评分（1-10分），筛选出score>=5的论文（最多%d篇），按分数从高到低排序，输出JSON格式结果。`, 
		userQuery, len(papersToFilter), string(summariesJSON), maxPapers)

	// 使用低成本模型进行筛选
	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	response, err := s.aiService.ChatCompletionWithLevel(messages, thirdparty.ModelLevelLow)
	if err != nil {
		fmt.Printf("[WARN] AI filtering failed, returning all papers: %v\n", err)
		// 如果AI筛选失败，返回原始论文（限制数量）
		if len(papers) > maxPapers {
			return papers[:maxPapers], nil
		}
		return papers, nil
	}

	// 解析AI返回的结构化JSON
	if response == "" {
		fmt.Printf("[WARN] AI returned empty response, returning all papers\n")
		if len(papers) > maxPapers {
			return papers[:maxPapers], nil
		}
		return papers, nil
	}

	content := strings.TrimSpace(response)
	// 尝试提取JSON对象
	startIdx := strings.Index(content, "{")
	endIdx := strings.LastIndex(content, "}")
	if startIdx == -1 || endIdx == -1 || startIdx >= endIdx {
		fmt.Printf("[WARN] AI response not valid JSON object: %s\n", content)
		// 尝试兼容旧格式（纯数组）
		return s.parseOldFormatResponse(content, papers, maxPapers)
	}

	jsonContent := content[startIdx : endIdx+1]
	
	// 解析结构化响应
	type PaperScore struct {
		Index  int    `json:"index"`
		Score  int    `json:"score"`
		Reason string `json:"reason"`
	}
	type FilterResponse struct {
		Papers []PaperScore `json:"papers"`
	}
	
	var filterResp FilterResponse
	if err := json.Unmarshal([]byte(jsonContent), &filterResp); err != nil {
		fmt.Printf("[WARN] Failed to parse AI response as structured JSON: %v, content: %s\n", err, jsonContent)
		// 尝试兼容旧格式
		return s.parseOldFormatResponse(content, papers, maxPapers)
	}

	// 根据评分结果提取论文（已按分数排序）
	selectedPapers := make([]map[string]interface{}, 0, len(filterResp.Papers))
	for _, ps := range filterResp.Papers {
		if ps.Index >= 0 && ps.Index < len(papersToFilter) && ps.Score >= 5 {
			paper := papers[ps.Index]
			// 将评分信息附加到论文中（可选，用于调试）
			paper["_relevanceScore"] = ps.Score
			paper["_relevanceReason"] = ps.Reason
			selectedPapers = append(selectedPapers, paper)
			
			if len(selectedPapers) >= maxPapers {
				break
			}
		}
	}

	fmt.Printf("[DEBUG] AI scored and filtered %d papers from %d candidates (score >= 5)\n", len(selectedPapers), len(papersToFilter))
	
	// 打印前5篇的评分详情
	for i, ps := range filterResp.Papers {
		if i >= 5 {
			break
		}
		fmt.Printf("[DEBUG]   #%d: index=%d, score=%d, reason=%s\n", i+1, ps.Index, ps.Score, ps.Reason)
	}
	
	return selectedPapers, nil
}

// parseOldFormatResponse 兼容旧格式的响应解析（纯索引数组）
func (s *Service) parseOldFormatResponse(content string, papers []map[string]interface{}, maxPapers int) ([]map[string]interface{}, error) {
	startIdx := strings.Index(content, "[")
	endIdx := strings.LastIndex(content, "]")
	if startIdx == -1 || endIdx == -1 || startIdx >= endIdx {
		fmt.Printf("[WARN] AI response not valid JSON array either: %s\n", content)
		if len(papers) > maxPapers {
			return papers[:maxPapers], nil
		}
		return papers, nil
	}

	jsonContent := content[startIdx : endIdx+1]
	var selectedIndices []int
	if err := json.Unmarshal([]byte(jsonContent), &selectedIndices); err != nil {
		fmt.Printf("[WARN] Failed to parse AI response as JSON array: %v, content: %s\n", err, jsonContent)
		if len(papers) > maxPapers {
			return papers[:maxPapers], nil
		}
		return papers, nil
	}

	selectedPapers := make([]map[string]interface{}, 0, len(selectedIndices))
	for _, idx := range selectedIndices {
		if idx >= 0 && idx < len(papers) {
			selectedPapers = append(selectedPapers, papers[idx])
		}
		if len(selectedPapers) >= maxPapers {
			break
		}
	}

	fmt.Printf("[DEBUG] AI filtered %d papers from %d candidates (old format)\n", len(selectedPapers), len(papers))
	return selectedPapers, nil
}

// SearchAndFilterPapers 搜索并筛选论文（支持分页重试）
// 停止条件：筛选后论文达到 TargetRelevantPapers 篇，或总获取论文达到 MaxTotalPapers 篇
func (s *Service) SearchAndFilterPapers(
	mcpServer *mcp.MCPServer,
	toolArgs map[string]interface{},
	userQuery string,
	config PaperFilterConfig,
) (*PaperFilterResult, error) {
	fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 开始搜索，目标筛选 %d 篇，最大获取 %d 篇\n", 
		config.TargetRelevantPapers, config.MaxTotalPapers)

	var allPapersWithAbstract []map[string]interface{}
	var allRelevantPapers []map[string]interface{}
	var totalCount int
	var totalFetched int
	currentToken := ""
	pagesUsed := 0

	// 确保每页获取足够数量的论文
	if limit, ok := toolArgs["limit"]; ok {
		if limitInt, ok := limit.(float64); ok && limitInt < float64(config.PapersPerPage) {
			toolArgs["limit"] = float64(config.PapersPerPage)
		}
	} else {
		toolArgs["limit"] = float64(config.PapersPerPage)
	}

	// 分页获取论文，直到满足停止条件
	for pagesUsed < config.MaxPagesPerSearch {
		// 检查停止条件1：筛选后论文已达到目标
		if len(allRelevantPapers) >= config.TargetRelevantPapers {
			fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 筛选后论文已达到目标 (%d >= %d)，停止分页\n",
				len(allRelevantPapers), config.TargetRelevantPapers)
			break
		}

		// 检查停止条件2：总获取论文已达到最大值
		if totalFetched >= config.MaxTotalPapers {
			fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 总获取论文已达到最大值 (%d >= %d)，停止分页\n",
				totalFetched, config.MaxTotalPapers)
			break
		}

		pagesUsed++
		fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 获取第 %d 页...\n", pagesUsed)

		// 设置分页token
		if currentToken != "" {
			toolArgs["token"] = currentToken
		}

		// 调用MCP工具获取论文
		toolRequest := mcp.ToolRequest{
			Name:      "search_papers_advanced",
			Arguments: toolArgs,
		}

		papers, total, nextToken, err := s.executeMCPToolCallWithToken(mcpServer, toolRequest)
		if err != nil {
			fmt.Printf("[PARALLEL-DEBUG] Bulk通道: MCP调用失败 (第 %d 页): %v\n", pagesUsed, err)
			break
		}

		if total > totalCount {
			totalCount = total
		}
		totalFetched += len(papers)

		fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 第 %d 页获取 %d 篇，累计获取 %d 篇，总可用 %d 篇\n",
			pagesUsed, len(papers), totalFetched, total)

		// 过滤掉没有摘要的论文
		papersWithAbstract := FilterPapersWithAbstract(papers)
		fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 第 %d 页有摘要 %d 篇 (过滤前 %d 篇)\n",
			pagesUsed, len(papersWithAbstract), len(papers))

		if len(papersWithAbstract) > 0 {
			allPapersWithAbstract = append(allPapersWithAbstract, papersWithAbstract...)

			// 对本页论文进行AI筛选
			fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 对第 %d 页的 %d 篇论文进行AI筛选...\n",
				pagesUsed, len(papersWithAbstract))
			
			// 计算还需要多少篇论文
			remaining := config.TargetRelevantPapers - len(allRelevantPapers)
			if remaining <= 0 {
				remaining = 50 // 默认最多50篇
			}
			
			relevantPapers, err := s.FilterRelevantPapers(papersWithAbstract, userQuery, remaining)
			if err != nil {
				fmt.Printf("[PARALLEL-DEBUG] Bulk通道: AI筛选失败: %v\n", err)
			} else {
				fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 第 %d 页筛选出 %d 篇相关论文\n",
					pagesUsed, len(relevantPapers))
				allRelevantPapers = append(allRelevantPapers, relevantPapers...)
			}
		}

		// 检查是否还有更多页
		if nextToken == "" {
			fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 没有更多页面\n")
			break
		}

		currentToken = nextToken
	}

	fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 搜索完成，共 %d 页，获取 %d 篇，有摘要 %d 篇，筛选后 %d 篇\n",
		pagesUsed, totalFetched, len(allPapersWithAbstract), len(allRelevantPapers))

	// 如果没有筛选到任何论文，返回所有有摘要的论文（限制数量）
	if len(allRelevantPapers) == 0 && len(allPapersWithAbstract) > 0 {
		fmt.Printf("[PARALLEL-DEBUG] Bulk通道: 未筛选到相关论文，返回所有有摘要的论文\n")
		if len(allPapersWithAbstract) > config.TargetRelevantPapers {
			allRelevantPapers = allPapersWithAbstract[:config.TargetRelevantPapers]
		} else {
			allRelevantPapers = allPapersWithAbstract
		}
	}

	return &PaperFilterResult{
		Papers:     allRelevantPapers,
		TotalFound: totalCount,
		PagesUsed:  pagesUsed,
	}, nil
}

// SearchAndFilterPapersRelevance 使用 search_papers_relevance 工具搜索并筛选论文（基于相关性排序）
// 优化策略：先批量获取最多500篇论文，然后统一进行AI筛选（利用并行评分）
func (s *Service) SearchAndFilterPapersRelevance(
	mcpServer *mcp.MCPServer,
	toolArgs map[string]interface{},
	userQuery string,
	config PaperFilterConfig,
) (*PaperFilterResult, error) {
	fmt.Printf("[PARALLEL-DEBUG] ========== Relevance通道开始 ==========\n")
	fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 用户查询: %s\n", userQuery)
	
	const maxBatchFetch = 400 // 最多批量获取400篇
	fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 批量获取最多 %d 篇，然后统一AI筛选\n", maxBatchFetch)

	var allPapersWithAbstract []map[string]interface{}
	var totalCount int
	var totalFetched int
	currentOffset := 0
	pagesUsed := 0

	// 设置每页数量
	limit := config.PapersPerPage
	if limit > 100 {
		limit = 100 // /paper/search API 最大返回 100 篇
	}

	startTime := time.Now()

	// 第一阶段：批量获取论文（最多500篇）
	fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 开始批量获取论文...\n")
	for pagesUsed < config.MaxPagesPerSearch && totalFetched < maxBatchFetch {
		pagesUsed++
		fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 获取第 %d 页, offset=%d, limit=%d\n", pagesUsed, currentOffset, limit)

		// 设置分页参数
		toolArgs["offset"] = float64(currentOffset)
		toolArgs["limit"] = float64(limit)

		// 调用MCP工具获取论文
		toolRequest := mcp.ToolRequest{
			Name:      "search_papers_relevance",
			Arguments: toolArgs,
		}

		papers, total, _, err := s.executeMCPToolCallWithToken(mcpServer, toolRequest)
		if err != nil {
			fmt.Printf("[PARALLEL-DEBUG] Relevance通道: MCP调用失败 (第 %d 页): %v\n", pagesUsed, err)
			break
		}

		if total > totalCount {
			totalCount = total
		}
		totalFetched += len(papers)

		fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 第 %d 页获取 %d 篇，累计获取 %d 篇，总可用 %d 篇\n",
			pagesUsed, len(papers), totalFetched, total)

		// 过滤掉没有摘要的论文
		papersWithAbstract := FilterPapersWithAbstract(papers)
		fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 第 %d 页有摘要 %d 篇\n", pagesUsed, len(papersWithAbstract))

		allPapersWithAbstract = append(allPapersWithAbstract, papersWithAbstract...)

		// 检查是否还有更多页
		if len(papers) < limit {
			fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 没有更多页面\n")
			break
		}

		currentOffset += limit
	}

	fetchDuration := time.Since(startTime)
	fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 批量获取完成，共 %d 页，获取 %d 篇，有摘要 %d 篇，耗时 %.2f 秒\n",
		pagesUsed, totalFetched, len(allPapersWithAbstract), fetchDuration.Seconds())

	// 第二阶段：统一进行AI筛选（利用并行评分）
	var allRelevantPapers []map[string]interface{}
	if len(allPapersWithAbstract) > 0 {
		fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 开始AI筛选 %d 篇论文...\n", len(allPapersWithAbstract))
		filterStartTime := time.Now()
		
		relevantPapers, err := s.FilterRelevantPapers(allPapersWithAbstract, userQuery, config.TargetRelevantPapers)
		if err != nil {
			fmt.Printf("[PARALLEL-DEBUG] Relevance通道: AI筛选失败: %v\n", err)
		} else {
			allRelevantPapers = relevantPapers
		}
		
		filterDuration := time.Since(filterStartTime)
		fmt.Printf("[PARALLEL-DEBUG] Relevance通道: AI筛选完成，筛选出 %d 篇，耗时 %.2f 秒\n",
			len(allRelevantPapers), filterDuration.Seconds())
	}

	// 如果没有筛选到任何论文，返回所有有摘要的论文（限制数量）
	if len(allRelevantPapers) == 0 && len(allPapersWithAbstract) > 0 {
		fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 未筛选到相关论文，返回所有有摘要的论文\n")
		if len(allPapersWithAbstract) > config.TargetRelevantPapers {
			allRelevantPapers = allPapersWithAbstract[:config.TargetRelevantPapers]
		} else {
			allRelevantPapers = allPapersWithAbstract
		}
	}

	totalDuration := time.Since(startTime)
	fmt.Printf("[PARALLEL-DEBUG] Relevance通道: 总耗时 %.2f 秒\n", totalDuration.Seconds())
	fmt.Printf("[PARALLEL-DEBUG] ========== Relevance通道完成 ==========\n")

	return &PaperFilterResult{
		Papers:     allRelevantPapers,
		TotalFound: totalCount,
		PagesUsed:  pagesUsed,
	}, nil
}

// executeMCPToolCallWithToken 执行MCP工具调用并返回下一页token
func (s *Service) executeMCPToolCallWithToken(mcpServer *mcp.MCPServer, toolRequest mcp.ToolRequest) ([]map[string]interface{}, int, string, error) {
	result, err := mcpServer.CallTool(toolRequest)
	if err != nil {
		return nil, 0, "", err
	}

	// Parse the MCP response
	if len(result.Content) == 0 {
		return []map[string]interface{}{}, 0, "", nil
	}

	// The MCP server returns JSON in the text field
	var rawResponse map[string]interface{}
	if err := json.Unmarshal([]byte(result.Content[0]["text"].(string)), &rawResponse); err != nil {
		return nil, 0, "", fmt.Errorf("failed to parse search results: %w", err)
	}

	// 提取 token（用于分页）
	nextToken := ""
	if token, ok := rawResponse["token"].(string); ok {
		nextToken = token
	}

	// 提取 total
	total := 0
	if t, ok := rawResponse["total"].(float64); ok {
		total = int(t)
	}

	// 提取 data
	var papers []map[string]interface{}
	if data, ok := rawResponse["data"].([]interface{}); ok {
		for _, item := range data {
			if paper, ok := item.(map[string]interface{}); ok {
				papers = append(papers, paper)
			}
		}
	}

	return papers, total, nextToken, nil
}

