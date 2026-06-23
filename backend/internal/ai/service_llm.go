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
	result, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, *aiUsage, error) {
		// modelLevel 已由 thirdparty 解析成具体模型编码放进 ModelLow;为空说明
		// admin 没给该 level 配模型,直接报错而不是兜底到某个写死的模型。
		modelCode := config.ModelLow
		if modelCode == "" {
			return nil, nil, fmt.Errorf("no model configured for level %q", modelLevel)
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
		resp, err := doChatCompletion(ctx, config.BaseURL, config.APIKey, reqBody)
		if err != nil {
			return nil, nil, err
		}
		return resp, usageFromStats(resp.Usage), nil
	})
	if err != nil {
		return nil, err
	}
	return result.(*ChatCompletionResponse), nil
}

// SimpleCompletion 是「system + user → text」的一次便宜模型补全(ModelLevelLow),
// 给 usermemory 后台抽取等轻量内部用途用 —— 签名即 usermemory.CompleteFn,可直接当方法值传。
// 无 choices 时返回空串(caller 自行视作"无更新")。
func (s *Service) SimpleCompletion(ctx context.Context, system, user string) (string, error) {
	messages := []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
	resp, err := s.ChatCompletionWithTools(ctx, messages, nil, "", thirdparty.ModelLevelLow)
	if err != nil {
		return "", err
	}
	if resp == nil || len(resp.Choices) == 0 {
		return "", nil
	}
	return resp.Choices[0].Message.Content, nil
}

// StreamChatCompletionWithLevel SSE 流式 LLM 调用。
// 走 executeWithRetry 账户轮换 + AIServiceStreamBreaker 断路器。
//
// 现役消费者: ai/service_translate.go (StreamTranslateToChinese / StreamTranslatePaperToChinese)。
func (s *Service) StreamChatCompletionWithLevel(ctx context.Context, messages []ChatMessage, writer io.Writer, modelLevel thirdparty.ModelLevel) error {
	_, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, *aiUsage, error) {
		modelCode := config.ModelLow
		if modelCode == "" {
			return nil, nil, fmt.Errorf("no model configured for level %q", modelLevel)
		}
		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    messages,
			Stream:      true,
			Temperature: defaultLLMTemperature,
			// 流式响应默认不带 usage; 要 token 账本必须显式请求末尾 usage chunk。
			StreamOptions: &StreamOptions{IncludeUsage: true},
		}
		// 走 common/upstream DoStream (breaker=ai_llm_stream); 上游 SSE 流交给
		// streamResponse 边读边转发, 非 2xx 会被分类成 typed error 触发换账户重试。
		var usage *aiUsage
		streamErr := streamChatCompletion(ctx, config.BaseURL, config.APIKey, reqBody, func(resp *upstream.StreamResponse) error {
			u, e := s.streamResponse(resp.Body, writer)
			usage = u
			return e
		})
		if streamErr != nil {
			return nil, nil, streamErr
		}
		// 流式整段已服务但没拿到 usage(上游忽略了 include_usage 末尾 chunk,或在它之前就结束):
		// recordLLMUsage 会因 usage==nil 静默跳过 → 本次调用**不进账本、不扣额度**。把这个漏计
		// 可见化(R6),便于定位是哪个上游不遵守 include_usage 契约 —— 否则它会悄悄漏气。
		if usage == nil {
			slog.Warn("ai: streaming finished without usage — token NOT metered (upstream ignored include_usage?)",
				"model", modelCode, "level", string(modelLevel))
		}
		return nil, usage, nil
	})
	return err
}

// streamResponse 读上游 SSE 流并以 SSE 帧形式写到 writer (data: <json>\n\n)。
// 只转发包含非空 delta.content 的 chunk; "[DONE]" 结束流。
// 返回流末尾 include_usage chunk 解析出的 token 用量 (上游不支持时为 nil), 供账本记账。
func (s *Service) streamResponse(reader io.Reader, writer io.Writer) (*aiUsage, error) {
	scanner := bufio.NewScanner(reader)
	const maxScannerBuffer = 1024 * 1024 // 1MB, SSE chunk 可能很大
	scanner.Buffer(make([]byte, maxScannerBuffer), maxScannerBuffer)

	var usage *aiUsage
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

		// include_usage 的末尾 chunk: choices 通常为空、带 usage。记下后不转发给前端
		// (前端只认 delta.content), 但也不 break —— 后面可能还有 [DONE]。
		if chunk.Usage != nil {
			usage = usageFromStats(*chunk.Usage)
		}

		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			chunkJSON, err := json.Marshal(chunk)
			if err != nil {
				slog.Warn("Failed to marshal chunk", "err", err)
				continue
			}
			if _, err := fmt.Fprintf(writer, "data: %s\n\n", string(chunkJSON)); err != nil {
				return usage, err
			}
			if flusher, ok := writer.(http.Flusher); ok {
				flusher.Flush()
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return usage, fmt.Errorf("error reading stream: %w", err)
	}
	return usage, nil
}
