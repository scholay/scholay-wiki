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
	"regexp"
	"strings"

	"scholar-backend/internal/ai"
)

// ========== Meta-Review 提示词 ==========

// getMetaReviewSystemPrompt 获取 Meta-Review 系统提示词
func getMetaReviewSystemPrompt() string {
	return `你是一名 Meta-Reviewer（元审稿人）。你的任务是阅读 Reviewer A、Reviewer B、Reviewer C 的三份结构化 JSON 审稿意见，并将它们合并为一份结构统一、逻辑一致的最终审稿报告。

===========================================
【合并规则（Meta-Review 必须遵守）】
===========================================

（1）最终输出必须保持以下固定 JSON 结构：

{
  "overall_assessment": { ... },
  "critical_issues": [ ... ],
  "other_suggestions": [ ... ],
  "extended_review_items": { ... }
}

不得增加字段，不得减少字段。

（2）冲突处理方式：

- 若两份审稿意见一致 → 视为主流观点，应在最终稿中体现
- 若三份意见完全不同 → 使用"部分审稿人认为……另一些认为……"的中立表达总结
- 若某份意见明显离群或不合理 → 自动弱化其权重

（3）最终 recommendation 合成规则（只能选以下四个值）：
Accept / Minor Revision / Major Revision / Reject

决策逻辑：
- 多数为 Accept/MR → Minor Revision
- 多数为 MR/MJ → Major Revision
- 至少两人 Reject → Reject
- 意见严重冲突 → Major Revision

（4）critical_issues（必须解决的问题）合并方式：

- 来自不同审稿人的同类问题 → 合并为一条，并进行统一描述
- 必须包括 issue_title / description / required_actions / affected_sections
- affected_sections 应合并所有审稿人指出的位置

（5）other_suggestions（非关键修改建议）：

- 去重、合并相似建议
- 必须包含具体位置，如 Section 2、Figure 3、Page 7 等
- 必须包含 rationale（提出建议的理由）

（6）extended_review_items：

- 对三份审稿意见进行 meta-level 总结
- 对一致意见进行凝练表达
- 对分歧意见使用平衡描述
- 语言必须保持客观、学术化

===========================================
【输出要求】
===========================================

- 只输出最终 JSON
- 不要输出解析过程、不使用 Markdown、不添加解释
- JSON 必须符合标准格式，可以被自动解析`
}

// getMetaReviewUserPrompt 获取 Meta-Review 用户提示词
func getMetaReviewUserPrompt() string {
	return `===========================================
【输入格式】
===========================================

三位审稿人的审稿意见如下：

%s

其中：
- reviewer_A（审稿人 Alpha）的审稿 JSON 输出
- reviewer_B（审稿人 Beta）的审稿 JSON 输出
- reviewer_C（审稿人 Gamma）的审稿 JSON 输出

三份内容都遵循审稿 JSON 模板结构。

===========================================
【最终输出结构（必须完全保持一致）】
===========================================

请输出以下结构的 JSON：

{
  "overall_assessment": {
    "core_contribution": "（综合三位审稿人意见，总结论文核心贡献）",
    "recommendation": "Accept | Minor Revision | Major Revision | Reject",
    "reject_advice": "（若为 Reject 必填：综合建议。若非 Reject 则留空。）"
  },

  "critical_issues": [
    {
      "issue_title": "（合并后的关键问题标题）",
      "issue_description": "（综合描述问题，注明哪些审稿人提出）",
      "required_actions": "（综合的修改建议）",
      "affected_sections": ["（合并所有审稿人指出的章节）"]
    }
  ],

  "other_suggestions": [
    {
      "suggestion_title": "（合并后的建议标题）",
      "suggestion_description": "（综合描述建议内容）",
      "suggestion_location": "（具体位置，如 Section 2、Figure 3、Page 7 等）",
      "suggestion_rationale": "（提出建议的理由）"
    }
  ],

  "extended_review_items": {
    "novelty_evaluation": "（综合三位审稿人对新颖性的评价）",
    "technical_soundness": "（综合技术严谨性评价）",
    "clarity_and_presentation": "（综合清晰度评价）",
    "reproducibility": {
      "data_availability": "（综合数据可用性评价）",
      "code_availability": "（综合代码可用性评价）"
    },
    "ethical_considerations": "（综合伦理考量，若不适用填"不适用"）",
    "impact_and_significance": "（综合影响力评价）",
    "recommend_for_improvement": "（综合改进建议）"
  }
}`
}

// ========== 审稿报告生成方法 ==========

