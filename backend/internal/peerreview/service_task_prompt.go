// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"scholar-backend/internal/ai"
)

// 审稿报告生成（共 6 个 variant，共享提示词构建 + 重试循环，见 service_task_prompt_helpers.go）
// 维度：
//   - 输入类型：text / hybrid(text+pdf) / file
//   - 模型来源：默认 level / 用户指定 modelConfig

// ========== 审稿报告生成 ==========

// generateReviewForTask 纯文本模式 + 默认 modelLevel
func (s *Service) generateReviewForTask(
	ctx context.Context,
	manuscriptText string,
	attachmentTexts []map[string]string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
) error {
	base := s.buildReviewPromptBase(manuscriptText, meta, summary, refs)
	attachmentContent := formatAttachmentTexts(attachmentTexts, "【附件内容】")

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPrompt := fmt.Sprintf(getReviewUserPromptTemplate(),
		base.TruncatedText+attachmentContent,
		base.MetaJSON,
		base.FieldState,
		base.ClosestPapersInfo,
		base.GapsInfo,
		base.RefsStr)

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}
	level := getModelLevel(modelLevel)

	caller := func(ctx context.Context) (string, error) {
		resp, err := s.aiService.ChatCompletionWithTools(ctx, convertMessages(messages), nil, "", level)
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", nil
		}
		return resp.Choices[0].Message.Content, nil
	}

	return s.runReviewRetryLoop(ctx, taskID, "正在生成审稿报告...",
		[]any{"mode", "text", "reviewer_index", reviewerIndex, "level", level, "text_length", len(base.TruncatedText)},
		writer, caller)
}

// generateReviewForTaskWithModel 纯文本模式 + 指定模型
func (s *Service) generateReviewForTaskWithModel(
	ctx context.Context,
	manuscriptText string,
	attachmentTexts []map[string]string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
	modelConfig *ReviewerModelConfig,
) error {
	reviewerName := ReviewerNames[reviewerIndex]
	base := s.buildReviewPromptBase(manuscriptText, meta, summary, refs)
	attachmentContent := formatAttachmentTexts(attachmentTexts, "【附件内容】")

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPrompt := fmt.Sprintf(getReviewUserPromptTemplate(),
		base.TruncatedText+attachmentContent,
		base.MetaJSON,
		base.FieldState,
		base.ClosestPapersInfo,
		base.GapsInfo,
		base.RefsStr)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	caller := func(ctx context.Context) (string, error) {
		resp, err := s.aiService.ChatCompletionWithModel(ctx, messages, nil, "", modelConfig.BaseURL, modelConfig.APIKey, modelConfig.ModelName)
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", nil
		}
		return resp.Choices[0].Message.Content, nil
	}

	return s.runReviewRetryLoop(ctx, taskID, fmt.Sprintf("%s 正在生成审稿报告...", reviewerName),
		[]any{"mode", "text", "reviewer", reviewerName, "model", modelConfig.ModelName, "text_length", len(base.TruncatedText)},
		writer, caller)
}

// generateReviewForTaskHybrid 混合模式（文本主稿件 + PDF 附件）+ 默认 level
func (s *Service) generateReviewForTaskHybrid(
	ctx context.Context,
	manuscriptText string,
	pdfAttachments []FileForAI,
	attachmentTexts []map[string]string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
) error {
	base := s.buildReviewPromptBase(manuscriptText, meta, summary, refs)

	var pdfAttachmentNames []string
	for _, f := range pdfAttachments {
		pdfAttachmentNames = append(pdfAttachmentNames, f.FileName)
	}
	attachmentInfo := ""
	if len(pdfAttachmentNames) > 0 {
		attachmentInfo = buildAttachmentPrompt(pdfAttachmentNames)
	}
	textAttachmentContent := formatAttachmentTexts(attachmentTexts, "【文本附件内容】")

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPromptText := fmt.Sprintf(`你正在对一份学术论文进行同行评审。

**【主稿件内容】**
以下是论文的文本内容：

%s

%s
%s

**【预处理信息】**
稿件元信息：
%s

**【文献前沿】**
%s

最相似的已发表论文：
%s

该领域常见 Gap：
%s

**【参考文献列表】**（来自 Semantic Scholar）
%s

请根据以上内容，结合论文全文和所有附件内容，作为一名学术审稿专家，给出详细的审稿意见。`,
		base.TruncatedText,
		attachmentInfo,
		textAttachmentContent,
		base.MetaJSON,
		base.FieldState,
		base.ClosestPapersInfo,
		base.GapsInfo,
		base.RefsStr)

	contentParts := make([]any, 0, len(pdfAttachments)+1)
	for _, f := range pdfAttachments {
		contentParts = append(contentParts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName,
		})
	}
	contentParts = append(contentParts, ai.TextContent{Type: "text", Text: userPromptText})

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}
	level := getModelLevel(modelLevel)

	caller := func(ctx context.Context) (string, error) {
		resp, err := s.aiService.ChatCompletionWithTools(ctx, messages, nil, "", level)
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", nil
		}
		return resp.Choices[0].Message.Content, nil
	}

	return s.runReviewRetryLoop(ctx, taskID, "正在生成审稿报告...",
		[]any{"mode", "hybrid", "reviewer_index", reviewerIndex, "level", level, "text_length", len(base.TruncatedText), "pdf_count", len(pdfAttachments)},
		writer, caller)
}

