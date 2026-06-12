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
	"net/url"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/llmusage"
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

	// llmRec 统一 LLM token 账本录入器, bootstrap 注入 (允许 nil = 不记账)。
	// executeWithRetry 在每次成功调用后落一行 (source=project), 调用方无法漏记。
	llmRec llmusage.Recorder
}

func NewService(db *gorm.DB, accountService *thirdparty.Service) *Service {
	return &Service{
		db:             db,
		repo:           NewRepository(db),
		accountService: accountService,
	}
}

// SetLLMUsageRecorder 注入统一 LLM token 账本录入器。bootstrap 调用一次; nil = 不记账。
func (s *Service) SetLLMUsageRecorder(r llmusage.Recorder) {
	s.llmRec = r
}

// aiUsage 是单次 LLM attempt 消耗的 token, 由 attemptFn 从响应里抽出回传给
// executeWithRetry 统一记账 (model / provider / account 由 executeWithRetry 从 config 补全)。
type aiUsage struct {
	InputTokens         int
	OutputTokens        int
	TotalTokens         int
	CacheReadTokens     int
	CacheCreationTokens int
}

// usageFromStats 把 OpenAI 兼容响应的 LLMUsageStats 转成账本用的 aiUsage。
//
// 语义对齐(关键):OpenAI / DeepSeek / GLM 的 prompt_tokens 是「整段输入,含命中缓存的部分」,
// 与 Anthropic「input 不含缓存、缓存单列」相反。账本按「四列互不重叠」存:
//   input_tokens = 未命中输入(prompt - 命中), cache_read_tokens = 命中, output = completion。
// 这样 input + output + cache_read == 上游 total, 且 llmusage 的「total 缺省时四列求和」兜底
// 不会把命中缓存重复计一遍; 前端后台「命中率 = cache_read /(input+cache_read)」也才正确。
func usageFromStats(u LLMUsageStats) *aiUsage {
	cached := u.PromptTokensDetails.CachedTokens
	if u.PromptCacheHitTokens > cached {
		cached = u.PromptCacheHitTokens // DeepSeek 原生字段(prompt_cache_hit_tokens)
	}
	input := u.PromptTokens - cached // 未命中输入
	if input < 0 {
		input = 0 // 上游字段不自洽时兜底, 避免负数(命中数 > prompt 数)
	}
	return &aiUsage{
		InputTokens:     input,
		OutputTokens:    u.CompletionTokens,
		TotalTokens:     u.TotalTokens,
		CacheReadTokens: cached,
		// OpenAI 兼容无 cache_creation 概念, 留 0。
	}
}

// providerFromBaseURL 从上游 base_url 取 host 作为 provider 标签 (account_id 已能精确对账,
// 这里只要个可读的厂商维度)。解析失败回退原串。
func providerFromBaseURL(baseURL string) string {
	if baseURL == "" {
		return ""
	}
	if u, err := url.Parse(baseURL); err == nil && u.Host != "" {
		return u.Host
	}
	return baseURL
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
// Return (result, usage, nil) on success, or (nil, nil, err) on failure.
// usage 可为 nil (上游没吐 token 时) —— 记账时跳过。
type aiAttemptFn func(config *thirdparty.AIModelConfig, accountID uint) (any, *aiUsage, error)

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

		start := time.Now()
		result, usage, err := fn(config, accountID)
		latencyMs := time.Since(start).Milliseconds()

		// breaker open: 老的 gobreaker 错误 或 新的 upstream.ErrCircuit — 都直接 bail
		// (换账号也救不了, 上游本身在被保护)。fn 是快速失败、没真打上游, 因此不计入账号
		// 用量统计 (否则 fail 会被熔断噪声灌爆)。
		if circuitbreaker.IsCircuitBreakerError(err) || errors.Is(err, upstream.ErrCircuit) {
			lastErr = err
			return nil, fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}

		// 真实发生了一次上游请求 → 记一次三方账号用量 (成败 + 耗时; 含重试, 与
		// total_requests "总请求次数(含重试)" 语义一致)。RecordAPIUsage 内部异步, 不阻塞。
		s.accountService.RecordAPIUsage(accountID, err == nil, latencyMs)

		if err == nil {
			// 唯一的项目侧 LLM 记账点: 成功一次落一行账本 (source=project)。feature/user
			// 从 ctx (llmusage.WithCall) 取; model/provider/account 从本次 config 补全。
			s.recordLLMUsage(ctx, config, accountID, usage)
			return result, nil
		}

		lastErr = err

		if isAIRetryableError(err) {
			excludeAccountIDs = append(excludeAccountIDs, accountID)
			continue
		}

		return nil, err
	}
	return nil, fmt.Errorf("all %d AI retry attempts failed, last error: %w", AIMaxRetries+1, lastErr)
}

// recordLLMUsage 把一次成功的项目侧 LLM 调用落到统一 token 账本。
// feature/user/request_id 由入口 handler 经 llmusage.WithCall 塞进 ctx; 没有 feature
// 时 llmusage.Service 自己降级成 "unknown" + Warn (让漏埋点可见)。usage==nil (上游没吐
// token) 时跳过。account_id 精确对账, provider 取 base_url host, model 取本次解析出的 code。
func (s *Service) recordLLMUsage(ctx context.Context, config *thirdparty.AIModelConfig, accountID uint, usage *aiUsage) {
	if s.llmRec == nil || usage == nil {
		return
	}
	call := llmusage.CallFromCtx(ctx)
	model := ""
	provider := ""
	if config != nil {
		model = config.ModelLow // executeWithRetry 解析后把当次模型放进 ModelLow
		provider = providerFromBaseURL(config.BaseURL)
	}
	var accID *uint
	if accountID != 0 {
		a := accountID
		accID = &a
	}
	s.llmRec.Record(llmusage.Usage{
		UserID:              call.UserID,
		Feature:             call.Feature,
		Source:              llmusage.SourceProject,
		Provider:            provider,
		AccountID:           accID,
		Model:               model,
		InputTokens:         usage.InputTokens,
		OutputTokens:        usage.OutputTokens,
		TotalTokens:         usage.TotalTokens,
		CacheReadTokens:     usage.CacheReadTokens,
		CacheCreationTokens: usage.CacheCreationTokens,
		RequestID:           call.RequestID,
	})
}