// generateReviewForTask 为任务生成审稿报告（非流式，但更新进度）
// reviewerIndex: 审稿人索引 (1-3)，用于选择差异化的审稿视角
// attachmentTexts: 文本模式附件的内容列表
func (s *Service) generateReviewForTask(
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
	// 构建参考文献字符串
	refsStr := s.formatRefsForPrompt(refs)
	metaJSON, _ := json.Marshal(meta)

	closestPapersInfo := ""
	if len(summary.ClosestPapers) > 0 {
		var sb strings.Builder
		for i, p := range summary.ClosestPapers {
			sb.WriteString(fmt.Sprintf("%d. %s (%d) - 相似原因: %s\n", i+1, p.Title, p.Year, p.Reason))
		}
		closestPapersInfo = sb.String()
	}

	gapsInfo := ""
	if len(summary.TypicalGaps) > 0 {
		gapsInfo = "- " + strings.Join(summary.TypicalGaps, "\n- ")
	}

	// 文字模式：主稿件最多 50000 字符（与保存草稿的限制一致）
	const maxManuscriptLength = 50000
	truncatedText := manuscriptText
	if len(truncatedText) > maxManuscriptLength {
		truncatedText = truncatedText[:maxManuscriptLength]
	}

	// 构建附件文本内容
	attachmentTextContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		attachmentTextContent = sb.String()
	}

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPrompt := fmt.Sprintf(getReviewUserPromptTemplate(),
		truncatedText+attachmentTextContent, // 将附件文本追加到主稿件后面
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr)

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	level := getModelLevel(modelLevel)

	// 最多重试3次（如果JSON不完整则重试，不再续写）
	const maxRetries = 3

	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, "正在生成审稿报告...")

		slog.Info("calling AI for text review", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "max_retries", maxRetries, "level", level, "text_length", len(truncatedText))

		response, err := s.aiService.ChatCompletionWithTools(context.Background(), convertMessages(messages), nil, "", level)
		if err != nil {
			slog.Error("AI text call failed", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "err", err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			slog.Warn("AI returned empty choices (text mode)", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		slog.Debug("AI text response received", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "content_length", len(content))

		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			slog.Info("text review complete", "task_id", taskID, "reviewer_index", reviewerIndex, "total_length", writer.Len())
			return nil
		}

		// JSON不完整，记录日志并重试
		slog.Warn("invalid JSON response, will retry", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt)

		if attempt == maxRetries {
			// 最后一次尝试，即使JSON不完整也接受
			writer.WriteString(content)
			slog.Warn("using incomplete JSON after max attempts", "max_retries", maxRetries, "task_id", taskID, "reviewer_index", reviewerIndex)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
}

// generateReviewForTaskWithModel 使用指定模型生成审稿报告（文本模式）
func (s *Service) generateReviewForTaskWithModel(
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

	// 构建参考文献字符串
	refsStr := s.formatRefsForPrompt(refs)
	metaJSON, _ := json.Marshal(meta)

	closestPapersInfo := ""
	if len(summary.ClosestPapers) > 0 {
		var sb strings.Builder
		for i, p := range summary.ClosestPapers {
			sb.WriteString(fmt.Sprintf("%d. %s (%d) - 相似原因: %s\n", i+1, p.Title, p.Year, p.Reason))
		}
		closestPapersInfo = sb.String()
	}

	gapsInfo := ""
	if len(summary.TypicalGaps) > 0 {
		gapsInfo = "- " + strings.Join(summary.TypicalGaps, "\n- ")
	}

	// 文字模式：主稿件最多 50000 字符
	const maxManuscriptLength = 50000
	truncatedText := manuscriptText
	if len(truncatedText) > maxManuscriptLength {
		truncatedText = truncatedText[:maxManuscriptLength]
	}

	// 构建附件文本内容
	attachmentTextContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		attachmentTextContent = sb.String()
	}

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPrompt := fmt.Sprintf(getReviewUserPromptTemplate(),
		truncatedText+attachmentTextContent,
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	// 最多重试3次
	const maxRetries = 3

	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, fmt.Sprintf("%s 正在生成审稿报告...", reviewerName))

		slog.Info("calling AI for text review with model", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "max_retries", maxRetries, "model", modelConfig.ModelName, "text_length", len(truncatedText))

		response, err := s.aiService.ChatCompletionWithModel(context.Background(), messages, nil, "", modelConfig.BaseURL, modelConfig.APIKey, modelConfig.ModelName)
		if err != nil {
			slog.Error("AI text call failed", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "err", err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			slog.Warn("AI returned empty choices (text mode)", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		slog.Debug("AI text response received", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "content_length", len(content))

		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			slog.Info("text review complete", "task_id", taskID, "reviewer", reviewerName, "total_length", writer.Len())
			return nil
		}

		// JSON不完整，记录日志并重试
		slog.Warn("invalid JSON response, will retry", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt)

		if attempt == maxRetries {
			// 最后一次尝试，即使JSON不完整也接受
			writer.WriteString(content)
			slog.Warn("using incomplete JSON after max attempts", "max_retries", maxRetries, "task_id", taskID, "reviewer", reviewerName)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
}

// generateReviewForTaskHybrid 为任务生成审稿报告（混合模式：文本主稿件 + PDF 附件）
// 用于主稿件是 Word 等文本格式，但有 PDF 附件需要传递的情况
func (s *Service) generateReviewForTaskHybrid(
	manuscriptText string,
	pdfAttachments []FileForAI, // PDF 附件文件
	attachmentTexts []map[string]string, // 文本模式附件的内容
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
) error {
	// 构建参考文献字符串
	refsStr := s.formatRefsForPrompt(refs)
	metaJSON, _ := json.Marshal(meta)

	closestPapersInfo := ""
	if len(summary.ClosestPapers) > 0 {
		var sb strings.Builder
		for i, p := range summary.ClosestPapers {
			sb.WriteString(fmt.Sprintf("%d. %s (%d) - 相似原因: %s\n", i+1, p.Title, p.Year, p.Reason))
		}
		closestPapersInfo = sb.String()
	}

	gapsInfo := ""
	if len(summary.TypicalGaps) > 0 {
		gapsInfo = "- " + strings.Join(summary.TypicalGaps, "\n- ")
	}

	// 文字模式：主稿件最多 50000 字符
	const maxManuscriptLength = 50000
	truncatedText := manuscriptText
	if len(truncatedText) > maxManuscriptLength {
		truncatedText = truncatedText[:maxManuscriptLength]
	}

	// 构建 PDF 附件名列表
	var pdfAttachmentNames []string
	for _, f := range pdfAttachments {
		pdfAttachmentNames = append(pdfAttachmentNames, f.FileName)
	}

	// 构建附件提示信息
	attachmentInfo := ""
	if len(pdfAttachmentNames) > 0 {
		attachmentInfo = buildAttachmentPrompt(pdfAttachmentNames)
	}

	// 添加文本模式附件的内容
	textAttachmentContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【文本附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		textAttachmentContent = sb.String()
	}

	systemPrompt := getReviewSystemPrompt(reviewerIndex)

	// 使用混合模式的提示词模板（类似文件模式，但主稿件是文本）
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
		truncatedText,
		attachmentInfo,
		textAttachmentContent,
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr)

	// 构建多模态消息
	contentParts := make([]any, 0, len(pdfAttachments)+1)

	// 先添加 PDF 附件文件
	for _, f := range pdfAttachments {
		contentParts = append(contentParts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName,
		})
	}

	// 最后添加文本提示
	contentParts = append(contentParts, ai.TextContent{
		Type: "text",
		Text: userPromptText,
	})

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}

	level := getModelLevel(modelLevel)

	// 最多重试3次
	const maxRetries = 3

	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, "正在生成审稿报告...")

		slog.Info("calling AI for hybrid review", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "max_retries", maxRetries, "level", level, "text_length", len(truncatedText), "pdf_count", len(pdfAttachments))

		response, err := s.aiService.ChatCompletionWithTools(context.Background(), messages, nil, "", level)
		if err != nil {
			slog.Error("AI hybrid call failed", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "err", err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			slog.Warn("AI returned empty choices (hybrid mode)", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		slog.Debug("AI hybrid response received", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "content_length", len(content))

		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			slog.Info("hybrid review complete", "task_id", taskID, "reviewer_index", reviewerIndex, "total_length", writer.Len())
			return nil
		}

		// JSON不完整，记录日志并重试
		slog.Warn("invalid JSON response (hybrid), will retry", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt)

		if attempt == maxRetries {
			writer.WriteString(content)
			slog.Warn("using incomplete JSON after max attempts (hybrid)", "max_retries", maxRetries, "task_id", taskID, "reviewer_index", reviewerIndex)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
}

// generateReviewForTaskHybridWithModel 使用指定模型生成审稿报告（混合模式：文本主稿件 + PDF 附件）
func (s *Service) generateReviewForTaskHybridWithModel(
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

	// 构建参考文献字符串
	refsStr := s.formatRefsForPrompt(refs)
	metaJSON, _ := json.Marshal(meta)

	closestPapersInfo := ""
	if len(summary.ClosestPapers) > 0 {
		var sb strings.Builder
		for i, p := range summary.ClosestPapers {
			sb.WriteString(fmt.Sprintf("%d. %s (%d) - 相似原因: %s\n", i+1, p.Title, p.Year, p.Reason))
		}
		closestPapersInfo = sb.String()
	}

	gapsInfo := ""
	if len(summary.TypicalGaps) > 0 {
		gapsInfo = "- " + strings.Join(summary.TypicalGaps, "\n- ")
	}

	// 文字模式：主稿件最多 50000 字符
	const maxManuscriptLength = 50000
	truncatedText := manuscriptText
	if len(truncatedText) > maxManuscriptLength {
		truncatedText = truncatedText[:maxManuscriptLength]
	}

	// 构建附件文本内容
	attachmentTextContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		attachmentTextContent = sb.String()
	}

	// 收集附件文件名用于构建智能提示
	var attachmentNames []string
	for _, f := range pdfAttachments {
		attachmentNames = append(attachmentNames, f.FileName)
	}
	attachmentPrompt := buildAttachmentPrompt(attachmentNames)

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPromptText := fmt.Sprintf(getReviewUserPromptTemplateForFile(),
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr) + attachmentTextContent + attachmentPrompt

	// 构建多模态消息
	contentParts := []any{}

	// 添加 PDF 附件
	for _, f := range pdfAttachments {
		contentParts = append(contentParts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName,
		})
	}

	// 添加文本内容
	contentParts = append(contentParts, ai.TextContent{
		Type: "text",
		Text: "【主稿件内容】\n" + truncatedText + "\n\n" + userPromptText,
	})

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}

	// 最多重试3次
	const maxRetries = 3

	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, fmt.Sprintf("%s 正在生成审稿报告...", reviewerName))

		slog.Info("calling AI for hybrid review with model", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "max_retries", maxRetries, "model", modelConfig.ModelName, "text_length", len(truncatedText), "pdf_count", len(pdfAttachments))

		response, err := s.aiService.ChatCompletionWithModel(context.Background(), messages, nil, "", modelConfig.BaseURL, modelConfig.APIKey, modelConfig.ModelName)
		if err != nil {
			slog.Error("AI hybrid call failed", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "err", err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			slog.Warn("AI returned empty choices (hybrid mode)", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		slog.Debug("AI hybrid response received", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "content_length", len(content))

		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			slog.Info("hybrid review complete", "task_id", taskID, "reviewer", reviewerName, "total_length", writer.Len())
			return nil
		}

		// JSON不完整，记录日志并重试
		slog.Warn("invalid JSON response (hybrid), will retry", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt)

		if attempt == maxRetries {
			writer.WriteString(content)
			slog.Warn("using incomplete JSON after max attempts (hybrid)", "max_retries", maxRetries, "task_id", taskID, "reviewer", reviewerName)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
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

		// 根据文件名模式分类
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

	// 生成分类列表
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

	// 添加针对性的审稿指导
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

// generateReviewForTaskWithFile 为任务生成审稿报告（文件输入，非流式，但更新进度）
// reviewerIndex: 审稿人索引 (1-3)，用于选择差异化的审稿视角
// attachmentTexts: 文本模式附件的内容列表（Word/RTF/ODT 等格式提取的文本）
func (s *Service) generateReviewForTaskWithFile(
	files []FileForAI, // 支持多文件：主稿件 + PDF 附件
	attachmentTexts []map[string]string, // 文本模式附件的内容
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
) error {
	// 构建参考文献字符串
	refsStr := s.formatRefsForPrompt(refs)
	metaJSON, _ := json.Marshal(meta)

	closestPapersInfo := ""
	if len(summary.ClosestPapers) > 0 {
		var sb strings.Builder
		for i, p := range summary.ClosestPapers {
			sb.WriteString(fmt.Sprintf("%d. %s (%d) - 相似原因: %s\n", i+1, p.Title, p.Year, p.Reason))
		}
		closestPapersInfo = sb.String()
	}

	gapsInfo := ""
	if len(summary.TypicalGaps) > 0 {
		gapsInfo = "- " + strings.Join(summary.TypicalGaps, "\n- ")
	}

	// 构建文件列表描述（PDF 文件）
	var mainFileName string
	var attachmentNames []string
	for _, f := range files {
		if f.Role == FileRoleManuscript {
			mainFileName = f.FileName
		} else {
			attachmentNames = append(attachmentNames, f.FileName)
		}
	}

	// 构建附件提示信息（包括 PDF 附件名和文本附件内容）
	attachmentInfo := ""
	if len(attachmentNames) > 0 {
		attachmentInfo = buildAttachmentPrompt(attachmentNames)
	}

	// 添加文本模式附件的内容到提示词中
	textAttachmentContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【文本附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		textAttachmentContent = sb.String()
	}

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPromptText := fmt.Sprintf(getReviewUserPromptTemplateForFile(),
		mainFileName,
		attachmentInfo+textAttachmentContent, // 包含 PDF 附件名和文本附件内容
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr)

	// 构建多模态消息，使用 FileInputMeta 作为中间格式
	// AI service 会根据实际使用的模型自动转换为对应格式
	contentParts := make([]any, 0, len(files)+1)

	// 先添加所有文件（主稿件在前，附件在后）
	for _, f := range files {
		contentParts = append(contentParts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName, // 传递文件名，用于 GPT 模型
		})
	}

	// 最后添加文本提示
	contentParts = append(contentParts, ai.TextContent{
		Type: "text",
		Text: userPromptText,
	})

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}

	level := getModelLevel(modelLevel)

	// 最多重试3次（如果JSON不完整则重试，不再续写）
	const maxRetries = 3

	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, "正在生成审稿报告...")

		slog.Info("calling AI for file review", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "max_retries", maxRetries, "level", level, "file_count", len(files))

		response, err := s.aiService.ChatCompletionWithTools(context.Background(), messages, nil, "", level)
		if err != nil {
			slog.Error("AI call failed", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "err", err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			slog.Warn("AI returned empty choices", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		slog.Debug("AI response received", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt, "content_length", len(content))

		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			slog.Info("review content complete", "task_id", taskID, "reviewer_index", reviewerIndex, "total_length", writer.Len())
			return nil
		}

		// JSON不完整，记录日志并重试
		slog.Warn("invalid JSON response, will retry", "task_id", taskID, "reviewer_index", reviewerIndex, "attempt", attempt)

		if attempt == maxRetries {
			// 最后一次尝试，即使JSON不完整也接受
			writer.WriteString(content)
			slog.Warn("using incomplete JSON after max attempts", "max_retries", maxRetries, "task_id", taskID, "reviewer_index", reviewerIndex)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
}

// generateReviewForTaskWithFileAndModel 使用指定模型生成审稿报告（文件输入模式）
func (s *Service) generateReviewForTaskWithFileAndModel(
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

	// 构建参考文献字符串
	refsStr := s.formatRefsForPrompt(refs)
	metaJSON, _ := json.Marshal(meta)

	closestPapersInfo := ""
	if len(summary.ClosestPapers) > 0 {
		var sb strings.Builder
		for i, p := range summary.ClosestPapers {
			sb.WriteString(fmt.Sprintf("%d. %s (%d) - 相似原因: %s\n", i+1, p.Title, p.Year, p.Reason))
		}
		closestPapersInfo = sb.String()
	}

	gapsInfo := ""
	if len(summary.TypicalGaps) > 0 {
		gapsInfo = "- " + strings.Join(summary.TypicalGaps, "\n- ")
	}

	// 构建文件列表描述
	var mainFileName string
	var attachmentNames []string
	for _, f := range files {
		if f.Role == FileRoleManuscript {
			mainFileName = f.FileName
		} else {
			attachmentNames = append(attachmentNames, f.FileName)
		}
	}

	// 构建附件提示信息
	attachmentInfo := ""
	if len(attachmentNames) > 0 {
		attachmentInfo = buildAttachmentPrompt(attachmentNames)
	}

	// 添加文本模式附件的内容到提示词中
	textAttachmentContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【文本附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		textAttachmentContent = sb.String()
	}

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPromptText := fmt.Sprintf(getReviewUserPromptTemplateForFile(),
		mainFileName,
		attachmentInfo+textAttachmentContent,
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr)

	// 构建多模态消息
	contentParts := make([]any, 0, len(files)+1)

	// 先添加所有文件
	for _, f := range files {
		contentParts = append(contentParts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName,
		})
	}

	// 最后添加文本提示
	contentParts = append(contentParts, ai.TextContent{
		Type: "text",
		Text: userPromptText,
	})

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}

	// 最多重试3次
	const maxRetries = 3

	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, fmt.Sprintf("%s 正在生成审稿报告...", reviewerName))

		slog.Info("calling AI for file review with model", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "max_retries", maxRetries, "model", modelConfig.ModelName, "file_count", len(files))

		response, err := s.aiService.ChatCompletionWithModel(context.Background(), messages, nil, "", modelConfig.BaseURL, modelConfig.APIKey, modelConfig.ModelName)
		if err != nil {
			slog.Error("AI call failed", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "err", err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			slog.Warn("AI returned empty choices", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		slog.Debug("AI response received", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt, "content_length", len(content))

		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			slog.Info("file review complete", "task_id", taskID, "reviewer", reviewerName, "total_length", writer.Len())
			return nil
		}

		// JSON不完整，记录日志并重试
		slog.Warn("invalid JSON response, will retry", "task_id", taskID, "reviewer", reviewerName, "attempt", attempt)

		if attempt == maxRetries {
			writer.WriteString(content)
			slog.Warn("using incomplete JSON after max attempts", "max_retries", maxRetries, "task_id", taskID, "reviewer", reviewerName)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
}

// ========== 提示词模板 ==========

// getReviewUserPromptTemplateForFile 获取文件版本的用户提示词模板（PDF、Word等）
func getReviewUserPromptTemplateForFile() string {
	return `## 待审稿件
**主稿件**：%s%s

请仔细阅读附件中的论文文件进行审稿。

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

请基于以上所有信息和附件中的论文文件，生成一份专业的审稿报告。报告**必须**优先并聚焦于指出问题。

**重要：你必须严格按照以下 JSON 格式输出审稿报告，不要输出任何其他内容（包括 markdown 代码块标记）：**

{
  "overall_assessment": {
    "core_contribution": "（简要总结你理解的论文核心贡献。要求：高度凝练、客观、避免套话。）",
    "recommendation": "Accept | Minor Revision | Major Revision | Reject",
    "reject_advice": "（若为 Reject 必填：请给出清晰、建设性的转投建议或重做方向。若非 Reject 则留空。）"
  },

  "critical_issues": [
    {
      "issue_title": "（关键问题标题：如原创性不足、贡献不清、方法重大缺陷等）",
      "issue_description": "（明确指出问题是什么、为什么严重、为何阻碍论文达标。引用相关文献 [Rx] 作为依据。）",
      "required_actions": "（作者必须具体采取哪些补救措施？给出可执行的修改方案。）",
      "affected_sections": ["（该问题对应的章节，如：Introduction, Methodology, Section 3.2 等）"]
    }
  ],

  "other_suggestions": [
    {
      "suggestion_title": "（次要建议标题，如：图表规范性、文献补充等）",
      "suggestion_description": "（描述建议内容本身。）",
      "suggestion_location": "（具体位置：图3、图5、Introduction 第三段、Table 2 附近等）",
      "suggestion_rationale": "（为何建议？提升可读性？规范性？复现性？）"
    }
  ],

  "extended_review_items": {
    "novelty_evaluation": "（论文相对现有文献的创新点评价，指出是否足够新。必须对照提供的相似论文进行判断。）",
    "technical_soundness": "（方法是否严谨？实验是否可靠？是否存在设计偏差？）",
    "clarity_and_presentation": "（写作质量评估：结构、逻辑、语言、可读性。）",
    "reproducibility": {
      "data_availability": "（数据集是否公开？是否描述充分？）",
      "code_availability": "（代码是否提供？能否支持复现？）"
    },
    "ethical_considerations": "（如适用：是否存在伦理风险、数据偏差、人群隐私问题？若不适用请填写"不适用"。）",
    "impact_and_significance": "（对学术界/产业界的潜在影响力评价。）",
    "recommend_for_improvement": "（若作者未来想提升质量，应加强哪些方面？）"
  }
}

**注意事项：**
1. critical_issues 数组中至少包含 1 个关键问题（如果论文质量很高可以只有 1 个）
2. other_suggestions 数组中至少包含 1 个改进建议
3. 所有字段都必须填写，不能留空（如不适用请明确说明"不适用"或"无"）
4. 直接输出 JSON，不要包含任何 markdown 代码块标记（如 ` + "`" + `` + "`" + `` + "`" + `json）`
}

// convertMessages 转换消息类型为 ai.ChatMessage
func convertMessages(msgs []Message) []ai.ChatMessage {
	result := make([]ai.ChatMessage, len(msgs))
	for i, m := range msgs {
		result[i] = ai.ChatMessage{Role: m.Role, Content: m.Content}
	}
	return result
}

// needsContinuation 检查审稿报告是否需要续写
// 专门用于 JSON 格式的输出检查
func (s *Service) needsContinuation(content string) bool {
	content = strings.TrimSpace(content)
	contentLen := len(content)

	// 如果内容太短，需要续写
	if contentLen < 500 {
		slog.Debug("needsContinuation: content too short", "content_length", contentLen)
		return true
	}

	// JSON 格式检查：检查是否是完整的 JSON 对象
	trimmed := strings.TrimSpace(content)

	// 移除可能的 markdown 代码块标记
	if strings.HasPrefix(trimmed, "```json") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
	} else if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```")
	}
	if strings.HasSuffix(trimmed, "```") {
		trimmed = strings.TrimSuffix(trimmed, "```")
	}
	trimmed = strings.TrimSpace(trimmed)

	// 检查是否以 } 结尾
	if !strings.HasSuffix(trimmed, "}") {
		// 显示最后50个字符用于调试
		suffix := trimmed
		if len(suffix) > 50 {
			suffix = suffix[len(suffix)-50:]
		}
		slog.Debug("needsContinuation: not ending with }", "suffix", suffix)
		return true // JSON 不完整，需要续写
	}

	// 检查括号是否匹配
	openBraces := strings.Count(trimmed, "{")
	closeBraces := strings.Count(trimmed, "}")
	if openBraces != closeBraces {
		slog.Debug("needsContinuation: brace mismatch", "open_braces", openBraces, "close_braces", closeBraces)
		return true // 括号不匹配，需要续写
	}

	// 尝试解析 JSON 验证完整性
	var test any
	if err := json.Unmarshal([]byte(trimmed), &test); err != nil {
		slog.Debug("needsContinuation: JSON parse failed", "err", err)
		return true // JSON 解析失败，可能不完整
	}

	// JSON 完整
	slog.Debug("needsContinuation: JSON complete", "content_length", contentLen)
	return false
}