// generateReviewForTaskHybridWithModel 混合模式 + 指定模型
func (s *Service) generateReviewForTaskHybridWithModel(
	ctx context.Context,
	manuscriptText string,
	pdfAttachments []FileForAI,
	attachmentTexts []map[string]string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
	modelConfig *ReviewerModelConfig,
) error {
	reviewerName := ReviewerNames[reviewerIndex]
	base := s.buildReviewPromptBase(manuscriptText, meta, summary, refs)
	attachmentTextContent := formatAttachmentTexts(attachmentTexts, "【附件内容】")

	var attachmentNames []string
	for _, f := range pdfAttachments {
		attachmentNames = append(attachmentNames, f.FileName)
	}
	attachmentPrompt := buildAttachmentPrompt(attachmentNames)

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPromptText := fmt.Sprintf(getReviewUserPromptTemplateForFile(),
		base.MetaJSON,
		base.FieldState,
		base.ClosestPapersInfo,
		base.GapsInfo,
		base.RefsStr) + attachmentTextContent + attachmentPrompt

	contentParts := []any{}
	for _, f := range pdfAttachments {
		contentParts = append(contentParts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName,
		})
	}
	contentParts = append(contentParts, ai.TextContent{
		Type: "text",
		Text: "【主稿件内容】\n" + base.TruncatedText + "\n\n" + userPromptText,
	})

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}

	caller := func(ctx context.Context) (string, error) {
		resp, err := s.aiService.ChatCompletionWithModel(ctx, messages, nil, "", modelConfig.BaseURL, modelConfig.APIKey, modelConfig.ModelName)
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", nil
		}
		return resp.Choices[0].Message.Content, nil
	}

	return s.runReviewRetryLoop(ctx, taskID, fmt.Sprintf("%s 正在生成审稿报告...", reviewerName),
		[]any{"mode", "hybrid", "reviewer", reviewerName, "model", modelConfig.ModelName, "text_length", len(base.TruncatedText), "pdf_count", len(pdfAttachments)},
		writer, caller)
}

// generateReviewForTaskWithFile 文件输入模式（PDF 主稿件 + PDF 附件）+ 默认 level
func (s *Service) generateReviewForTaskWithFile(
	ctx context.Context,
	files []FileForAI,
	attachmentTexts []map[string]string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
) error {
	base := s.buildReviewPromptBase("", meta, summary, refs) // 文件模式不用 manuscript 文本

	mainFileName, attachmentNames := splitFileRoles(files)
	attachmentInfo := ""
	if len(attachmentNames) > 0 {
		attachmentInfo = buildAttachmentPrompt(attachmentNames)
	}
	textAttachmentContent := formatAttachmentTexts(attachmentTexts, "【文本附件内容】")

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPromptText := fmt.Sprintf(getReviewUserPromptTemplateForFile(),
		mainFileName,
		attachmentInfo+textAttachmentContent,
		base.MetaJSON,
		base.FieldState,
		base.ClosestPapersInfo,
		base.GapsInfo,
		base.RefsStr)

	contentParts := buildMultimodalContent(files, userPromptText)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}
	level := getModelLevel(modelLevel)

	caller := func(ctx context.Context) (string, error) {
		resp, err := s.aiService.ChatCompletionWithTools(ctx, messages, nil, "", level)
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", nil
		}
		return resp.Choices[0].Message.Content, nil
	}

	return s.runReviewRetryLoop(ctx, taskID, "正在生成审稿报告...",
		[]any{"mode", "file", "reviewer_index", reviewerIndex, "level", level, "file_count", len(files)},
		writer, caller)
}

