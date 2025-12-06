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
	"strconv"
	"strings"
	"time"

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
	uploadPath     string // 文件上传路径
}

// NewService 创建审稿服务
func NewService(db *gorm.DB, aiService *ai.Service, mcpServer *mcp.MCPServer, accountService *thirdparty.Service) *Service {
	return &Service{
		db:             db,
		aiService:      aiService,
		mcpServer:      mcpServer,
		accountService: accountService,
		uploadPath:     "/app/uploads", // 默认上传路径
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

// extractBasicInfo 提取稿件基本信息（文本输入）
func (s *Service) extractBasicInfo(manuscriptText, targetVenue, modelLevel string) (*ManuscriptMeta, error) {
	prompt := fmt.Sprintf(`你是一位资深的学术编辑，请仔细阅读以下稿件内容，提取关键信息。

稿件内容：
%s

目标期刊/会议：%s

请提取以下信息并以JSON格式返回（输出必须控制在3000字符以内）：
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

// extractBasicInfoFromFile 从文件提取稿件基本信息（多模态输入，支持PDF、Word等）
func (s *Service) extractBasicInfoFromFile(fileBase64 string, fileName string, mimeType string, targetVenue, modelLevel string) (*ManuscriptMeta, error) {
	prompt := fmt.Sprintf(`你是一位资深的学术编辑，请仔细阅读附件中的论文文件，提取关键信息。

文件名：%s
目标期刊/会议：%s

请提取以下信息并以JSON格式返回（输出必须控制在3000字符以内）：
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

只返回JSON，不要有其他文字。`, fileName, targetVenue)

	// 构建多模态消息，使用 FileInputMeta 作为中间格式
	// AI service 会根据实际使用的模型自动转换为对应格式
	contentParts := []interface{}{
		ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: mimeType,
			Data:     fileBase64,
		},
		ai.TextContent{
			Type: "text",
			Text: prompt,
		},
	}

	messages := []ai.ChatMessage{
		{Role: "user", Content: contentParts},
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
// 每个查询检索50篇，后续通过AI筛选
func (s *Service) buildSemanticSearchQueries(meta *ManuscriptMeta) []SearchQuery {
	queries := []SearchQuery{}
	field := meta.Field // 获取领域信息，用于动态调整引用阈值

	// 主题查询：main_topic + field + key_variables
	if meta.MainTopic != "" {
		topicQuery := meta.MainTopic
		if meta.Field != "" {
			topicQuery += " " + meta.Field
		}
		if len(meta.KeyVariables) > 0 {
			topicQuery += " " + strings.Join(meta.KeyVariables[:min(2, len(meta.KeyVariables))], " ")
		}
		queries = append(queries, SearchQuery{ID: "topic", Query: topicQuery, TopK: 50, Field: field})
	}

	// 方法查询：main_methods + field
	if len(meta.MainMethods) > 0 {
		methodQuery := strings.Join(meta.MainMethods, " ")
		if meta.Field != "" {
			methodQuery += " " + meta.Field
		}
		queries = append(queries, SearchQuery{ID: "method", Query: methodQuery, TopK: 50, Field: field})
	}

	// 创新点查询：claimed_novelty
	if len(meta.ClaimedNovelty) > 0 {
		noveltyQuery := strings.Join(meta.ClaimedNovelty, " ")
		queries = append(queries, SearchQuery{ID: "novelty", Query: noveltyQuery, TopK: 50, Field: field})
	}

	// 关键词查询：keywords（OR 连接）
	if len(meta.Keywords) > 0 {
		keywordQuery := strings.Join(meta.Keywords, " | ")
		queries = append(queries, SearchQuery{ID: "keywords", Query: keywordQuery, TopK: 50, Field: field})
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
	// 先尝试提取 markdown 代码块中的 JSON
	if strings.Contains(content, "```json") {
		start := strings.Index(content, "```json") + 7
		end := strings.LastIndex(content, "```")
		if end > start {
			content = strings.TrimSpace(content[start:end])
		}
	} else if strings.Contains(content, "```") {
		start := strings.Index(content, "```") + 3
		end := strings.LastIndex(content, "```")
		if end > start {
			content = strings.TrimSpace(content[start:end])
		}
	}

	// 尝试找到 JSON 对象的边界
	content = strings.TrimSpace(content)
	if !strings.HasPrefix(content, "{") {
		// 尝试找到第一个 {
		idx := strings.Index(content, "{")
		if idx >= 0 {
			content = content[idx:]
		}
	}

	// 尝试修复被截断的 JSON
	content = tryFixTruncatedJSON(content)

	return content
}

// tryFixTruncatedJSON 尝试修复被截断的 JSON
func tryFixTruncatedJSON(content string) string {
	// 如果 JSON 已经有效，直接返回
	var test interface{}
	if json.Unmarshal([]byte(content), &test) == nil {
		return content
	}

	// 统计未闭合的括号
	openBraces := 0
	openBrackets := 0
	inString := false
	escaped := false

	for i := 0; i < len(content); i++ {
		c := content[i]
		if escaped {
			escaped = false
			continue
		}
		if c == '\\' && inString {
			escaped = true
			continue
		}
		if c == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		switch c {
		case '{':
			openBraces++
		case '}':
			openBraces--
		case '[':
			openBrackets++
		case ']':
			openBrackets--
		}
	}

	// 如果在字符串中被截断，先关闭字符串
	if inString {
		content += `"`
	}

	// 尝试清理最后一个不完整的键值对
	// 找到最后一个逗号或冒号之后的内容
	lastComma := strings.LastIndex(content, ",")
	lastColon := strings.LastIndex(content, ":")

	// 如果冒号在逗号之后，说明可能有一个不完整的键值对
	if lastColon > lastComma && lastColon > 0 {
		// 检查冒号后面的内容是否是不完整的值
		afterColon := strings.TrimSpace(content[lastColon+1:])
		// 如果冒号后面是不完整的内容（不是有效的 JSON 值）
		if afterColon == "" || afterColon == `"` || afterColon == `"...` ||
			(strings.HasPrefix(afterColon, `"`) && !strings.HasSuffix(afterColon, `"`) && !strings.Contains(afterColon[1:], `"`)) {
			// 回退到最后一个逗号
			if lastComma > 0 {
				content = content[:lastComma]
			}
		}
	}

	// 清理尾部的逗号
	content = strings.TrimRight(content, ", \t\n\r")

	// 补充缺失的闭合括号
	for i := 0; i < openBrackets; i++ {
		content += "]"
	}
	for i := 0; i < openBraces; i++ {
		content += "}"
	}

	return content
}

// getQueryTypeLabel 获取查询类型的中文标签
func getQueryTypeLabel(queryID string) string {
	labels := map[string]string{
		"topic":    "主题",
		"method":   "方法",
		"novelty":  "创新点",
		"keywords": "关键词",
	}
	if label, ok := labels[queryID]; ok {
		return label
	}
	return queryID
}

// getMinCitationsByField 根据学术领域动态调整引用计数阈值
// 不同领域的引用模式差异很大：
// - 计算机科学/AI：引用快速积累，阈值可较高
// - 医学/生命科学：引用周期较长但总量大，中等阈值
// - 工程/物理：中等引用速度
// - 人文社科：引用积累慢，阈值应较低
// - 数学/理论：引用少但质量高，阈值应低
func getMinCitationsByField(field string) int {
	field = strings.ToLower(strings.TrimSpace(field))

	// 高引用领域（快速积累）
	highCitationFields := []string{
		"computer science", "artificial intelligence", "machine learning",
		"deep learning", "natural language processing", "computer vision",
		"data science", "information retrieval", "计算机", "人工智能", "机器学习",
	}
	for _, f := range highCitationFields {
		if strings.Contains(field, f) {
			return 10
		}
	}

	// 中高引用领域
	mediumHighFields := []string{
		"medicine", "biology", "biomedical", "neuroscience", "genetics",
		"medical", "clinical", "health", "医学", "生物", "神经科学",
	}
	for _, f := range mediumHighFields {
		if strings.Contains(field, f) {
			return 8
		}
	}

	// 中等引用领域
	mediumFields := []string{
		"physics", "chemistry", "engineering", "materials", "energy",
		"environmental", "物理", "化学", "工程", "材料",
	}
	for _, f := range mediumFields {
		if strings.Contains(field, f) {
			return 5
		}
	}

	// 低引用领域（积累慢）
	lowCitationFields := []string{
		"mathematics", "philosophy", "history", "literature", "linguistics",
		"sociology", "psychology", "economics", "law", "art",
		"数学", "哲学", "历史", "文学", "语言学", "社会学", "心理学", "经济学", "法学",
	}
	for _, f := range lowCitationFields {
		if strings.Contains(field, f) {
			return 2
		}
	}

	// 默认阈值
	return 3
}

// searchSingleQuery 执行单个查询
func (s *Service) searchSingleQuery(q SearchQuery) ([]map[string]interface{}, error) {
	// 动态计算年份范围：当前年份-5 到 当前年份
	currentYear := time.Now().Year()
	yearFrom := strconv.Itoa(currentYear - 5)
	yearTo := strconv.Itoa(currentYear)

	// 根据领域动态调整引用计数阈值
	minCitations := getMinCitationsByField(q.Field)

	args := map[string]interface{}{
		"keywords":      strings.Split(q.Query, " "),
		"year_from":     yearFrom,
		"year_to":       yearTo,
		"min_citations": minCitations,
		"sort_by":       "citationCount:desc",
		"limit":         q.TopK,
	}

	toolReq := mcp.ToolRequest{
		Name:      "search_papers_advanced",
		Arguments: args,
	}

	resp, err := s.mcpServer.CallTool(toolReq)
	if err != nil {
		return nil, err
	}

	if len(resp.Content) > 0 {
		if textContent, ok := resp.Content[0]["text"].(string); ok {
			var searchResult struct {
				Data  []map[string]interface{} `json:"data"`
				Total int                      `json:"total"`
			}
			if err := json.Unmarshal([]byte(textContent), &searchResult); err == nil {
				return searchResult.Data, nil
			}
		}
	}

	return nil, nil
}

// filterPapersWithAbstract 过滤掉没有摘要的论文
func (s *Service) filterPapersWithAbstract(papers []map[string]interface{}) []map[string]interface{} {
	filtered := make([]map[string]interface{}, 0)
	for _, p := range papers {
		abstract, ok := p["abstract"].(string)
		if ok && strings.TrimSpace(abstract) != "" && len(abstract) > 50 {
			filtered = append(filtered, p)
		}
	}
	return filtered
}

// filterPapersWithAI 使用AI筛选论文
// 输入：有摘要的论文列表（最多50篇）
// 输出：AI认为与研究高度相关的论文（通常10-20篇）
func (s *Service) filterPapersWithAI(papers []map[string]interface{}, query SearchQuery, meta *ManuscriptMeta, modelLevel string) ([]map[string]interface{}, error) {
	// 构建论文列表字符串
	papersInfo := s.formatPapersForAIFilter(papers)

	// 根据查询类型构建筛选提示
	filterContext := s.buildFilterContext(query, meta)

	prompt := fmt.Sprintf(`你是一位严谨的学术文献筛选专家。请帮助筛选与目标研究高度相关的论文。

## 目标研究信息
- 标题：%s
- 领域：%s
- 研究主题：%s
- 主要方法：%s
- 关键变量：%s
- 声称的创新点：%s

## 筛选任务
%s

## 候选论文列表（共%d篇）
%s

## 筛选要求
1. 仔细阅读每篇论文的标题和摘要
2. 评估其与目标研究的相关性（主题相关、方法相关、理论相关等）
3. 选出最相关的10-20篇论文（质量优先，宁缺毋滥）
4. 排除明显不相关、质量低下或摘要内容空泛的论文

## 输出格式
请返回JSON数组，包含选中论文的序号（从1开始），输出必须控制在2000字符以内：
{
  "selected_indices": [1, 3, 5, 7, ...],
  "filter_reason": "简述筛选策略和排除的主要原因（100字以内）"
}

只返回JSON，不要有其他文字。`,
		meta.Title,
		meta.Field,
		meta.MainTopic,
		strings.Join(meta.MainMethods, ", "),
		strings.Join(meta.KeyVariables, ", "),
		strings.Join(meta.ClaimedNovelty, ", "),
		filterContext,
		len(papers),
		papersInfo)

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

	// 解析AI返回的结果
	var filterResult struct {
		SelectedIndices []int  `json:"selected_indices"`
		FilterReason    string `json:"filter_reason"`
	}

	if err := json.Unmarshal([]byte(content), &filterResult); err != nil {
		fmt.Printf("[PeerReview] Failed to parse AI filter result: %v, content: %s\n", err, content[:min(200, len(content))])
		return nil, err
	}

	fmt.Printf("[PeerReview] AI filter reason: %s\n", filterResult.FilterReason)

	// 根据选中的索引提取论文
	selectedPapers := make([]map[string]interface{}, 0)
	for _, idx := range filterResult.SelectedIndices {
		if idx >= 1 && idx <= len(papers) {
			selectedPapers = append(selectedPapers, papers[idx-1])
		}
	}

	return selectedPapers, nil
}

// formatPapersForAIFilter 格式化论文列表供AI筛选
func (s *Service) formatPapersForAIFilter(papers []map[string]interface{}) string {
	var sb strings.Builder

	for i, p := range papers {
		title, _ := p["title"].(string)
		year := 0
		if y, ok := p["year"].(float64); ok {
			year = int(y)
		}
		abstract, _ := p["abstract"].(string)
		// 限制摘要长度，避免提示词过长
		if len(abstract) > 400 {
			abstract = abstract[:400] + "..."
		}
		citations := 0
		if c, ok := p["citationCount"].(float64); ok {
			citations = int(c)
		}
		venue, _ := p["venue"].(string)

		sb.WriteString(fmt.Sprintf("### 论文 %d\n", i+1))
		sb.WriteString(fmt.Sprintf("- 标题: %s\n", title))
		sb.WriteString(fmt.Sprintf("- 年份: %d | 引用数: %d", year, citations))
		if venue != "" {
			sb.WriteString(fmt.Sprintf(" | 发表于: %s", venue))
		}
		sb.WriteString("\n")
		sb.WriteString(fmt.Sprintf("- 摘要: %s\n\n", abstract))
	}

	return sb.String()
}

// buildFilterContext 根据查询类型构建筛选上下文
func (s *Service) buildFilterContext(query SearchQuery, meta *ManuscriptMeta) string {
	switch query.ID {
	case "topic":
		return fmt.Sprintf(`当前任务是筛选【主题相关】的论文。
查询条件：%s
请选出与目标研究主题高度相关的论文，包括：
- 研究相同或相近主题的论文
- 涉及相同关键变量的论文
- 在同一领域内探讨相似问题的论文`, query.Query)

	case "method":
		return fmt.Sprintf(`当前任务是筛选【方法相关】的论文。
查询条件：%s
请选出使用相似研究方法的论文，包括：
- 使用相同或相近实验设计的论文
- 采用类似数据分析方法的论文
- 方法论上可作为参考的论文`, query.Query)

	case "novelty":
		return fmt.Sprintf(`当前任务是筛选【创新点相关】的论文。
查询条件：%s
请选出与目标研究创新点相关的论文，包括：
- 声称有类似创新的论文（用于对比新颖性）
- 提出相关改进或突破的论文
- 可能与目标创新点存在重叠的论文`, query.Query)

	case "keywords":
		return fmt.Sprintf(`当前任务是筛选【关键词相关】的论文。
查询条件：%s
请选出涵盖关键概念的论文，包括：
- 使用相同关键术语的论文
- 探讨相关理论框架的论文
- 在相关子领域有贡献的论文`, query.Query)

	default:
		return fmt.Sprintf(`查询条件：%s
请选出与目标研究最相关的论文。`, query.Query)
	}
}

// callSemanticScholarSearchWithAIFilterNoWriter 调用MCP搜索文献并进行AI筛选（无 writer 版本，用于后台任务）
func (s *Service) callSemanticScholarSearchWithAIFilterNoWriter(queries []SearchQuery, meta *ManuscriptMeta, modelLevel string, progressCallback func(string)) (map[string][]map[string]interface{}, error) {
	results := make(map[string][]map[string]interface{})

	for _, q := range queries {
		if progressCallback != nil {
			progressCallback(fmt.Sprintf("正在检索%s相关文献...", getQueryTypeLabel(q.ID)))
		}

		// 1. 调用MCP检索
		rawPapers, err := s.searchSingleQuery(q)
		if err != nil {
			fmt.Printf("[PeerReview] Search failed for %s: %v\n", q.ID, err)
			continue
		}

		fmt.Printf("[PeerReview] Query '%s' returned %d papers\n", q.ID, len(rawPapers))

		if len(rawPapers) == 0 {
			continue
		}

		// 2. 过滤掉没有摘要的论文
		papersWithAbstract := s.filterPapersWithAbstract(rawPapers)
		fmt.Printf("[PeerReview] After filtering papers without abstract: %d papers\n", len(papersWithAbstract))

		if len(papersWithAbstract) == 0 {
			results[q.ID] = topN(rawPapers, 10)
			continue
		}

		// 3. AI二次筛选
		if progressCallback != nil {
			progressCallback(fmt.Sprintf("AI正在分析%s相关性...", getQueryTypeLabel(q.ID)))
		}
		filteredPapers, err := s.filterPapersWithAI(papersWithAbstract, q, meta, modelLevel)
		if err != nil {
			fmt.Printf("[PeerReview] AI filter failed for %s: %v, using raw results\n", q.ID, err)
			results[q.ID] = topN(papersWithAbstract, 15)
			continue
		}

		fmt.Printf("[PeerReview] After AI filtering: %d papers selected\n", len(filteredPapers))
		results[q.ID] = filteredPapers
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

	return &LiteratureContext{
		AllPapers: allPapers,
		ByTopic:   topN(resultsByID["topic"], 15),   // 增加每类保留数量
		ByMethod:  topN(resultsByID["method"], 15),
		ByNovelty: topN(resultsByID["novelty"], 15),
		ByTheory:  topN(resultsByID["keywords"], 15),
	}
}

func topN(papers []map[string]interface{}, n int) []map[string]interface{} {
	if len(papers) <= n {
		return papers
	}
	return papers[:n]
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

输出结构为 JSON（输出必须控制在4000字符以内，请精简表达）：
{
  "field_state": "对该主题近期研究的概览（200字以内）",
  "closest_papers": [
    { "title": "论文标题", "year": 2023, "reason": "相似原因（50字以内）" }
  ],
  "typical_gaps": ["gap1（50字以内）", "gap2"],
  "notes_for_reviewer": "给审稿人的备注（200字以内）"
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

	// 调用 AI 并支持续写
	content, err := s.callAIWithContinuation(messages, level, 3)
	if err != nil {
		return nil, err
	}

	content = extractJSON(content)

	var summary LiteratureSummary
	if err := json.Unmarshal([]byte(content), &summary); err != nil {
		// 记录原始内容便于调试
		fmt.Printf("[PeerReview] Failed to parse summary JSON, content (first 500 chars): %s\n", content[:min(500, len(content))])
		fmt.Printf("[PeerReview] JSON parse error: %v\n", err)
		return nil, fmt.Errorf("failed to parse summary: %w", err)
	}

	return &summary, nil
}

// callAIWithContinuation 调用 AI 并支持自动续写被截断的响应
func (s *Service) callAIWithContinuation(messages []ai.ChatMessage, level thirdparty.ModelLevel, maxContinuations int) (string, error) {
	var fullContent strings.Builder
	var previousContent string // 用于检测重复

	currentMessages := make([]ai.ChatMessage, len(messages))
	copy(currentMessages, messages)

	for i := 0; i <= maxContinuations; i++ {
		response, err := s.aiService.ChatCompletionWithTools(currentMessages, nil, "", level)
		if err != nil {
			return "", err
		}

		if len(response.Choices) == 0 {
			return "", fmt.Errorf("no response from AI")
		}

		content := response.Choices[0].Message.Content
		finishReason := response.Choices[0].FinishReason

		// 续写时检测并去除重复内容
		if i > 0 && previousContent != "" {
			content = removeOverlappingContent(previousContent, content)
		}

		fullContent.WriteString(content)
		previousContent = content // 保存当前内容用于下一轮去重

		fmt.Printf("[PeerReview] AI response chunk %d, length: %d, finish_reason: %s\n", i+1, len(content), finishReason)

		// 如果正常结束（不是因为长度被截断），直接返回
		if finishReason != "length" {
			break
		}

		// 如果是因为长度被截断，需要续写
		if i < maxContinuations {
			fmt.Printf("[PeerReview] Response truncated, requesting continuation...\n")

			// 构建续写请求：把当前的部分响应加入对话，让 AI 继续
			currentMessages = append(currentMessages, ai.ChatMessage{
				Role:    "assistant",
				Content: content,
			})
			currentMessages = append(currentMessages, ai.ChatMessage{
				Role:    "user",
				Content: "请继续，从你上次停止的地方继续输出，不要重复已输出的内容。",
			})
		}
	}

	return fullContent.String(), nil
}

// callAIWithContinuationMultimodal 调用 AI 并支持自动续写被截断的响应（多模态版本）
// 用于处理包含文件（如PDF）的多模态消息
func (s *Service) callAIWithContinuationMultimodal(messages []ai.ChatMessage, level thirdparty.ModelLevel, maxContinuations int) (string, error) {
	var fullContent strings.Builder
	var previousContent string // 用于检测重复

	currentMessages := make([]ai.ChatMessage, len(messages))
	copy(currentMessages, messages)

	for i := 0; i <= maxContinuations; i++ {
		response, err := s.aiService.ChatCompletionWithTools(currentMessages, nil, "", level)
		if err != nil {
			return "", err
		}

		if len(response.Choices) == 0 {
			return "", fmt.Errorf("no response from AI")
		}

		content := response.Choices[0].Message.Content
		finishReason := response.Choices[0].FinishReason

		// 续写时检测并去除重复内容
		if i > 0 && previousContent != "" {
			content = removeOverlappingContent(previousContent, content)
		}

		fullContent.WriteString(content)
		previousContent = content // 保存当前内容用于下一轮去重

		fmt.Printf("[PeerReview] Multimodal AI response chunk %d, length: %d, finish_reason: %s\n", i+1, len(content), finishReason)

		// 如果正常结束（不是因为长度被截断），直接返回
		if finishReason != "length" {
			break
		}

		// 如果是因为长度被截断，需要续写
		if i < maxContinuations {
			fmt.Printf("[PeerReview] Multimodal response truncated, requesting continuation...\n")

			// 构建续写请求：把当前的部分响应加入对话，让 AI 继续
			// 注意：续写请求不再包含文件，只需要文本
			currentMessages = append(currentMessages, ai.ChatMessage{
				Role:    "assistant",
				Content: content,
			})
			currentMessages = append(currentMessages, ai.ChatMessage{
				Role:    "user",
				Content: "请继续，从你上次停止的地方继续输出，不要重复已输出的内容。",
			})
		}
	}

	return fullContent.String(), nil
}

// removeOverlappingContent 检测并去除续写内容中与前一段重复的部分
// 使用多种策略检测重复：
// 1. 查找最长公共子串（从末尾开始匹配）
// 2. 检测常见的重复模式（如重复的 JSON key）
func removeOverlappingContent(previous, current string) string {
	if len(previous) == 0 || len(current) == 0 {
		return current
	}

	// 策略1：查找 previous 末尾与 current 开头的重叠部分
	// 取 previous 的最后 500 个字符进行匹配（避免全文扫描）
	maxCheckLen := 500
	if len(previous) < maxCheckLen {
		maxCheckLen = len(previous)
	}
	previousTail := previous[len(previous)-maxCheckLen:]

	// 从长到短尝试匹配
	minOverlapLen := 20 // 最小重叠长度，避免误判
	for overlapLen := len(previousTail); overlapLen >= minOverlapLen; overlapLen-- {
		// 检查 previous 末尾的 overlapLen 个字符是否等于 current 开头的 overlapLen 个字符
		if overlapLen <= len(current) {
			suffix := previousTail[len(previousTail)-overlapLen:]
			prefix := current[:overlapLen]
			if suffix == prefix {
				// 找到重叠部分，去除 current 开头的重复内容
				fmt.Printf("[PeerReview] Detected overlap of %d chars, removing duplicate\n", overlapLen)
				return current[overlapLen:]
			}
		}
	}

	// 策略2：检测 JSON 格式的重复（如重复的字段名）
	// 这是一个启发式方法，检测 current 是否以之前出现过的 JSON key 开头
	if strings.Contains(previous, `"`) && strings.HasPrefix(strings.TrimSpace(current), `"`) {
		// 可能是 JSON 续写，检测是否重复了字段
		current = removeRepeatedJSONKeys(previous, current)
	}

	return current
}

// removeRepeatedJSONKeys 检测并移除重复的 JSON key
func removeRepeatedJSONKeys(previous, current string) string {
	// 提取 current 开头的 JSON key（如果有的话）
	trimmedCurrent := strings.TrimSpace(current)
	if !strings.HasPrefix(trimmedCurrent, `"`) {
		return current
	}

	// 找到第一个 key 的结束位置
	endQuote := strings.Index(trimmedCurrent[1:], `"`)
	if endQuote == -1 {
		return current
	}

	firstKey := trimmedCurrent[:endQuote+2] // 包含两个引号

	// 检查这个 key 是否在 previous 中已经出现过
	if strings.Contains(previous, firstKey) {
		// 找到 current 中这个 key 对应的值结束位置
		// 简化处理：找到下一个同级别的 key 或者对象结束
		colonIdx := strings.Index(trimmedCurrent, ":")
		if colonIdx == -1 {
			return current
		}

		// 跳过值部分，找到下一个 key
		valueStart := colonIdx + 1
		depth := 0
		inString := false
		escaped := false

		for i := valueStart; i < len(trimmedCurrent); i++ {
			c := trimmedCurrent[i]

			if escaped {
				escaped = false
				continue
			}

			if c == '\\' && inString {
				escaped = true
				continue
			}

			if c == '"' {
				inString = !inString
				continue
			}

			if inString {
				continue
			}

			if c == '{' || c == '[' {
				depth++
			} else if c == '}' || c == ']' {
				depth--
				if depth < 0 {
					// 到达对象结束，返回剩余部分
					return trimmedCurrent[i:]
				}
			} else if c == ',' && depth == 0 {
				// 找到下一个元素，检查是否是新的 key
				remaining := strings.TrimSpace(trimmedCurrent[i+1:])
				if strings.HasPrefix(remaining, `"`) && !strings.Contains(previous, remaining[:strings.Index(remaining[1:], `"`)+2]) {
					// 下一个 key 在 previous 中不存在，返回从这里开始
					fmt.Printf("[PeerReview] Removed repeated JSON key: %s\n", firstKey)
					return trimmedCurrent[i:]
				}
			}
		}
	}

	return current
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

// formatRefsForPrompt 格式化参考文献供提示词使用
func (s *Service) formatRefsForPrompt(refs []ReferenceForReviewer) string {
	var sb strings.Builder
	for _, ref := range refs {
		sb.WriteString(fmt.Sprintf("[%s] %s. %s (%d)\n", ref.ID, ref.Authors, ref.Title, ref.Year))
	}
	return sb.String()
}