// ========== JSON 解析与验证 ==========

// parseReviewJSON 解析 AI 返回的审稿报告 JSON
// 包含多层容错处理，尽最大努力解析 AI 返回的内容
func parseReviewJSON(content string) (*ReviewReportJSON, error) {
	// 清理内容：移除可能的 markdown 代码块标记
	content = strings.TrimSpace(content)

	// 移除 ```json 和 ``` 标记（支持多种变体）
	content = removeMarkdownCodeBlock(content)

	// 尝试找到 JSON 对象的边界
	jsonContent := extractJSONObject(content)
	if jsonContent == "" {
		return nil, fmt.Errorf("no valid JSON object found in content")
	}

	// 第一次尝试：直接解析
	var report ReviewReportJSON
	if err := json.Unmarshal([]byte(jsonContent), &report); err == nil {
		return &report, nil
	}

	// 第二次尝试：修复常见的 JSON 格式问题
	fixedJSON := fixCommonJSONIssues(jsonContent)
	if err := json.Unmarshal([]byte(fixedJSON), &report); err == nil {
		return &report, nil
	}

	// 第三次尝试：使用正则表达式提取关键字段，构建部分报告
	partialReport := extractPartialReviewFromText(content)
	if partialReport != nil {
		return partialReport, nil
	}

	return nil, fmt.Errorf("failed to parse review JSON after multiple attempts")
}

