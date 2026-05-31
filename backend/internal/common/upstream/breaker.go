// ============================================================================
// Scholay 上游调用统一基建 · 命名 circuit breaker registry
//
// gobreaker 的薄包装 + 按 name 全局注册。
//
// 设计:
//   - 一个 upstream name → 一个 breaker (惰性注册, 第一次 Get 时建)
//   - 默认参数 (MaxRequests=5 / Interval=1m / Timeout=30s / 60% failure trip)
//     适用于绝大多数 REST API; 极端场景 (流式 LLM / 高频心跳) 用 RegisterCustom 覆盖
//   - OnStateChange 自动 slog 一行, 跟现有 common/circuitbreaker 的风格一致
//
// 跟现有 common/circuitbreaker/breaker.go 的关系:
//   后者是 v1, 把所有 breaker 在 init 时声明出来 (SemanticScholarBreaker /
//   AIServiceBreaker / ...)。新代码走本 registry, 老代码继续用 v1 不冲突;
//   两个 registry 互相不知道对方 (gobreaker 实例是局部变量)。
// ============================================================================

package upstream

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/sony/gobreaker"
)

// BreakerConfig 控制 breaker 参数。零值 → 默认。
type BreakerConfig struct {
	// MaxRequests half-open 状态允许同时通过的请求数。默认 5。
	MaxRequests uint32

	// Interval 统计窗口长度。默认 60s。
	Interval time.Duration

	// Timeout open 状态后多久 half-open 一次。默认 30s。
	Timeout time.Duration

	// MinRequests 在判 trip 前最少需要的请求数。默认 5。
	MinRequests uint32

	// FailureRatio 失败率阈值, 超过 + 请求数 ≥ MinRequests 时 trip。默认 0.6。
	FailureRatio float64
}

// 全局 breaker registry, 按 name 单例。
var (
	breakerMu sync.RWMutex
	breakers  = make(map[string]*gobreaker.CircuitBreaker)
)

// getOrCreateBreaker — registry 入口。同名重复调用返同一个实例。
// 第一次注册时按 cfg 建; 后续调用即便 cfg 不同也复用最先那个 (避免 race)。
func getOrCreateBreaker(name string, cfg BreakerConfig) *gobreaker.CircuitBreaker {
	if name == "" {
		name = "default"
	}
	breakerMu.RLock()
	if b, ok := breakers[name]; ok {
		breakerMu.RUnlock()
		return b
	}
	breakerMu.RUnlock()

	breakerMu.Lock()
	defer breakerMu.Unlock()
	// 双检 — 并发时另一个 goroutine 可能已经建了
	if b, ok := breakers[name]; ok {
		return b
	}
	cfg = cfg.withDefaults()
	b := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "upstream:" + name,
		MaxRequests: cfg.MaxRequests,
		Interval:    cfg.Interval,
		Timeout:     cfg.Timeout,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			if counts.Requests < cfg.MinRequests {
				return false
			}
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return failureRatio >= cfg.FailureRatio
		},
		OnStateChange: func(brName string, from, to gobreaker.State) {
			slog.Warn("upstream breaker state changed",
				"breaker", brName,
				"from", from.String(),
				"to", to.String())
		},
	})
	breakers[name] = b
	return b
}

func (c BreakerConfig) withDefaults() BreakerConfig {
	if c.MaxRequests == 0 {
		c.MaxRequests = 5
	}
	if c.Interval <= 0 {
		c.Interval = 60 * time.Second
	}
	if c.Timeout <= 0 {
		c.Timeout = 30 * time.Second
	}
	if c.MinRequests == 0 {
		c.MinRequests = 5
	}
	if c.FailureRatio <= 0 {
		c.FailureRatio = 0.6
	}
	return c
}

// executeWithBreaker 在 breaker 保护下执行 fn。
//
// breaker 计数规则 (跟"该 error 是否算上游故障"对齐):
//   - 4xx 类 (ErrAuth/ErrBadRequest/ErrNotFound) → 不算上游故障 (上游正常工作,
//     是调用方入参/credential 不对), 对 breaker 计 success, 但**错误仍透传给调用方**
//   - 5xx / 429 / network / timeout → 算上游故障, 对 breaker 计 failure
//   - breaker open → 返回 ErrCircuit (Retryable=true)
//
// 由于 gobreaker.Execute 只能从 inner err 决定 success/failure, 这里用闭包
// 捕获原 err 并在外层重新返出, 避免 4xx 类丢错。
func executeWithBreaker(ctx context.Context, b *gobreaker.CircuitBreaker, upstream, endpoint string, fn func() (any, error)) (any, error) {
	if b == nil {
		return fn()
	}
	var capturedErr error
	result, err := b.Execute(func() (any, error) {
		out, fnErr := fn()
		capturedErr = fnErr
		if fnErr == nil {
			return out, nil
		}
		var ue *Error
		if errors.As(fnErr, &ue) && !ue.Retryable() {
			// 4xx 类: 对 breaker 计 success, 但下面外层会用 capturedErr 把错透传出去
			return out, nil
		}
		return out, fnErr
	})
	if errors.Is(err, gobreaker.ErrOpenState) || errors.Is(err, gobreaker.ErrTooManyRequests) {
		return nil, FromCircuitOpen(upstream, endpoint, err)
	}
	// gobreaker 认为 success (4xx 被我们吞了) 但实际我们捕获到了 non-retryable error → 透传
	if err == nil && capturedErr != nil {
		return result, capturedErr
	}
	return result, err
}

// breakerStateLine — 调试用, 给 metrics endpoint 之类可以打印当前 breaker 状态。
func breakerStateLine(name string) string {
	breakerMu.RLock()
	b, ok := breakers[name]
	breakerMu.RUnlock()
	if !ok {
		return fmt.Sprintf("breaker %q: not registered", name)
	}
	c := b.Counts()
	return fmt.Sprintf("breaker %q: state=%s reqs=%d succ=%d fail=%d consec_fail=%d",
		name, b.State().String(), c.Requests, c.TotalSuccesses, c.TotalFailures, c.ConsecutiveFailures)
}
