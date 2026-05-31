// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package circuitbreaker

import (
	"time"

	"github.com/sony/gobreaker"
)

var (
	// SemanticScholarBreaker protects Semantic Scholar API calls
	SemanticScholarBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "SemanticScholar",
		MaxRequests: 3,
		Interval:    time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 3 && failureRatio >= 0.6
		},
		OnStateChange: onStateChangeWithStats,
	})

	// AIServiceStreamBreaker protects streaming AI service calls (chat, analysis).
	// Separate from non-streaming to avoid cross-contamination.
	AIServiceStreamBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "AIServiceStream",
		MaxRequests: 10,
		Interval:    time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.8
		},
		OnStateChange: onStateChangeWithStats,
	})

	// AIServiceBreaker protects non-streaming AI service calls (translation, tool calls)
	AIServiceBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "AIService",
		MaxRequests: 10,
		Interval:    time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.8
		},
		OnStateChange: onStateChangeWithStats,
	})

	// MinicodBreaker protects Minicod API calls
	MinicodBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "Minicod",
		MaxRequests: 3,
		Interval:    time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 3 && failureRatio >= 0.6
		},
		OnStateChange: onStateChangeWithStats,
	})

	// ProxyServiceBreaker protects proxy API calls
	ProxyServiceBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "ProxyService",
		MaxRequests: 10,
		Interval:    time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.7
		},
		OnStateChange: onStateChangeWithStats,
	})

	// AgentBreaker 保护到 scholar_agent /api/providers 的配置推送。
	// 推送是 admin 写入触发的低频动作,阈值压到 3 次失败 / 60% 即开,
	// 避免 agent 长时间不可达时把 admin 保存接口拖慢(虽然 push 已经在 goroutine 里)。
	AgentBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "Agent",
		MaxRequests: 1,
		Interval:    time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 3 && failureRatio >= 0.6
		},
		OnStateChange: onStateChangeWithStats,
	})
)

// IsCircuitBreakerError checks if an error is from circuit breaker being open
func IsCircuitBreakerError(err error) bool {
	return err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests
}

// init 预注册所有 breaker 到 stats 表，保证 Stats() 在任何 state 变更前就能列出所有熔断器。
func init() {
	for _, name := range []string{
		"SemanticScholar",
		"AIServiceStream",
		"AIService",
		"Minicod",
		"ProxyService",
		"Agent",
		"PeerReview",
	} {
		registerBreaker(name)
	}
}