// removeMarkdownCodeBlock 移除 markdown 代码块标记
func removeMarkdownCodeBlock(content string) string {
	content = strings.TrimSpace(content)

	// 移除开头的代码块标记
	prefixes := []string{"```json", "```JSON", "```", "'''json", "'''"}
	for _, prefix := range prefixes {
		if strings.HasPrefix(content, prefix) {
			content = strings.TrimPrefix(content, prefix)
			break
		}
	}

	// 移除结尾的代码块标记
	suffixes := []string{"```", "'''"}
	for _, suffix := range suffixes {
		if strings.HasSuffix(content, suffix) {
			content = strings.TrimSuffix(content, suffix)
			break
		}
	}

	return strings.TrimSpace(content)
}

// extractJSONObject 从内容中提取 JSON 对象
func extractJSONObject(content string) string {
	// 找到第一个 { 和最后一个 }
	startIdx := strings.Index(content, "{")
	endIdx := strings.LastIndex(content, "}")

	if startIdx == -1 || endIdx == -1 || endIdx <= startIdx {
		return ""
	}

	return content[startIdx : endIdx+1]
}

// fixCommonJSONIssues 修复常见的 JSON 格式问题
func fixCommonJSONIssues(jsonContent string) string {
	// 1. 移除尾部逗号（JSON 对象和数组最后一个元素后的逗号）
	// 例如: {"a": 1,} -> {"a": 1}
	re := regexp.MustCompile(`,\s*([}\]])`)
	jsonContent = re.ReplaceAllString(jsonContent, "$1")

	// 2. 修复单引号为双引号
	// 注意：这是一个简化处理，可能在某些边缘情况下不正确
	// 但对于 AI 生成的 JSON 通常有效
	if !strings.Contains(jsonContent, `"`) && strings.Contains(jsonContent, `'`) {
		jsonContent = strings.ReplaceAll(jsonContent, `'`, `"`)
	}

	// 3. 移除控制字符（除了 \n, \r, \t）
	var cleanedBuilder strings.Builder
	for _, r := range jsonContent {
		if r >= 32 || r == '\n' || r == '\r' || r == '\t' {
			cleanedBuilder.WriteRune(r)
		}
	}
	jsonContent = cleanedBuilder.String()

	// 4. 修复未转义的换行符在字符串值中的问题
	// 这是一个启发式修复，将值中的换行替换为 \n
	jsonContent = fixUnescapedNewlines(jsonContent)

	return jsonContent
}

