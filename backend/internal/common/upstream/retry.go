// ============================================================================
// Scholay 上游调用统一基建 · 重试策略
//
// 策略:
//   - 指数退避: base × 2^attempt (capped at max)
//   - jitter: 0~25% 随机扰动, 避免雷群 (thundering herd)
//   - 立即被 ctx.Done() 中断 (不浪费 sleep)
//   - 只重试 Error.Retryable()==true 的; non-Error 类型默认不重试 (它们是
//     编码层错误, 比如 json marshal 失败, 重试也没用)
//
// 不重试的常见 sentinel:
//   ErrAuth      — 401 / 403, 重试还是会被拒绝
//   ErrBadRequest — 4xx (除已上面分类的), payload 不对, 重试也是 4xx
//   ErrNotFound  — 404, 资源不存在就是不存在
//
// 调用方如果想做"换 thirdparty 账户再试"这种业务级重试, 应该自己拿到
// errors.Is(err, ErrAuth) 后在自己业务里循环, 不要硬码进本层 — 因为
// "换账户"这件事跟具体业务的账户池强耦合 (ai vs minicod 是不同池子)。
// ============================================================================

package upstream

import (
	"context"
	"errors"
	"math/rand"
	"time"
)

// RetryConfig — 一个 upstream 的重试策略。零值 = 不重试 (Max=0)。
type RetryConfig struct {
	// Max 重试次数 (不含首次尝试)。0 表示不重试。3 是常见值。
	Max int

	// BackoffBase 首轮退避基数。默认 200ms。
	BackoffBase time.Duration

	// BackoffMax 退避上限。默认 5s。
	BackoffMax time.Duration

	// JitterFraction 抖动比例 [0, 1]。默认 0.25 (即 ±25%)。
	// 0 = 关闭 jitter, 1 = 退避可能在 [0, 2×backoff] 间。
	JitterFraction float64
}

// withDefaults 给零值字段填默认。
func (c RetryConfig) withDefaults() RetryConfig {
	if c.BackoffBase <= 0 {
		c.BackoffBase = 200 * time.Millisecond
	}
	if c.BackoffMax <= 0 {
		c.BackoffMax = 5 * time.Second
	}
	if c.JitterFraction < 0 {
		c.JitterFraction = 0
	}
	if c.JitterFraction == 0 && c.Max > 0 {
		c.JitterFraction = 0.25
	}
	return c
}

// nextBackoff — 第 attempt 轮 (0-indexed) 的退避时长。
//
// 退避序列示例 (base=200ms, max=5s, jitter=0.25):
//   attempt=0:  ~200ms  (150~250ms)
//   attempt=1:  ~400ms  (300~500ms)
//   attempt=2:  ~800ms  (600~1000ms)
//   attempt=3:  ~1.6s
//   ...至 max 封顶
func (c RetryConfig) nextBackoff(attempt int) time.Duration {
	c = c.withDefaults()
	// 用左移做 2^attempt, 超过 30 直接顶到 max 避免 int64 溢出
	mult := int64(1)
	if attempt > 0 && attempt < 30 {
		mult = 1 << attempt
	} else if attempt >= 30 {
		mult = 1 << 30
	}
	d := time.Duration(int64(c.BackoffBase) * mult)
	if d > c.BackoffMax {
		d = c.BackoffMax
	}
	if c.JitterFraction > 0 {
		// jitter ∈ [1-fraction, 1+fraction]
		span := c.JitterFraction * 2
		factor := 1.0 - c.JitterFraction + rand.Float64()*span
		d = time.Duration(float64(d) * factor)
	}
	return d
}

// shouldRetry — 决策这条 error 是否触发下一轮重试。
// 默认策略:
//   1. ctx 已被 cancel/超时 → 永不重试 (上层在等回应)
//   2. err 是 *Error 且 Retryable() → true
//   3. 其他 → false
//
// 高级用法: 调用方可以在 Do 之后自己加 "想要的额外重试" (例如 ErrAuth + 换账户)。
func (c RetryConfig) shouldRetry(ctx context.Context, err error, attempt int) bool {
	if err == nil {
		return false
	}
	if attempt >= c.Max {
		return false
	}
	if ctx.Err() != nil {
		return false
	}
	var ue *Error
	if errors.As(err, &ue) {
		return ue.Retryable()
	}
	return false
}

// sleepOrCancel — 等待 d 时间, 期间任何时候 ctx 被 cancel 都立刻返回 ctx.Err()。
func sleepOrCancel(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
