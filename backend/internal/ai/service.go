// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/thirdparty"
)

// MCPToolDef is a protocol-agnostic tool definition used to decouple the ai
// package from the mcp package.  Callers convert MCP-specific types to this
// DTO before passing them to ConvertMCPToolsToOpenAIFormat.
type MCPToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

// min returns the smaller of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

type Service struct {
	db             *gorm.DB
	repo           *Repository
	accountService *thirdparty.Service
}

func NewService(db *gorm.DB, accountService *thirdparty.Service) *Service {
	return &Service{
		db:             db,
		repo:           NewRepository(db),
		accountService: accountService,
	}
}

// AI 重试相关常量
const AIMaxRetries = 5

// LLM 默认调参 —— 非流式/流式 chat completion 共用。
// 模型编码本身不在这里写死:它由 thirdparty 按 modelLevel 解析 admin 配置得到。
const (
	defaultLLMTemperature = 0.7
	defaultLLMMaxTokens   = 8192
)

// APIErrorPrefix 是 AI 上游非 200 响应生成的错误前缀(历史)。
// 迁到 common/upstream 后, HTTP 层错误已经是 typed *upstream.Error, 用 errors.Is
// 判别更稳。这个前缀仍保留:兼容尚未迁移的路径 / 业务层手工构造的错误。
const APIErrorPrefix = "API error (status"

// isAIRetryableError 检查是否是可重试的 AI 错误(可切账号重试)。
//
// 判定:
//  1. typed *upstream.Error — ErrAuth(401/403) / ErrRateLimit(429) / ErrServer(5xx)
//     / ErrNetwork / ErrTimeout 都换账号重试。ErrCircuit 不在这(breaker open 换账号
//     也没用, 由 executeWithRetry 单独 bail)。
//  2. 字符串 fallback — APIErrorPrefix(兼容未迁移路径)。
func isAIRetryableError(err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, upstream.ErrAuth),
		errors.Is(err, upstream.ErrRateLimit),
		errors.Is(err, upstream.ErrServer),
		errors.Is(err, upstream.ErrNetwork),
		errors.Is(err, upstream.ErrTimeout):
		return true
	}
	return strings.Contains(err.Error(), APIErrorPrefix)
}

// aiAttemptFn is the per-attempt callback used by executeWithRetry.
// It receives the resolved model config and the originating account ID.
// Return (result, nil) on success, or (nil, err) on failure.
type aiAttemptFn func(config *thirdparty.AIModelConfig, accountID uint) (any, error)

// executeWithRetry encapsulates the common retry-with-account-switching pattern
// used across all AI service methods. On retryable errors (non-200 API status)
// it excludes the failed account and tries again with a different one.
func (s *Service) executeWithRetry(ctx context.Context, modelLevel thirdparty.ModelLevel, fn aiAttemptFn) (any, error) {
	var lastErr error
	var excludeAccountIDs []uint

	for attempt := 0; attempt <= AIMaxRetries; attempt++ {
		config, accountID, err := s.accountService.GetRandomAIModelConfigByLevelExcluding(modelLevel, excludeAccountIDs)
		if err != nil {
			lastErr = err
			// 账号池已耗尽：再循环只是重复同一个错误，直接提前退出避免空转。
			if len(excludeAccountIDs) > 0 {
				break
			}
			continue
		}

		result, err := fn(config, accountID)
		if err == nil {
			return result, nil
		}

		lastErr = err

		// breaker open: 老的 gobreaker 错误 或 新的 upstream.ErrCircuit — 都直接 bail
		// (换账号也救不了, 上游本身在被保护)。
		if circuitbreaker.IsCircuitBreakerError(err) || errors.Is(err, upstream.ErrCircuit) {
			return nil, fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}

		if isAIRetryableError(err) {
			excludeAccountIDs = append(excludeAccountIDs, accountID)
			continue
		}

		return nil, err
	}
	return nil, fmt.Errorf("all %d AI retry attempts failed, last error: %w", AIMaxRetries+1, lastErr)
}