// fixUnescapedNewlines 修复字符串值中未转义的换行符
func fixUnescapedNewlines(jsonContent string) string {
	// 使用状态机来处理字符串内的换行
	var result strings.Builder
	inString := false
	escaped := false

	for i, r := range jsonContent {
		if escaped {
			result.WriteRune(r)
			escaped = false
			continue
		}

		if r == '\\' && inString {
			escaped = true
			result.WriteRune(r)
			continue
		}

		if r == '"' {
			inString = !inString
			result.WriteRune(r)
			continue
		}

		if inString && (r == '\n' || r == '\r') {
			// 在字符串内遇到换行，替换为 \n
			if r == '\n' {
				result.WriteString("\\n")
			}
			// 跳过 \r
			continue
		}

		// 检查是否是字符串值中的实际换行（可能是 AI 输出的格式问题）
		if inString && i > 0 {
			result.WriteRune(r)
		} else {
			result.WriteRune(r)
		}
	}

	return result.String()
}

// extractPartialReviewFromText 从文本中提取部分审稿信息（最后的容错方案）
func extractPartialReviewFromText(content string) *ReviewReportJSON {
	report := &ReviewReportJSON{}
	hasValidContent := false

	// 使用正则表达式提取关键字段

	// 1. 提取 recommendation
	recPatterns := []string{
		`"recommendation"\s*:\s*"([^"]+)"`,
		`recommendation[：:]\s*(\w+)`,
	}
	for _, pattern := range recPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.Recommendation = normalizeRecommendation(matches[1])
			hasValidContent = true
			break
		}
	}

	// 2. 提取 core_contribution
	contribPatterns := []string{
		`"core_contribution"\s*:\s*"([^"]+)"`,
		`核心贡献[：:]\s*(.+?)(?:\n|$)`,
	}
	for _, pattern := range contribPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.CoreContribution = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 3. 提取 venue_name
	venuePatterns := []string{
		`"venue_name"\s*:\s*"([^"]+)"`,
	}
	for _, pattern := range venuePatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.FitForTargetVenue.VenueName = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 4. 提取 novelty_evaluation
	noveltyPatterns := []string{
		`"novelty_evaluation"\s*:\s*"([^"]+)"`,
		`新颖性[评價评价][：:]\s*(.+?)(?:\n|$)`,
	}
	for _, pattern := range noveltyPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.ExtendedReviewItems.NoveltyEvaluation = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 5. 尝试提取 critical_issues（简化版）
	issuePattern := regexp.MustCompile(`"issue_title"\s*:\s*"([^"]+)"`)
	issueMatches := issuePattern.FindAllStringSubmatch(content, -1)
	for _, match := range issueMatches {
		if len(match) > 1 {
			report.CriticalIssues = append(report.CriticalIssues, CriticalIssue{
				IssueTitle: strings.TrimSpace(match[1]),
			})
			hasValidContent = true
		}
	}

	// 6. 如果没有从 JSON 字段提取到推荐意见，尝试从全文提取
	if report.OverallAssessment.Recommendation == "" || report.OverallAssessment.Recommendation == "Pending Review" {
		report.OverallAssessment.Recommendation = extractRecommendation(content)
		if report.OverallAssessment.Recommendation != "Pending Review" {
			hasValidContent = true
		}
	}

	if hasValidContent {
		return report
	}
	return nil
}

