// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/thirdparty"
)

// Service 审稿服务
type Service struct {
	db             *gorm.DB
	aiService      *ai.Service
	mcpServer      *mcp.MCPServer
	accountService *thirdparty.Service
}

// NewService 创建审稿服务
func NewService(db *gorm.DB, aiService *ai.Service, mcpServer *mcp.MCPServer, accountService *thirdparty.Service) *Service {
	return &Service{
		db:             db,
		aiService:      aiService,
		mcpServer:      mcpServer,
		accountService: accountService,
	}
}

// generateManuscriptHash 生成稿件哈希
func generateManuscriptHash(text string, venue string) string {
	hash := md5.Sum([]byte(text + venue))
	return hex.EncodeToString(hash[:])
}

// truncateByRune 按字符数（而非字节数）截取字符串，避免截断 UTF-8 字符
func truncateByRune(s string, maxChars int) string {
	runes := []rune(s)
	if len(runes) <= maxChars {
		return s
	}
	return string(runes[:maxChars])
}

// RunPeerReview 执行审稿流程（流式输出）
func (s *Service) RunPeerReview(userID uint, req *PeerReviewRequest, writer io.Writer) error {
	manuscriptHash := generateManuscriptHash(req.ManuscriptText, req.TargetVenue)

	// 1. 提取稿件元信息
	sendEvent(writer, "status", "正在分析稿件结构...")
	meta, err := s.extractBasicInfo(req.ManuscriptText, req.TargetVenue, req.ModelLevel)
	if err != nil {
		sendEvent(writer, "error", fmt.Sprintf("稿件分析失败: %v", err))
		return err
	}
	sendEvent(writer, "meta", meta)

	// 2. 构建搜索查询
	sendEvent(writer, "status", "正在构建文献检索策略...")
	searchQueries := s.buildSemanticSearchQueries(meta)

	// 3. 调用MCP搜索文献
	sendEvent(writer, "status", "正在检索相关文献...")
	rawResults, err := s.callSemanticScholarSearch(searchQueries)
	if err != nil {
		sendEvent(writer, "error", fmt.Sprintf("文献检索失败: %v", err))
		return err
	}

	// 4. 整理文献结果
	literatureContext := s.normalizeAndSelectPapers(rawResults)
	sendEvent(writer, "literature", literatureContext)

	// 5. 总结文献环境
	sendEvent(writer, "status", "正在分析文献前沿...")
	literatureSummary, err := s.summarizeLiterature(literatureContext, meta, req.ModelLevel)
	if err != nil {
		sendEvent(writer, "error", fmt.Sprintf("文献总结失败: %v", err))
		return err
	}
	sendEvent(writer, "summary", literatureSummary)

	// 5.5 针对研究空白检索相关文献
	if len(literatureSummary.TypicalGaps) > 0 {
		sendEvent(writer, "status", "正在检索研究空白相关文献...")
		gapLiteratures := s.searchGapLiterature(literatureSummary.TypicalGaps, meta.Field)
		if len(gapLiteratures) > 0 {
			sendEvent(writer, "gap_literature", gapLiteratures)
		}
	}

	// 6. 生成审稿报告（流式）
	sendEvent(writer, "status", "正在生成审稿报告...")
	refs := s.buildReferenceList(literatureContext.AllPapers)
	err = s.generateStrictReview(req.ManuscriptText, req.TargetVenue, meta, literatureSummary, refs, req.ModelLevel, writer)
	if err != nil {
		sendEvent(writer, "error", fmt.Sprintf("审稿报告生成失败: %v", err))
		return err
	}

	// 7. 保存审稿记录
	s.saveReviewRecord(userID, manuscriptHash, req, meta, literatureContext, literatureSummary)

	sendEvent(writer, "done", "审稿完成")
	return nil
}

// sendEvent 发送SSE事件
func sendEvent(writer io.Writer, eventType string, data interface{}) {
	event := StreamEvent{
		Type: eventType,
		Data: data,
	}
	jsonData, _ := json.Marshal(event)
	fmt.Fprintf(writer, "data: %s\n\n", string(jsonData))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}
}

