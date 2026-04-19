// ============================================================================
// Scholay学术 V1.0
// 背景 goroutine 的统一 recover 包装
// ============================================================================
//
// HTTP 层 Recovery 中间件只能兜 request goroutine 的 panic；任何 `go func(){...}`
// 启动的背景任务一旦 panic 直接 crash 整个进程。本包提供两个入口：
//
//   safego.Go(name, fn)          —— 一次性异步任务
//   safego.GoCtx(ctx, name, fn)  —— 长期循环，收到 ctx.Done 优雅退出
//
// 两个函数在 panic 时打 slog.Error（含 task 名 + stack），不再向上抛。
// 使用场景：cache 刷新、cleanup ticker、异步上报、WS 心跳等。
//
// 不适合的场景：errgroup / sync.WaitGroup 并行 fan-out —— 那里 panic 应该
// 传播给协调方统一处理，裸 `go func()` 是恰当的。本包不覆盖这类点位。

package safego

import (
	"context"
	"log/slog"
	"runtime/debug"
)

// Go 在后台执行 fn，panic 被 recover 并记录日志，不会向上蔓延。
// name 用作日志字段（"task"），出问题时方便 SigNoz 按任务名过滤。
func Go(name string, fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("background goroutine panicked",
					"task", name,
					"panic", r,
					"stack", string(debug.Stack()),
				)
			}
		}()
		fn()
	}()
}

// GoCtx 同 Go，但把 ctx 透给任务体，适合需要响应 cancel 的长期循环。
// fn 应在自己的循环里 select <-ctx.Done() 主动退出，包装本身不会强制中断。
func GoCtx(ctx context.Context, name string, fn func(ctx context.Context)) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("background goroutine panicked",
					"task", name,
					"panic", r,
					"stack", string(debug.Stack()),
				)
			}
		}()
		fn(ctx)
	}()
}