// normalizeRecommendation 标准化推荐意见
func normalizeRecommendation(rec string) string {
	rec = strings.TrimSpace(rec)
	recLower := strings.ToLower(rec)

	// 处理带有选项分隔符的情况，如 "Accept | Minor Revision | Major Revision | Reject"
	// 这种情况下应该返回 Pending Review，因为 AI 没有做出选择
	if strings.Contains(rec, "|") {
		return "Pending Review"
	}

	if strings.Contains(recLower, "reject") {
		return "Reject"
	}
	if strings.Contains(recLower, "major revision") || strings.Contains(recLower, "major_revision") {
		return "Major Revision"
	}
	if strings.Contains(recLower, "minor revision") || strings.Contains(recLower, "minor_revision") {
		return "Minor Revision"
	}
	if strings.Contains(recLower, "accept") {
		return "Accept"
	}

	return "Pending Review"
}

// extractRecommendation 从审稿报告中提取推荐意见（文本模式，向后兼容）
func extractRecommendation(content string) string {
	content = strings.ToLower(content)

	if strings.Contains(content, "reject") || strings.Contains(content, "拒稿") {
		return "Reject"
	}
	if strings.Contains(content, "major revision") || strings.Contains(content, "大修") {
		return "Major Revision"
	}
	if strings.Contains(content, "minor revision") || strings.Contains(content, "小修") {
		return "Minor Revision"
	}
	if strings.Contains(content, "accept") || strings.Contains(content, "接受") {
		return "Accept"
	}

	return "Pending Review"
}

