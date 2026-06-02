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

	"scholar-backend/internal/prompts"
	"scholar-backend/internal/thirdparty"
)

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
