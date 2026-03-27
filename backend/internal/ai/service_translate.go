// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"context"
	"fmt"
	"io"

	"scholar-backend/internal/ai/prompts"
	"scholar-backend/internal/thirdparty"
)

// StreamTranslateToChinese 流式翻译文本为中文
// 使用low级别模型进行翻译，通过SSE流式输出翻译结果
// 使用结构化XML标签约束输入输出格式
func (s *Service) StreamTranslateToChinese(ctx context.Context, text string, writer io.Writer) error {
	if text == "" {
		return fmt.Errorf("text is required for translation")
	}

	if len(text) > 10000 {
		return fmt.Errorf("text exceeds 10000 characters limit")
	}

	translatePrompt := fmt.Sprintf(`<translate_input>
%s
</translate_input>

你是一位专业的学术翻译专家。请将上述<translate_input>标签中的英文学术文本翻译成流畅、准确的中文。

翻译要求：
1. 保持学术术语的准确性和专业性
2. 确保译文通顺自然，符合中文学术表达习惯
3. 专有名词可保留英文原文或采用通用中文译法
4. 只输出翻译结果，不要添加任何解释、注释或XML标签

请直接输出翻译后的中文内容：`, text)

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: translatePrompt,
		},
	}

	return s.StreamChatCompletionWithLevel(ctx, messages, writer, thirdparty.ModelLevelLow)
}

// StreamTranslatePaperToChinese 流式翻译论文（标题+摘要+TLDR）为中文
// 使用low级别模型进行翻译，通过SSE流式输出翻译结果
// 使用结构化XML标签约束输入输出格式，一次性翻译三个字段
func (s *Service) StreamTranslatePaperToChinese(ctx context.Context, title, abstract, tldr string, writer io.Writer) error {
	if title == "" && abstract == "" && tldr == "" {
		return fmt.Errorf("at least one of title, abstract, or tldr is required")
	}

	totalLen := len(title) + len(abstract) + len(tldr)
	if totalLen > 20000 {
		return fmt.Errorf("total text exceeds 20000 characters limit")
	}

	translatePrompt := prompts.RenderPaperTranslationPrompt(title, abstract, tldr)

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: translatePrompt,
		},
	}

	return s.StreamChatCompletionWithLevel(ctx, messages, writer, thirdparty.ModelLevelLow)
}