// getReviewSystemPrompt 获取审稿系统提示词（根据审稿人角色差异化）
// reviewerIndex: 1=原创性与理论贡献视角, 2=方法论与技术严谨性视角, 3=清晰度、影响力与实用性视角
func getReviewSystemPrompt(reviewerIndex int) string {
	basePrompt := `## ⚠️ 最高优先级约束（必须严格遵守）

**【字符限制】你的整个 JSON 输出必须严格控制在 8000 字符以内（约 4000 汉字）。这是硬性限制，超出部分将被系统截断导致 JSON 解析失败。**

为达到此限制，你必须：
- critical_issues：最多 3 个，每个 description 控制在 80-120 字
- major_issues：最多 3 个，每个 description 控制在 80-120 字
- minor_issues：最多 3 个，每个 description 控制在 60-80 字
- other_suggestions：最多 2 个，每个 description 控制在 60-80 字
- 所有评价性文字必须精炼、直击要害，禁止冗长铺垫和重复表述

---

## 角色：严苛、精准且富有洞察的学术审稿人

你是一位以"严苛、精准、富有洞察力"而闻名的资深学术审稿专家。你坚守最高的学术标准，你的首要任务是**严格审查（Strict Scrutiny）**，以确保只有最高质量的研究得以推进。你擅长一针见血地指出研究中的**核心缺陷**和**逻辑漏洞**，同时你的反馈必须是**具体、清晰且可执行的**。

`
	// 根据审稿人索引添加差异化的审稿视角
	var roleSpecificPrompt string
	switch reviewerIndex {
	case 1:
		// Reviewer A：侧重原创性和理论贡献
		roleSpecificPrompt = `## 你的专业审稿视角：原创性与理论贡献

作为专注于**原创性与理论贡献**的审稿人，你需要特别关注：

1. **创新性深度评估**：该研究是否提出了真正新颖的观点、理论或框架？是渐进式改进还是突破性创新？
2. **理论基础审查**：研究的理论根基是否扎实？是否正确理解和引用了相关经典理论？理论推导是否严谨？
3. **学术贡献定位**：该研究在本领域知识体系中的位置和价值如何？是否填补了明确的理论空白？
4. **与已有工作的区分**：与最相似的已发表论文相比，本文的独特贡献是什么？是否存在重复发表的嫌疑？
5. **概念清晰度**：核心概念的定义是否清晰、准确？是否与现有文献中的定义一致或有合理的创新解释？

在审稿报告中，你应该重点从**原创性和理论贡献**的角度进行深入分析和批评。

`
	case 2:
		// Reviewer B：侧重方法论和技术严谨性
		roleSpecificPrompt = `## 你的专业审稿视角：方法论与技术严谨性

作为专注于**方法论与技术严谨性**的审稿人，你需要特别关注：

1. **研究设计合理性**：研究方法是否是回答研究问题的最优选择？实验设计是否科学、完整？
2. **技术实现正确性**：算法、模型或分析方法是否正确实现？是否有数学推导错误或编程逻辑问题？
3. **数据处理规范性**：数据收集、清洗、处理过程是否透明？是否存在数据偏差或选择性报告？
4. **统计分析恰当性**：统计方法选择是否正确？假设检验是否合理？显著性水平设置是否恰当？
5. **实验对照与消融**：基线选择是否合适？消融实验是否充分证明了各组件的有效性？
6. **可复现性评估**：实验细节描述是否足够详细？是否提供了复现所需的代码、数据和参数设置？

在审稿报告中，你应该重点从**方法论严谨性和技术正确性**的角度进行深入分析和批评。

`
	case 3:
		// Reviewer C：侧重清晰度、影响力和实用性
		roleSpecificPrompt = `## 你的专业审稿视角：清晰度、影响力与实用性

作为专注于**清晰度、影响力与实用性**的审稿人，你需要特别关注：

1. **写作质量与可读性**：论文结构是否清晰合理？语言表达是否准确流畅？图表是否直观易懂？
2. **论证逻辑连贯性**：从问题提出到方法设计到结果讨论，整体逻辑链条是否连贯完整？
3. **实际应用价值**：研究成果是否具有实际应用前景？对工业界或实际问题解决有何潜在贡献？
4. **学术影响力潜力**：该研究能否引发后续研究？是否可能成为该领域的重要参考文献？
5. **受众适配性**：论文的写作风格和技术深度是否适合目标期刊/会议的读者群体？
6. **局限性与未来方向**：作者是否诚实地指出了研究局限？提出的未来研究方向是否有价值？

在审稿报告中，你应该重点从**清晰度、影响力和实用性**的角度进行深入分析和批评。

`
	default:
		roleSpecificPrompt = ""
	}

	commonPrompt := `## 核心知识与能力：

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

## 格式与内容约束：

1. **必须严格按照 JSON 格式输出，不要输出任何其他内容（禁止 markdown 代码块）**
2. **引用文献时必须使用 [R1], [R2] 等编号**，只能引用提供的参考文献列表中的文献
3. **不得虚构任何文献或作者**
4. **所有关于新颖性和是否重复已有工作的判断，必须对照提供的相似论文和参考文献**
5. **批评必须具体可操作，明确指出如何修改**
6. **再次强调：总输出必须小于 8000 字符，宁可精炼深刻，不要冗长啰嗦**`

	return basePrompt + roleSpecificPrompt + commonPrompt
}