// generateReviewForTaskWithFileAndModel 文件输入模式 + 指定模型
func (s *Service) generateReviewForTaskWithFileAndModel(
	ctx context.Context,
	files []FileForAI,
	attachmentTexts []map[string]string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
	modelConfig *ReviewerModelConfig,
) error {
	reviewerName := ReviewerNames[reviewerIndex]
	base := s.buildReviewPromptBase("", meta, summary, refs)

	mainFileName, attachmentNames := splitFileRoles(files)
	attachmentInfo := ""
	if len(attachmentNames) > 0 {
		attachmentInfo = buildAttachmentPrompt(attachmentNames)
	}
	textAttachmentContent := formatAttachmentTexts(attachmentTexts, "【文本附件内容】")

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPromptText := fmt.Sprintf(getReviewUserPromptTemplateForFile(),
		mainFileName,
		attachmentInfo+textAttachmentContent,
		base.MetaJSON,
		base.FieldState,
		base.ClosestPapersInfo,
		base.GapsInfo,
		base.RefsStr)

	contentParts := buildMultimodalContent(files, userPromptText)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}

	caller := func(ctx context.Context) (string, error) {
		resp, err := s.aiService.ChatCompletionWithModel(ctx, messages, nil, "", modelConfig.BaseURL, modelConfig.APIKey, modelConfig.ModelName)
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", nil
		}
		return resp.Choices[0].Message.Content, nil
	}

	return s.runReviewRetryLoop(ctx, taskID, fmt.Sprintf("%s 正在生成审稿报告...", reviewerName),
		[]any{"mode", "file", "reviewer", reviewerName, "model", modelConfig.ModelName, "file_count", len(files)},
		writer, caller)
}

// splitFileRoles 把 files 拆成主稿件文件名和附件文件名列表
func splitFileRoles(files []FileForAI) (mainFileName string, attachmentNames []string) {
	for _, f := range files {
		if f.Role == FileRoleManuscript {
			mainFileName = f.FileName
		} else {
			attachmentNames = append(attachmentNames, f.FileName)
		}
	}
	return
}

// buildMultimodalContent 组装多模态 content：先文件再文本
func buildMultimodalContent(files []FileForAI, userPromptText string) []any {
	parts := make([]any, 0, len(files)+1)
	for _, f := range files {
		parts = append(parts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName,
		})
	}
	parts = append(parts, ai.TextContent{Type: "text", Text: userPromptText})
	return parts
}

