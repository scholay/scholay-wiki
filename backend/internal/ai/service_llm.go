// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// service_llm.go 提供 ai 域两类基础 LLM 调用工具:
//   - ChatCompletionWithTools  同步、可带 tools, 走 executeWithRetry 自动账户轮换
//   - StreamChatCompletionWithLevel  SSE 流式, 同样走 executeWithRetry
//
// 历史上还提供过 StreamChatCompletionWithToolLoop / ChatCompletionWithModel /
// StreamChatCompletion 等多种封装, 已随 latexwriter / peerreview 下线一并移除。
// 文件原名 service_chat.go, 重命名是为了消除"对话"语义的误导 —— 这里只是
// 同步/流式两种 LLM 单次调用工具, 不持有任何会话状态。

package ai

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/thirdparty"
)

// ChatCompletionWithTools 非流式同步 LLM 调用, 可带 OpenAI tools。
// 走 executeWithRetry 的账户轮换 + 断路器; 失败自动换 thirdparty 账户重试。
//
// 现役消费者: wechatofficial (自动回复) / library (导入解析) / ai/service.go
// (TranslateToEnglish, GetSearchSuggestions)。
func (s *Service) ChatCompletionWithTools(ctx context.Context, messages []ChatMessage, tools []Tool, toolChoice string, modelLevel thirdparty.ModelLevel) (*ChatCompletionResponse, error) {
	result, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, error) {
		// modelLevel 已由 thirdparty 解析成具体模型编码放进 ModelLow;为空说明
		// admin 没给该 level 配模型,直接报错而不是兜底到某个写死的模型。
		modelCode := config.ModelLow
		if modelCode == "" {
			return nil, fmt.Errorf("no model configured for level %q", modelLevel)
		}
		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    ConvertMessagesForModel(messages, modelCode),
			Tools:       tools,
			ToolChoice:  toolChoice,
			Stream:      false,
			Temperature: defaultLLMTemperature,
			MaxTokens:   defaultLLMMaxTokens,
		}
		// 走 common/upstream (breaker=ai_llm + typed error + 观测); 失败 typed error
		// 由 executeWithRetry 判 ErrAuth/ErrRateLimit/... 换账户重试。
		return doChatCompletion(ctx, config.BaseURL, config.APIKey, reqBody)
	})
	if err != nil {
		return nil, err
	}
	return result.(*ChatCompletionResponse), nil
}

// StreamChatCompletionWithLevel SSE 流式 LLM 调用。
// 走 executeWithRetry 账户轮换 + AIServiceStreamBreaker 断路器。
//
// 现役消费者: ai/service_translate.go (StreamTranslateToChinese / StreamTranslatePaperToChinese)。
func (s *Service) StreamChatCompletionWithLevel(ctx context.Context, messages []ChatMessage, writer io.Writer, modelLevel thirdparty.ModelLevel) error {
	_, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, error) {
		modelCode := config.ModelLow
		if modelCode == "" {
			return nil, fmt.Errorf("no model configured for level %q", modelLevel)
		}
		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    messages,
			Stream:      true,
			Temperature: defaultLLMTemperature,
		}
		// 走 common/upstream DoStream (breaker=ai_llm_stream); 上游 SSE 流交给
		// streamResponse 边读边转发, 非 2xx 会被分类成 typed error 触发换账户重试。
		streamErr := streamChatCompletion(ctx, config.BaseURL, config.APIKey, reqBody, func(resp *upstream.StreamResponse) error {
			return s.streamResponse(resp.Body, writer)
		})
		return nil, streamErr
	})
	return err
}

// streamResponse 读上游 SSE 流并以 SSE 帧形式写到 writer (data: <json>\n\n)。
// 只转发包含非空 delta.content 的 chunk; "[DONE]" 结束流。
func (s *Service) streamResponse(reader io.Reader, writer io.Writer) error {
	scanner := bufio.NewScanner(reader)
	const maxScannerBuffer = 1024 * 1024 // 1MB, SSE chunk 可能很大
	scanner.Buffer(make([]byte, maxScannerBuffer), maxScannerBuffer)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk ChatCompletionChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			slog.Warn("Failed to parse chunk", "err", err)
			continue
		}

		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			chunkJSON, err := json.Marshal(chunk)
			if err != nil {
				slog.Warn("Failed to marshal chunk", "err", err)
				continue
			}
			if _, err := fmt.Fprintf(writer, "data: %s\n\n", string(chunkJSON)); err != nil {
				return err
			}
			if flusher, ok := writer.(http.Flusher); ok {
				flusher.Flush()
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("error reading stream: %w", err)
	}
	return nil
}