// getReviewUserPromptTemplate 获取用户提示词模板
func getReviewUserPromptTemplate() string {
	return `## 待审稿件内容
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

请基于以上信息，生成一份专业审稿报告。**必须聚焦关键问题，精炼表达。**

**硬性要求：整个 JSON 输出必须小于 8000 字符，超出将导致解析失败！**

直接输出以下 JSON 格式（不要包含 ` + "`" + `` + "`" + `` + "`" + ` 代码块标记）：

{
  "overall_assessment": {
    "core_contribution": "（50-100字，高度凝练的核心贡献总结）",
    "recommendation": "Accept | Minor Revision | Major Revision | Reject",
    "reject_advice": "（若 Reject 必填转投建议，否则留空）"
  },
  "critical_issues": [
    {
      "issue_title": "（10-20字，问题标题）",
      "issue_description": "（80-120字，问题描述，引用 [Rx]）",
      "required_actions": "（50-80字，具体修改方案）",
      "affected_sections": ["章节名"]
    }
  ],
  "other_suggestions": [
    {
      "suggestion_title": "（10-20字）",
      "suggestion_description": "（60-80字）",
      "suggestion_location": "（具体位置）",
      "suggestion_rationale": "（30-50字）"
    }
  ],
  "extended_review_items": {
    "novelty_evaluation": "（80-120字，对照相似论文判断新颖性）",
    "technical_soundness": "（60-100字）",
    "clarity_and_presentation": "（60-100字）",
    "reproducibility": {
      "data_availability": "（30-50字）",
      "code_availability": "（30-50字）"
    },
    "ethical_considerations": "（不适用则填"不适用"）",
    "impact_and_significance": "（50-80字）",
    "recommend_for_improvement": "（50-80字）"
  }
}

**约束：**
1. critical_issues: 1-3 个（聚焦最关键问题）
2. other_suggestions: 1-2 个
3. 所有字段必须填写，遵守上述字数限制
4. 直接输出纯 JSON，禁止 markdown 标记`
}

// isValidReviewJSON 检查AI返回的内容是否是有效的完整JSON
// 用于验证审稿评论的JSON格式是否正确且完整
func (s *Service) isValidReviewJSON(content string) bool {
	if content == "" {
		return false
	}

	// 清理可能的markdown代码块标记
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	// 检查是否以 { 开头，以 } 结尾
	if !strings.HasPrefix(content, "{") || !strings.HasSuffix(content, "}") {
		return false
	}

	// 尝试解析JSON以验证其有效性
	var result map[string]any
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return false
	}

	return true
}
