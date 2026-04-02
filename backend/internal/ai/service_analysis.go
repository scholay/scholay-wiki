// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/thirdparty"
)

// 论文分析重试次数
const AnalysisMaxRetries = 3

// 分批请求时每批的维度数量
const DimensionsPerBatch = 4

// AnalysisContext 分析上下文，用于扣费去重
type AnalysisContext struct {
	DimensionHash string // 维度配置哈希
	FromCache     bool   // 是否来自缓存
}

// PaperAnalysisResult 论文分析结果结构（动态维度）
type PaperAnalysisResult struct {
	// 动态维度数据，key为dimension_key，value为分析结果
	Data map[string]string `json:"data"`
	// 维度元信息，用于前端显示
	Dimensions []DimensionInfo `json:"dimensions"`
}

// DimensionInfo 维度信息（用于前端显示）
type DimensionInfo struct {
	Key   string `json:"key"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

// AnalyzePaperAbstract 分析论文摘要，提取结构化信息
// 使用low级别模型进行分析，根据用户的分析维度动态生成提示词
// 优先从数据库缓存获取，如果没有则调用AI分析并保存结果
// 当JSON解析失败时，最多重试3次；如果仍然失败，则按维度分批请求
// userID: 用户ID，用于获取用户自定义的分析维度（nil表示使用系统默认）
// 返回: 分析结果, 分析上下文（用于扣费去重）, 错误
func (s *Service) AnalyzePaperAbstract(ctx context.Context, paperId string, paperTitle string, abstract string, userID *uint) (*PaperAnalysisResult, *AnalysisContext, error) {
	if abstract == "" {
		return nil, nil, fmt.Errorf("abstract is required for analysis")
	}

	// 1. 获取用户的分析维度
	dimensionResult, err := s.GetAnalysisDimensions(userID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get analysis dimensions: %w", err)
	}

	dimensions := dimensionResult.Dimensions
	if len(dimensions) == 0 {
		return nil, nil, fmt.Errorf("no active analysis dimensions found")
	}

	// 生成维度的哈希值，用于缓存key
	dimensionHash := s.generateDimensionHash(dimensions)

	// 创建分析上下文
	analysisCtx := &AnalysisContext{
		DimensionHash: dimensionHash,
		FromCache:     false,
	}

	// 2. 检查数据库缓存（需要匹配维度哈希）
	if paperId != "" {
		if cachedAnalysis, err := s.repo.FindPaperAnalysis(paperId, dimensionHash); err == nil {
			slog.Info("Found cached analysis for paper", "paperId", paperId, "dimensionHash", dimensionHash)
			analysisCtx.FromCache = true
			return s.convertCachedAnalysisToResult(*cachedAnalysis, dimensions), analysisCtx, nil
		}
		slog.Info("No cached analysis found, calling AI", "paperId", paperId, "dimensionHash", dimensionHash)
	}

	// 3. 首先尝试一次性分析所有维度（带重试）
	resultMap, parseSuccess := s.analyzeWithRetry(ctx, paperTitle, abstract, dimensions, paperId)

	// 4. 如果一次性分析失败，尝试分批请求
	if !parseSuccess {
		slog.Info("Full analysis failed, trying batch analysis", "paperId", paperId)
		resultMap, parseSuccess = s.analyzeInBatches(ctx, paperTitle, abstract, dimensions, paperId)
	}

	// 5. 只有解析成功才保存到数据库
	if parseSuccess && paperId != "" {
		analysisDataJSON, _ := json.Marshal(resultMap)

		paperAnalysis := &PaperAnalysis{
			PaperID:       paperId,
			PaperTitle:    paperTitle,
			DimensionHash: dimensionHash,
			AnalysisData:  string(analysisDataJSON),
		}

		if err := s.repo.UpsertPaperAnalysis(paperAnalysis); err != nil {
			slog.Warn("Failed to save paper analysis to database", "err", err)
		} else {
			slog.Info("Saved paper analysis to database", "paperId", paperId, "dimensionHash", dimensionHash)
		}
	} else if !parseSuccess {
		slog.Warn("Analysis failed for paper, not saving to database", "paperId", paperId)
	}

	// 6. 转换为 PaperAnalysisResult 返回
	result := s.convertMapToResult(resultMap, dimensions)
	return result, analysisCtx, nil
}

// analyzeWithRetry retries parsing the AI response as structured JSON.
// Unlike executeWithRetry (which rotates API accounts on HTTP-level failures),
// this retries within a single successful API response: it re-prompts the LLM
// when the returned text is not valid JSON, up to maxRetries attempts.
func (s *Service) analyzeWithRetry(ctx context.Context, paperTitle, abstract string, dimensions []AnalysisDimension, paperId string) (map[string]string, bool) {
	prompt := s.buildAnalysisPrompt(paperTitle, abstract, dimensions)
	messages := []ChatMessage{
		{
			Role:    "user",
			Content: prompt,
		},
	}

	for attempt := 1; attempt <= AnalysisMaxRetries; attempt++ {
		if attempt > 1 {
			slog.Info("Analysis retry", "attempt", attempt, "maxRetries", AnalysisMaxRetries, "paperId", paperId)
		}

		response, err := s.ChatCompletionWithTools(ctx, messages, nil, "", thirdparty.ModelLevelLow)
		if err != nil {
			slog.Error("AI analysis failed", "attempt", attempt, "err", err)
			continue
		}

		if len(response.Choices) == 0 {
			slog.Error("No response from AI", "attempt", attempt)
			continue
		}

		content := strings.TrimSpace(response.Choices[0].Message.Content)
		content = s.extractJSONFromContent(content)

		resultMap := make(map[string]string)
		if err := json.Unmarshal([]byte(content), &resultMap); err != nil {
			slog.Warn("Failed to parse AI response as JSON", "attempt", attempt, "err", err)
			slog.Debug("Raw content info", "length", len(content))
			if len(content) > 0 {
				slog.Debug("Raw content preview", "content", content[:min(2000, len(content))])
			}
			continue
		}

		// 解析成功
		if attempt > 1 {
			slog.Info("Analysis retry succeeded", "attempt", attempt, "paperId", paperId)
		}
		return resultMap, true
	}

	slog.Error("All analysis attempts failed", "maxRetries", AnalysisMaxRetries, "paperId", paperId)
	return nil, false
}

// analyzeInBatches 分批分析维度，每批最多4个维度
func (s *Service) analyzeInBatches(ctx context.Context, paperTitle, abstract string, dimensions []AnalysisDimension, paperId string) (map[string]string, bool) {
	resultMap := make(map[string]string)
	allSuccess := true

	// 将维度分成多个批次
	for i := 0; i < len(dimensions); i += DimensionsPerBatch {
		end := i + DimensionsPerBatch
		if end > len(dimensions) {
			end = len(dimensions)
		}

		batchDimensions := dimensions[i:end]
		batchNum := (i / DimensionsPerBatch) + 1
		totalBatches := (len(dimensions) + DimensionsPerBatch - 1) / DimensionsPerBatch

		slog.Info("Batch analysis processing", "batch", batchNum, "totalBatches", totalBatches, "dimensions", len(batchDimensions), "paperId", paperId)

		// 对每个批次进行分析（带重试）
		batchResult, success := s.analyzeWithRetry(ctx, paperTitle, abstract, batchDimensions, paperId)

		if success {
			// 合并结果
			for k, v := range batchResult {
				resultMap[k] = v
			}
		} else {
			// 批次失败，标记对应维度为解析失败
			allSuccess = false
			for _, dim := range batchDimensions {
				resultMap[dim.DimensionKey] = "解析失败"
			}
			slog.Warn("Batch analysis failed", "batch", batchNum, "paperId", paperId)
		}
	}

	if allSuccess {
		slog.Info("Batch analysis all completed successfully", "paperId", paperId)
	} else {
		slog.Warn("Batch analysis some batches failed", "paperId", paperId)
	}

	// 只要有部分成功就返回true（部分结果总比没有好）
	hasAnySuccess := false
	for _, v := range resultMap {
		if v != "解析失败" {
			hasAnySuccess = true
			break
		}
	}

	return resultMap, hasAnySuccess
}

// extractJSONFromContent 从AI响应中提取JSON内容
func (s *Service) extractJSONFromContent(content string) string {
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

// generateDimensionHash 生成维度配置的哈希值
// 用于判断缓存是否匹配当前维度配置
func (s *Service) generateDimensionHash(dimensions []AnalysisDimension) string {
	// 将维度的key和description拼接后计算MD5
	var sb strings.Builder
	for _, dim := range dimensions {
		sb.WriteString(dim.DimensionKey)
		sb.WriteString(":")
		sb.WriteString(dim.Description)
		sb.WriteString(";")
	}
	hash := md5.Sum([]byte(sb.String()))
	return hex.EncodeToString(hash[:8]) // 只取前8字节，生成16位哈希
}

// checkPaperAnalysisCache 检查论文分析缓存是否存在
// 用于批量分析时预判断是否需要扣费
func (s *Service) checkPaperAnalysisCache(paperId, dimensionHash string) bool {
	if paperId == "" {
		return false
	}
	_, err := s.repo.FindPaperAnalysis(paperId, dimensionHash)
	return err == nil
}

// buildAnalysisPrompt 动态构建分析提示词
// 优先从数据库获取提示词模板，本地兜底
func (s *Service) buildAnalysisPrompt(paperTitle, abstract string, dimensions []AnalysisDimension) string {
	// 1. 构建维度列表字符串
	dimensionList := s.buildDimensionListString(dimensions)

	// 2. 构建JSON输出格式字符串
	jsonFormat := s.buildJSONFormatString(dimensions)

	// 3. 尝试从数据库获取提示词模板
	renderedPrompt, template, err := s.GetAndRenderPrompt("dimensions_paper_analysis", map[string]string{
		"paper_title":    paperTitle,
		"abstract":       abstract,
		"dimension_list": dimensionList,
		"json_format":    jsonFormat,
	})

	if err != nil || template == nil {
		// 数据库获取失败，使用本地兜底提示词
		slog.Warn("Failed to get prompt template from DB, using fallback", "key", "dimensions_paper_analysis", "err", err)
		return s.buildAnalysisPromptFallback(paperTitle, abstract, dimensionList, jsonFormat)
	}

	slog.Info("Using prompt template from DB", "name", template.Name, "id", template.ID)
	return renderedPrompt
}

// buildDimensionListString 构建维度列表字符串
func (s *Service) buildDimensionListString(dimensions []AnalysisDimension) string {
	var sb strings.Builder
	for i, dim := range dimensions {
		sb.WriteString(fmt.Sprintf("%d. %s（%s）\n", i+1, dim.Name, dim.DimensionKey))
		sb.WriteString(fmt.Sprintf("分析指示：%s\n\n", dim.Description))
	}
	return sb.String()
}

// buildJSONFormatString 构建JSON输出格式字符串
func (s *Service) buildJSONFormatString(dimensions []AnalysisDimension) string {
	var sb strings.Builder
	sb.WriteString("{\n")
	for i, dim := range dimensions {
		if i < len(dimensions)-1 {
			sb.WriteString(fmt.Sprintf("  \"%s\": \"%s分析结果\",\n", dim.DimensionKey, dim.Name))
		} else {
			sb.WriteString(fmt.Sprintf("  \"%s\": \"%s分析结果\"\n", dim.DimensionKey, dim.Name))
		}
	}
	sb.WriteString("}")
	return sb.String()
}

// buildAnalysisPromptFallback 本地兜底提示词
func (s *Service) buildAnalysisPromptFallback(paperTitle, abstract, dimensionList, jsonFormat string) string {
	var sb strings.Builder

	sb.WriteString("请你阅读以下论文摘要，并严格根据摘要内容进行分析。\n\n")
	sb.WriteString(fmt.Sprintf("论文标题：%s\n\n", paperTitle))
	sb.WriteString(fmt.Sprintf("论文摘要：%s\n\n", abstract))

	sb.WriteString("为确保输出稳定性、可控性与准确性，请遵守以下规则：\n")
	sb.WriteString("【核心规则】\n")
	sb.WriteString("1. 必须先在内部逐步推理，但不要展示推理过程，只输出最终结果。\n")
	sb.WriteString("2. 所有分类必须完全基于摘要原文，不允许推断、不允许类比、不允许编造。\n")
	sb.WriteString("3. 允许所有维度的结果为空。如果摘要中完全没有对应信息，请回答：未提及。\n")
	sb.WriteString("4. 当摘要极短、极度模糊、非学术化、甚至不含任何可分析内容时，你必须保持结构完整，但允许全部返回未提及。\n")
	sb.WriteString("5. 不要引入摘要中没有的技术、领域、理论、国家、组织、数据、研究方法等信息。\n")
	sb.WriteString("6. 每一项结论都必须在摘要中找到明确对应的词句；若无法定位对应内容，必须回答：未提及。\n\n")

	sb.WriteString("【分析维度】\n")
	sb.WriteString(dimensionList)

	sb.WriteString("【输出格式】\n")
	sb.WriteString("请严格使用以下JSON格式输出，不得增删字段：\n")
	sb.WriteString(jsonFormat)
	sb.WriteString("\n\n所有维度都必须输出，即使内容全部为\"未提及\"。")

	return sb.String()
}

// convertCachedAnalysisToResult 将缓存的分析结果转换为返回结构
func (s *Service) convertCachedAnalysisToResult(cached PaperAnalysis, dimensions []AnalysisDimension) *PaperAnalysisResult {
	// 解析存储的JSON数据
	var dataMap map[string]string
	if err := json.Unmarshal([]byte(cached.AnalysisData), &dataMap); err != nil {
		dataMap = make(map[string]string)
	}

	return s.convertMapToResult(dataMap, dimensions)
}

// convertMapToResult 将map数据转换为返回结构
func (s *Service) convertMapToResult(dataMap map[string]string, dimensions []AnalysisDimension) *PaperAnalysisResult {
	result := &PaperAnalysisResult{
		Data:       dataMap,
		Dimensions: make([]DimensionInfo, 0, len(dimensions)),
	}

	for _, dim := range dimensions {
		value := dataMap[dim.DimensionKey]
		if value == "" {
			value = "未提及"
		}
		result.Dimensions = append(result.Dimensions, DimensionInfo{
			Key:   dim.DimensionKey,
			Name:  dim.Name,
			Value: value,
		})
	}

	return result
}

// ChatCompletionWithLevel calls AI model without streaming and returns the complete response
func (s *Service) ChatCompletionWithLevel(ctx context.Context, messages []ChatMessage, modelLevel thirdparty.ModelLevel) (string, error) {
	result, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, error) {
		modelCode := config.ModelLow
		if modelCode == "" {
			modelCode = "gpt-3.5-turbo"
		}

		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    messages,
			Stream:      false,
			Temperature: 0.7,
		}

		jsonData, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		client := GetLongRunningHTTPClient()

		return circuitbreaker.AIServiceBreaker.Execute(func() (any, error) {
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}

			var response ChatCompletionResponse
			if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
				return nil, fmt.Errorf("failed to decode response: %w", err)
			}
			if len(response.Choices) == 0 {
				return nil, fmt.Errorf("no response choices returned")
			}
			return response.Choices[0].Message.Content, nil
		})
	})
	if err != nil {
		return "", err
	}
	return result.(string), nil
}