// buildAttachmentPrompt 构建增强的附件处理提示词
// 根据附件文件名智能推断附件类型，并生成针对性的审稿指导
func buildAttachmentPrompt(attachmentNames []string) string {
	if len(attachmentNames) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("\n\n**附件文件（共 %d 个）**：\n", len(attachmentNames)))

	// 分类附件
	var figures, tables, data, code, supplementary, other []string

	for _, name := range attachmentNames {
		nameLower := strings.ToLower(name)

		switch {
		case strings.Contains(nameLower, "fig") || strings.Contains(nameLower, "figure") ||
			strings.Contains(nameLower, "图") || strings.HasSuffix(nameLower, ".png") ||
			strings.HasSuffix(nameLower, ".jpg") || strings.HasSuffix(nameLower, ".jpeg") ||
			strings.HasSuffix(nameLower, ".svg") || strings.HasSuffix(nameLower, ".tif") ||
			strings.HasSuffix(nameLower, ".tiff"):
			figures = append(figures, name)

		case strings.Contains(nameLower, "table") || strings.Contains(nameLower, "表") ||
			strings.HasSuffix(nameLower, ".xlsx") || strings.HasSuffix(nameLower, ".xls") ||
			strings.HasSuffix(nameLower, ".csv"):
			tables = append(tables, name)

		case strings.Contains(nameLower, "data") || strings.Contains(nameLower, "数据") ||
			strings.HasSuffix(nameLower, ".json") || strings.HasSuffix(nameLower, ".xml"):
			data = append(data, name)

		case strings.Contains(nameLower, "code") || strings.Contains(nameLower, "代码") ||
			strings.HasSuffix(nameLower, ".py") || strings.HasSuffix(nameLower, ".ipynb") ||
			strings.HasSuffix(nameLower, ".r") || strings.HasSuffix(nameLower, ".m") ||
			strings.HasSuffix(nameLower, ".zip") || strings.HasSuffix(nameLower, ".tar"):
			code = append(code, name)

		case strings.Contains(nameLower, "suppl") || strings.Contains(nameLower, "appendix") ||
			strings.Contains(nameLower, "附录") || strings.Contains(nameLower, "补充"):
			supplementary = append(supplementary, name)

		default:
			other = append(other, name)
		}
	}

	if len(figures) > 0 {
		sb.WriteString(fmt.Sprintf("- 图片/图表文件：%s\n", strings.Join(figures, "、")))
	}
	if len(tables) > 0 {
		sb.WriteString(fmt.Sprintf("- 表格数据文件：%s\n", strings.Join(tables, "、")))
	}
	if len(data) > 0 {
		sb.WriteString(fmt.Sprintf("- 数据文件：%s\n", strings.Join(data, "、")))
	}
	if len(code) > 0 {
		sb.WriteString(fmt.Sprintf("- 代码/程序文件：%s\n", strings.Join(code, "、")))
	}
	if len(supplementary) > 0 {
		sb.WriteString(fmt.Sprintf("- 补充材料：%s\n", strings.Join(supplementary, "、")))
	}
	if len(other) > 0 {
		sb.WriteString(fmt.Sprintf("- 其他附件：%s\n", strings.Join(other, "、")))
	}

	sb.WriteString("\n**附件审稿要求**：\n")

	if len(figures) > 0 {
		sb.WriteString(`- **图片/图表审查**：
  - 检查图片分辨率、清晰度是否满足出版要求
  - 评估图表设计是否清晰、美观、信息传达有效
  - 核实图表标注、图例是否完整准确
  - 检查图表数据是否与正文描述一致
`)
	}

	if len(tables) > 0 {
		sb.WriteString(`- **表格数据审查**：
  - 核实表格数据完整性和格式规范性
  - 检查数值精度、单位是否合理
  - 评估表格呈现方式是否便于理解
`)
	}

	if len(data) > 0 || len(code) > 0 {
		sb.WriteString(`- **数据/代码审查**：
  - 评估数据集描述是否充分（来源、采集方式、预处理步骤）
  - 检查代码结构是否清晰、是否有必要的注释
  - 评估可复现性：是否提供了运行环境说明、依赖列表
  - 关注潜在的数据泄露或过拟合风险
`)
	}

	if len(supplementary) > 0 {
		sb.WriteString(`- **补充材料审查**：
  - 评估补充材料与主稿件的关联性和必要性
  - 检查补充实验/分析是否支持主稿件的核心论点
  - 判断哪些内容应该放入主稿件正文
`)
	}

	sb.WriteString(`
**综合评审要点**：
1. 所有附件材料应与正文内容相互印证，不应存在矛盾
2. 附件应增强而非替代正文的说明，核心方法和结果应在正文中充分阐述
3. 请在审稿报告中明确引用附件内容（如"附件图1显示..."、"代码中的X模块..."）
4. 如发现附件质量问题，请在 critical_issues 或 other_suggestions 中具体指出
`)

	return sb.String()
}

// convertMessages 转换消息类型为 ai.ChatMessage
func convertMessages(msgs []Message) []ai.ChatMessage {
	result := make([]ai.ChatMessage, len(msgs))
	for i, m := range msgs {
		result[i] = ai.ChatMessage{Role: m.Role, Content: m.Content}
	}
	return result
}

// needsContinuation 检查审稿报告是否需要续写（JSON 格式检查）
func (s *Service) needsContinuation(content string) bool {
	content = strings.TrimSpace(content)
	contentLen := len(content)

	if contentLen < 500 {
		slog.Debug("needsContinuation: content too short", "content_length", contentLen)
		return true
	}

	trimmed := strings.TrimSpace(content)

	if strings.HasPrefix(trimmed, "```json") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
	} else if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```")
	}
	if strings.HasSuffix(trimmed, "```") {
		trimmed = strings.TrimSuffix(trimmed, "```")
	}
	trimmed = strings.TrimSpace(trimmed)

	if !strings.HasSuffix(trimmed, "}") {
		suffix := trimmed
		if len(suffix) > 50 {
			suffix = suffix[len(suffix)-50:]
		}
		slog.Debug("needsContinuation: not ending with }", "suffix", suffix)
		return true
	}

	openBraces := strings.Count(trimmed, "{")
	closeBraces := strings.Count(trimmed, "}")
	if openBraces != closeBraces {
		slog.Debug("needsContinuation: brace mismatch", "open_braces", openBraces, "close_braces", closeBraces)
		return true
	}

	var test any
	if err := json.Unmarshal([]byte(trimmed), &test); err != nil {
		slog.Debug("needsContinuation: JSON parse failed", "err", err)
		return true
	}

	slog.Debug("needsContinuation: JSON complete", "content_length", contentLen)
	return false
}