// extractBasicInfo 提取稿件基本信息
func (s *Service) extractBasicInfo(manuscriptText, targetVenue, modelLevel string) (*ManuscriptMeta, error) {
	prompt := fmt.Sprintf(`你是一位资深的学术编辑，请仔细阅读以下稿件内容，提取关键信息。

稿件内容：
%s

目标期刊/会议：%s

请提取以下信息并以JSON格式返回：
{
  "title": "论文标题（如果能识别）",
  "abstract": "摘要（如果能识别，否则用前200字概括）",
  "field": "研究领域（如 psychology, machine learning, medicine 等）",
  "main_topic": "一句话描述研究主题",
  "main_methods": ["研究方法1", "研究方法2"],
  "key_variables": ["关键变量1", "关键变量2"],
  "claimed_novelty": ["创新点1", "创新点2"],
  "keywords": ["关键词1", "关键词2", "关键词3"]
}

只返回JSON，不要有其他文字。`, truncateByRune(manuscriptText, 50000), targetVenue)

	messages := []ai.ChatMessage{
		{Role: "user", Content: prompt},
	}

	level := getModelLevel(modelLevel)
	response, err := s.aiService.ChatCompletionWithTools(messages, nil, "", level)
	if err != nil {
		return nil, err
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	content := strings.TrimSpace(response.Choices[0].Message.Content)
	content = extractJSON(content)

	var meta ManuscriptMeta
	if err := json.Unmarshal([]byte(content), &meta); err != nil {
		return nil, fmt.Errorf("failed to parse meta: %w", err)
	}

	return &meta, nil
}

// buildSemanticSearchQueries 构建语义搜索查询
func (s *Service) buildSemanticSearchQueries(meta *ManuscriptMeta) []SearchQuery {
	queries := []SearchQuery{}

	// 主题查询
	if meta.MainTopic != "" {
		topicQuery := meta.MainTopic
		if meta.Field != "" {
			topicQuery += " " + meta.Field
		}
		if len(meta.KeyVariables) > 0 {
			topicQuery += " " + strings.Join(meta.KeyVariables[:min(2, len(meta.KeyVariables))], " ")
		}
		queries = append(queries, SearchQuery{ID: "topic", Query: topicQuery, TopK: 15})
	}

	// 方法查询
	if len(meta.MainMethods) > 0 {
		methodQuery := strings.Join(meta.MainMethods, " ")
		if meta.Field != "" {
			methodQuery += " " + meta.Field
		}
		queries = append(queries, SearchQuery{ID: "method", Query: methodQuery, TopK: 10})
	}

	// 创新点查询
	if len(meta.ClaimedNovelty) > 0 {
		noveltyQuery := strings.Join(meta.ClaimedNovelty, " ")
		queries = append(queries, SearchQuery{ID: "novelty", Query: noveltyQuery, TopK: 10})
	}

	// 关键词查询
	if len(meta.Keywords) > 0 {
		keywordQuery := strings.Join(meta.Keywords, " | ")
		queries = append(queries, SearchQuery{ID: "keywords", Query: keywordQuery, TopK: 10})
	}

	return queries
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func getModelLevel(level string) thirdparty.ModelLevel {
	switch level {
	case "high":
		return thirdparty.ModelLevelHigh
	case "mid":
		return thirdparty.ModelLevelMid
	default:
		return thirdparty.ModelLevelLow
	}
}

func extractJSON(content string) string {
	if strings.Contains(content, "```json") {
		start := strings.Index(content, "```json") + 7
		end := strings.LastIndex(content, "```")
		if end > start {
			return strings.TrimSpace(content[start:end])
		}
	} else if strings.Contains(content, "```") {
		start := strings.Index(content, "```") + 3
		end := strings.LastIndex(content, "```")
		if end > start {
			return strings.TrimSpace(content[start:end])
		}
	}
	return content
}

// callSemanticScholarSearch 调用MCP搜索文献
func (s *Service) callSemanticScholarSearch(queries []SearchQuery) (map[string][]map[string]interface{}, error) {
	results := make(map[string][]map[string]interface{})

	for _, q := range queries {
		// 使用 search_papers_advanced 工具
		args := map[string]interface{}{
			"keywords":      strings.Split(q.Query, " "),
			"year_from":     "2019",
			"year_to":       "2024",
			"min_citations": 5,
			"sort_by":       "citationCount:desc",
			"limit":         q.TopK,
		}

		toolReq := mcp.ToolRequest{
			Name:      "search_papers_advanced",
			Arguments: args,
		}

		resp, err := s.mcpServer.CallTool(toolReq)
		if err != nil {
			fmt.Printf("[PeerReview] Search failed for %s: %v\n", q.ID, err)
			continue
		}

		// 解析结果
		if len(resp.Content) > 0 {
			if textContent, ok := resp.Content[0]["text"].(string); ok {
				var searchResult struct {
					Data  []map[string]interface{} `json:"data"`
					Total int                      `json:"total"`
				}
				if err := json.Unmarshal([]byte(textContent), &searchResult); err == nil {
					results[q.ID] = searchResult.Data
				}
			}
		}
	}

	return results, nil
}

// normalizeAndSelectPapers 整理和筛选论文
func (s *Service) normalizeAndSelectPapers(resultsByID map[string][]map[string]interface{}) *LiteratureContext {
	allPapersMap := make(map[string]map[string]interface{})

	// 去重
	for _, papers := range resultsByID {
		for _, p := range papers {
			key := ""
			if paperID, ok := p["paperId"].(string); ok && paperID != "" {
				key = paperID
			} else if title, ok := p["title"].(string); ok {
				if year, ok := p["year"].(float64); ok {
					key = fmt.Sprintf("%s_%d", title, int(year))
				} else {
					key = title
				}
			}
			if key != "" && allPapersMap[key] == nil {
				allPapersMap[key] = p
			}
		}
	}

	// 转为列表
	allPapers := make([]map[string]interface{}, 0, len(allPapersMap))
	for _, p := range allPapersMap {
		allPapers = append(allPapers, p)
	}

	// 按引用数排序（简单实现）
	// TODO: 更复杂的排序逻辑

	return &LiteratureContext{
		AllPapers: allPapers,
		ByTopic:   topN(resultsByID["topic"], 8),
		ByMethod:  topN(resultsByID["method"], 8),
		ByNovelty: topN(resultsByID["novelty"], 8),
		ByTheory:  topN(resultsByID["keywords"], 8),
	}
}

func topN(papers []map[string]interface{}, n int) []map[string]interface{} {
	if len(papers) <= n {
		return papers
	}
	return papers[:n]
}

// searchGapLiterature 针对研究空白检索相关文献
func (s *Service) searchGapLiterature(gaps []string, field string) []GapLiterature {
	var results []GapLiterature

	// 限制最多检索3个研究空白
	maxGaps := min(len(gaps), 3)

	for i := 0; i < maxGaps; i++ {
		gap := gaps[i]

		// 构建查询：研究空白 + 领域
		query := gap
		if field != "" {
			query = gap + " " + field
		}

		// 使用 search_papers_advanced 工具
		args := map[string]interface{}{
			"keywords":      strings.Split(query, " "),
			"year_from":     "2020", // 最近几年的研究
			"year_to":       "2024",
			"min_citations": 3,
			"sort_by":       "citationCount:desc",
			"limit":         5, // 每个空白找5篇
		}

		toolReq := mcp.ToolRequest{
			Name:      "search_papers_advanced",
			Arguments: args,
		}

		resp, err := s.mcpServer.CallTool(toolReq)
		if err != nil {
			fmt.Printf("[PeerReview] Gap literature search failed for '%s': %v\n", gap, err)
			continue
		}

		// 解析结果
		var papers []map[string]interface{}
		if len(resp.Content) > 0 {
			if textContent, ok := resp.Content[0]["text"].(string); ok {
				var searchResult struct {
					Data  []map[string]interface{} `json:"data"`
					Total int                      `json:"total"`
				}
				if err := json.Unmarshal([]byte(textContent), &searchResult); err == nil {
					papers = searchResult.Data
				}
			}
		}

		if len(papers) > 0 {
			results = append(results, GapLiterature{
				Gap:    gap,
				Papers: papers,
			})
		}
	}

	return results
}

// summarizeLiterature 总结文献环境
func (s *Service) summarizeLiterature(ctx *LiteratureContext, meta *ManuscriptMeta, modelLevel string) (*LiteratureSummary, error) {
	// 压缩论文列表
	compactList := s.compactPapersForLLM(ctx.AllPapers, 20)

	prompt := fmt.Sprintf(`你是一位严谨的学术专家，正在帮助一位"审稿人代理"快速了解某一主题的研究前沿。

下面是该稿件的关键信息：
标题：%s
领域：%s
研究主题：%s
主要方法：%s
关键变量：%s
作者声称的创新点：%s

下面是从 Semantic Scholar 检索得到的相关论文列表：
%s

请你：
1. 概括该主题最近几年的主要研究方向和共识；
2. 点出与该稿件最相似的 3-5 篇论文，并说明相似点；
3. 指出目前文献中尚存的典型 research gap（如果有）；
4. 为后续审稿人评估"新颖性"和"文献是否充分"提供一个简短小结。

输出结构为 JSON：
{
  "field_state": "对该主题近期研究的概览",
  "closest_papers": [
    { "title": "论文标题", "year": 2023, "reason": "相似原因" }
  ],
  "typical_gaps": ["gap1", "gap2"],
  "notes_for_reviewer": "给审稿人的备注"
}

只返回JSON，不要有其他文字。`,
		meta.Title,
		meta.Field,
		meta.MainTopic,
		strings.Join(meta.MainMethods, ", "),
		strings.Join(meta.KeyVariables, ", "),
		strings.Join(meta.ClaimedNovelty, ", "),
		compactList)

	messages := []ai.ChatMessage{
		{Role: "user", Content: prompt},
	}

	level := getModelLevel(modelLevel)
	response, err := s.aiService.ChatCompletionWithTools(messages, nil, "", level)
	if err != nil {
		return nil, err
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	content := strings.TrimSpace(response.Choices[0].Message.Content)
	content = extractJSON(content)

	var summary LiteratureSummary
	if err := json.Unmarshal([]byte(content), &summary); err != nil {
		return nil, fmt.Errorf("failed to parse summary: %w", err)
	}

	return &summary, nil
}

// compactPapersForLLM 压缩论文列表供LLM使用
func (s *Service) compactPapersForLLM(papers []map[string]interface{}, maxPapers int) string {
	var sb strings.Builder

	for i, p := range papers {
		if i >= maxPapers {
			break
		}

		title, _ := p["title"].(string)
		year := 0
		if y, ok := p["year"].(float64); ok {
			year = int(y)
		}
		abstract, _ := p["abstract"].(string)
		if len(abstract) > 300 {
			abstract = abstract[:300] + "..."
		}
		citations := 0
		if c, ok := p["citationCount"].(float64); ok {
			citations = int(c)
		}

		sb.WriteString(fmt.Sprintf("%d. %s (%d) [引用: %d]\n", i+1, title, year, citations))
		if abstract != "" {
			sb.WriteString(fmt.Sprintf("   摘要: %s\n", abstract))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// buildReferenceList 构建参考文献列表
func (s *Service) buildReferenceList(papers []map[string]interface{}) []ReferenceForReviewer {
	refs := make([]ReferenceForReviewer, 0, len(papers))

	for i, p := range papers {
		if i >= 30 { // 最多30篇参考文献
			break
		}

		title, _ := p["title"].(string)
		year := 0
		if y, ok := p["year"].(float64); ok {
			year = int(y)
		}
		paperID, _ := p["paperId"].(string)
		url, _ := p["url"].(string)

		// 提取作者
		authors := ""
		if authorList, ok := p["authors"].([]interface{}); ok && len(authorList) > 0 {
			authorNames := []string{}
			for j, a := range authorList {
				if j >= 3 {
					authorNames = append(authorNames, "et al.")
					break
				}
				if authorMap, ok := a.(map[string]interface{}); ok {
					if name, ok := authorMap["name"].(string); ok {
						authorNames = append(authorNames, name)
					}
				}
			}
			authors = strings.Join(authorNames, ", ")
		}

		refs = append(refs, ReferenceForReviewer{
			ID:      fmt.Sprintf("R%d", i+1),
			Title:   title,
			Year:    year,
			Authors: authors,
			URL:     url,
			PaperID: paperID,
		})
	}

	return refs
}

// generateStrictReview 生成严格审稿报告（流式输出，支持多轮续写）
func (s *Service) generateStrictReview(
	manuscriptText, targetVenue string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer io.Writer,
) error {
	// 构建参考文献字符串
	refsStr := s.formatRefsForPrompt(refs)

	// 构建元信息字符串
	metaJSON, _ := json.Marshal(meta)

	// 构建相似论文信息
	closestPapersInfo := ""
	if len(summary.ClosestPapers) > 0 {
		var sb strings.Builder
		for i, p := range summary.ClosestPapers {
			sb.WriteString(fmt.Sprintf("%d. %s (%d) - 相似原因: %s\n", i+1, p.Title, p.Year, p.Reason))
		}
		closestPapersInfo = sb.String()
	}

	// 构建研究空白信息
	gapsInfo := ""
	if len(summary.TypicalGaps) > 0 {
		gapsInfo = strings.Join(summary.TypicalGaps, "\n- ")
		gapsInfo = "- " + gapsInfo
	}

	// 最大续写轮数，防止无限循环
	const maxContinuations = 5

	systemPrompt := `## 角色：严苛、精准且富有洞察的学术审稿人

你是一位以"严苛、精准、富有洞察力"而闻名的资深学术审稿专家。你坚守最高的学术标准，你的首要任务是**严格审查（Strict Scrutiny）**，以确保只有最高质量的研究得以推进。你擅长一针见血地指出研究中的**核心缺陷**和**逻辑漏洞**，同时你的反馈必须是**具体、清晰且可执行的**。

## 核心知识与能力：

1. **前沿洞察**：你深刻理解并实时追踪本学科的前沿理论、最新方法和行业动态。
2. **理论基石**：你对领域的经典理论与核心范式有系统性、批判性的认知，能迅速判断其应用的恰当性。
3. **逻辑审查**：你能精准识别研究设计、论证推导和数据解释中的逻辑断点、不一致或潜在偏见。
4. **标准感知**：你熟悉不同层次的学术期刊和会议的审稿标准、偏好和"门槛"。

## 审稿核心检查点：

* **原创性与贡献**：研究是否提出了清晰且有价值的新见解？贡献是增量性的还是突破性的？
* **研究问题**：问题是否清晰界定？其学术价值和现实意义是否重大？
* **文献综述**：文献回顾是否全面、深入、具有批判性？是否准确识别了研究缺口？
* **方法论严谨性**：研究设计是否科学？方法是否为回答研究问题的最优选？样本选择、数据处理是否透明、可复现？
* **数据分析与结果**：分析方法是否恰当？结果呈现是否清晰准确？有无过度解读？
* **讨论与结论**：讨论是否深入阐释了结果意义？结论是否完全基于研究证据？是否诚实指出了研究局限？
* **逻辑与表达**：全文论证逻辑是否一致严密？学术语言是否精准专业？

## 重要约束：

1. **引用文献时必须使用 [R1], [R2] 等编号**，只能引用提供的参考文献列表中的文献
2. **不得虚构任何文献或作者**
3. **所有关于"新颖性"和"是否重复已有工作"的判断，必须对照提供的相似论文和参考文献**
4. **批评必须具体、可操作，明确指出如何修改**
5. **使用Markdown格式输出**`

	userPrompt := fmt.Sprintf(`## 投稿目标
**目标期刊/会议**：%s

## 待审稿件内容
%s

## 系统预分析信息

### 稿件结构化理解
%s

### 领域前沿状态
%s

### 与稿件最相似的已发表论文（新颖性核查）
%s

### 当前领域研究空白
%s

### 可引用的参考文献列表（请严格只引用这些，使用 [R1], [R2] 等编号）
%s

---

请基于以上所有信息，生成一份专业的审稿报告。报告**必须**优先并聚焦于指出问题。

**注意：直接从正文内容开始，不要输出"审稿报告"这样的大标题。**

## 综合评估与推荐

### 核心贡献
（简要总结你理解的论文核心贡献）

### 契合度评估
（基于 [%s] 的标准，严格评估稿件的契合度、新颖性和影响力。必须对照上述相似论文进行新颖性判断。）

### 推荐意见
- **Accept** (接受)
- **Minor Revision** (小修后接受)
- **Major Revision** (大修后重审)
- **Reject** (拒稿，需提出建设性的转投建议或根本性重做方向)

**本稿推荐**：[给出具体推荐]
**推荐理由**：[详细说明]

## 必须解决的核心问题

（**这是评审报告的核心。** 必须严格、清晰、具体地列出所有阻碍稿件达到目标期刊标准的重大缺陷。每一条都必须是可操作的、实质性的批评。）

### 问题1：[问题标题]
- **严重程度**：Critical / Major
- **问题描述**：（清晰阐述问题，引用相关文献 [Rx] 作为依据）
- **修改建议**：（具体、可执行的修改方案）

### 问题2：[问题标题]
...

## 其他改进建议

（指出那些次要的、但同样需要修改以提升稿件质量的问题。）

1. [建议1]
2. [建议2]
3. [建议3]`,
		targetVenue,
		truncateByRune(manuscriptText, 50000),
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr,
		targetVenue)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	level := getModelLevel(modelLevel)

	// 使用流式输出，支持多轮续写
	var accumulatedContent strings.Builder
	streamWriter := &reviewStreamWriter{
		writer:      writer,
		accumulator: &accumulatedContent,
	}

	for round := 0; round < maxContinuations; round++ {
		// 重置本轮累积内容
		roundContent := strings.Builder{}
		streamWriter.roundAccumulator = &roundContent

		// 流式输出
		err := s.aiService.StreamChatCompletionWithLevel(messages, streamWriter, level)
		if err != nil {
			return err
		}

		// 获取本轮生成的内容
		roundText := roundContent.String()
		accumulatedContent.WriteString(roundText)

		// 检查是否需要继续生成
		if !s.needsContinuation(accumulatedContent.String()) {
			// 输出完整，结束
			break
		}

		// 需要续写，添加 assistant 消息和续写提示
		messages = append(messages, ai.ChatMessage{
			Role:    "assistant",
			Content: roundText,
		})
		messages = append(messages, ai.ChatMessage{
			Role:    "user",
			Content: "请继续完成审稿报告，从上次中断的地方继续。",
		})

		// 发送续写状态提示
		sendEvent(writer, "status", fmt.Sprintf("内容较长，正在续写（第 %d 轮）...", round+2))
	}

	return nil
}

// needsContinuation 检查审稿报告是否需要续写
func (s *Service) needsContinuation(content string) bool {
	// 检查是否包含完整的报告结构
	// 审稿报告应该包含这些部分：
	// - I. 综合评估与推荐
	// - II. 必须解决的核心问题
	// - III. 其他改进建议

	hasSection1 := strings.Contains(content, "综合评估") || strings.Contains(content, "Overall Assessment")
	hasSection2 := strings.Contains(content, "核心问题") || strings.Contains(content, "Critical Issues")
	hasSection3 := strings.Contains(content, "其他改进建议") || strings.Contains(content, "Other Suggestions")

	// 如果三个部分都有了，检查是否有明显的截断标志
	if hasSection1 && hasSection2 && hasSection3 {
		// 检查是否以不完整的句子结尾（常见的截断标志）
		trimmed := strings.TrimSpace(content)
		if len(trimmed) == 0 {
			return false
		}

		// 获取最后几个字符（考虑 UTF-8 编码）
		runes := []rune(trimmed)
		if len(runes) == 0 {
			return false
		}
		lastRune := runes[len(runes)-1]

		// 如果以标点符号结尾，认为是完整的
		completionMarkers := []rune{'.', '。', '!', '！', '?', '？', ':', '：', '\n'}
		for _, marker := range completionMarkers {
			if lastRune == marker {
				return false
			}
		}

		// 检查是否以 markdown 列表项或标题结尾（可能不完整）
		lines := strings.Split(trimmed, "\n")
		lastLine := strings.TrimSpace(lines[len(lines)-1])

		// 如果最后一行很短且以数字或破折号开头，可能是未完成的列表
		if len(lastLine) < 20 && (strings.HasPrefix(lastLine, "-") || strings.HasPrefix(lastLine, "#") ||
			(len(lastLine) > 0 && lastLine[0] >= '0' && lastLine[0] <= '9')) {
			return true
		}

		return false
	}

	// 如果缺少任何一个主要部分，需要续写
	// 但如果内容太短，可能是刚开始，也需要续写
	if len(content) < 500 {
		return true
	}

	return !hasSection3 // 如果缺少第三部分，需要续写
}

// reviewStreamWriter 审稿流式输出包装器
type reviewStreamWriter struct {
	writer           io.Writer
	accumulator      *strings.Builder // 累积所有轮次的内容
	roundAccumulator *strings.Builder // 累积当前轮次的内容
}

func (w *reviewStreamWriter) Write(p []byte) (n int, err error) {
	// p 是 AI 服务返回的 SSE 格式数据: "data: {...}\n\n"
	// 我们需要解析它，提取 content，然后重新包装为 review_chunk 事件

	line := string(p)

	// 跳过空行
	if strings.TrimSpace(line) == "" {
		return len(p), nil
	}

	// 检查是否是 SSE data 行
	if !strings.HasPrefix(line, "data: ") {
		return len(p), nil
	}

	data := strings.TrimPrefix(line, "data: ")
	data = strings.TrimSuffix(data, "\n\n")
	data = strings.TrimSpace(data)

	// 跳过 [DONE] 标记
	if data == "[DONE]" {
		return len(p), nil
	}

	// 解析 JSON chunk
	var chunk struct {
		Choices []struct {
			Delta struct {
				Content string `json:"content"`
			} `json:"delta"`
		} `json:"choices"`
	}

	if err := json.Unmarshal([]byte(data), &chunk); err != nil {
		// 解析失败，跳过
		return len(p), nil
	}

	// 提取内容
	if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
		content := chunk.Choices[0].Delta.Content

		// 累积当前轮次的内容
		if w.roundAccumulator != nil {
			w.roundAccumulator.WriteString(content)
		}

		// 包装为 review_chunk 事件
		event := StreamEvent{
			Type: "review_chunk",
			Data: content,
		}
		jsonData, _ := json.Marshal(event)
		fmt.Fprintf(w.writer, "data: %s\n\n", string(jsonData))
		if flusher, ok := w.writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}
	}

	return len(p), nil
}

// formatRefsForPrompt 格式化参考文献供提示词使用
func (s *Service) formatRefsForPrompt(refs []ReferenceForReviewer) string {
	var sb strings.Builder
	for _, ref := range refs {
		sb.WriteString(fmt.Sprintf("[%s] %s. %s (%d)\n", ref.ID, ref.Authors, ref.Title, ref.Year))
	}
	return sb.String()
}

// saveReviewRecord 保存审稿记录（使用新的任务表）
func (s *Service) saveReviewRecord(
	userID uint,
	manuscriptHash string,
	req *PeerReviewRequest,
	meta *ManuscriptMeta,
	ctx *LiteratureContext,
	summary *LiteratureSummary,
) {
	metaJSON, _ := json.Marshal(meta)
	ctxJSON, _ := json.Marshal(ctx)
	summaryJSON, _ := json.Marshal(summary)

	// 使用新的任务表保存记录
	task := &PeerReviewTask{
		UserID:            userID,
		InputType:         InputTypeText,
		ManuscriptText:    req.ManuscriptText,
		ManuscriptHash:    manuscriptHash,
		Title:             meta.Title,
		TargetVenue:       req.TargetVenue,
		ModelLevel:        req.ModelLevel,
		Status:            TaskStatusCompleted,
		Progress:          100,
		ProgressStage:     "审稿完成",
		ManuscriptMeta:    string(metaJSON),
		LiteratureContext: string(ctxJSON),
		LiteratureSummary: string(summaryJSON),
	}

	if err := s.db.Create(task).Error; err != nil {
		fmt.Printf("[PeerReview] Failed to save review record: %v\n", err)
	}
}


