// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package safego

// 有上界的 worker pool — 给"突发 fan-out" 场景兜底。
//
// 现有 `safego.Go(name, fn)` 是裸 goroutine + recover, 每次 spawn 一个新 goroutine。
// 对长期循环 (ticker / WS ping) 没问题, 但对 "请求触发 N 个并行任务" 类场景, 高并发下
// 会瞬间堆出几千个 goroutine。
//
// 用法:
//
//	// 包级单例: 例如 minicod 预取 batch 用 4 worker, 队列上限 256
//	var minicodPool = safego.NewPool("minicod-prefetch", 4, 256)
//
//	// 在请求 handler 里:
//	for _, doi := range dois {
//	    doi := doi
//	    if !minicodPool.Submit(func() { fetchAndCache(doi) }) {
//	        slog.Warn("minicod pool full, dropped", "doi", doi)
//	    }
//	}
//
// 行为:
//   - 队列满时 Submit 返回 false (调用方决定 drop / 阻塞 / 降级), 不阻塞业务
//   - worker goroutine panic 被 safego 的 recover 兜
//   - Pool 没显式 Close — 进程退出时整个池随主进程一起回收
//
// 何时用 NewPool vs 裸 safego.Go:
//   - 裸 safego.Go: 长期 1 个 goroutine (ticker / 监听 / WS ping per-conn)
//   - NewPool: "每次请求 fan-out N 个任务", N 可能大于 1 但需要全局限速

import (
	"log/slog"
	"sync/atomic"
	"time"
)

// Pool 是一个固定 worker 数 + 固定队列长度的 goroutine 池。
//
// 字段全部 read-after-init, 不需要锁; 计数器走 atomic。
type Pool struct {
	name    string
	queue   chan func()
	workers int
	// 监控用计数器 (atomic)
	submitted atomic.Uint64
	rejected  atomic.Uint64
}

// NewPool 启动一个有 workers 个 worker goroutine 的池, 队列上限 queueSize。
// 池启动后立刻可用; 不需要 Start / Close (worker 跟随主进程退出)。
//
// workers >= 1; queueSize >= 0 (0 = 严格无队列, Submit 在没有空闲 worker 时立刻返回 false)。
func NewPool(name string, workers, queueSize int) *Pool {
	if workers < 1 {
		workers = 1
	}
	if queueSize < 0 {
		queueSize = 0
	}
	p := &Pool{
		name:    name,
		queue:   make(chan func(), queueSize),
		workers: workers,
	}
	for i := 0; i < workers; i++ {
		// 每个 worker 都套 safego 兜 panic, 万一某个 fn panic 不会让 worker 死掉
		Go(name+"-worker-"+itoa(i), func() {
			for fn := range p.queue {
				// 单 fn 的 panic 已被 Go() 的 recover 兜过一次了? 不, Go 包的 recover
				// 只能兜本 goroutine 的 panic, 这里我们要兜的是 fn 的 panic,
				// 所以需要在这里再套一层 — 否则 worker goroutine 会被 fn panic 整死,
				// 后续任务再 submit 就死锁 (queue 满)。
				safeRun(name, fn)
			}
		})
	}
	return p
}

// Submit 尝试把 fn 放进队列。成功返回 true; 队列满返回 false (caller 决定怎么办)。
//
// **不阻塞**: 业务路径不应该被 pool 卡住; 降级 / drop / 同步执行都由 caller 决定。
func (p *Pool) Submit(fn func()) bool {
	if fn == nil {
		return true // nil fn 视为 no-op 成功
	}
	select {
	case p.queue <- fn:
		p.submitted.Add(1)
		return true
	default:
		p.rejected.Add(1)
		return false
	}
}

// SubmitWait 与 Submit 同,但队列满时**最多等 d**再放弃(而不是立刻 drop)。
//
// 2026-08-02 计费审计 P1-5:账本(llm_token_usage)这类「丢了就对不上账」的写不该与
// 匿名 beacon 共用「满即丢」的语义 —— DB 短暂抖动(2 worker × 亚毫秒 INSERT,512 队列
// 要打满意味着单条 INSERT 已逼近秒级)时,等一小会儿几乎总能排上,而立刻丢是永久损失。
// 仍有上界:d 到了就放弃并返回 false,绝不无限阻塞调用方(Record 在 WS pipe 的转发路径上)。
func (p *Pool) SubmitWait(fn func(), d time.Duration) bool {
	if fn == nil {
		return true
	}
	select {
	case p.queue <- fn:
		p.submitted.Add(1)
		return true
	default:
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case p.queue <- fn:
		p.submitted.Add(1)
		return true
	case <-t.C:
		p.rejected.Add(1)
		return false
	}
}

// Stats 返回累计 submitted / rejected 计数. 用于监控 / 调容量。
func (p *Pool) Stats() (submitted, rejected uint64) {
	return p.submitted.Load(), p.rejected.Load()
}

// Name 返回池名 (slog 等地方需要).
func (p *Pool) Name() string { return p.name }

// safeRun 套一层 recover 跑 fn, panic 时记 slog.Error 但不让 worker goroutine 死。
func safeRun(poolName string, fn func()) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("pool task panicked",
				"pool", poolName,
				"panic", r,
			)
		}
	}()
	fn()
}

// itoa 是 strconv.Itoa 的 mini 替代; 避免顶部多 import 一个 strconv。
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
