// ============================================================================
// Scholay学术 V1.0
// 共享 SSE 心跳封装
// ============================================================================
//
// 历史问题：AI 分析/Peer Review 流式接口在"思考阶段"可能 60s+ 不产生任何 data，
// 经过 Nginx / 负载均衡时会被当作 idle 连接断掉（Nginx 默认 60s proxy_read_timeout）。
// 浏览器端表现为 EventSource 无感知断连，只能靠 reconnect 延迟恢复体验。
//
// 解决方案：包装一层 HeartbeatWriter，每 interval 写入一个 SSE 注释行 ": ping\n\n"
// （comment frame 客户端自动丢弃，不会污染业务数据），保持 TCP 连接活跃。
//
// 并发安全：
//   - 写入 HeartbeatWriter 的业务 Write / Flush 与心跳 goroutine 共享一把 mu，
//     保证 SSE frame 不被交错切碎。
//   - fmt.Fprintf(hw, ...) 对格式化后的 buffer 只调用一次 Write，因此单次业务 frame
//     在锁内完整落地；心跳 frame 会在业务 frame 完整落地之间插入，始终合法。

package sse

import (
	"context"
	"io"
	"net/http"
	"sync"
	"time"

	"scholar-backend/internal/common/safego"

	"github.com/gin-gonic/gin"
)

// DefaultHeartbeatInterval 默认心跳间隔（30s），低于 Nginx 默认的 60s proxy_read_timeout。
const DefaultHeartbeatInterval = 30 * time.Second

// DefaultWriteTimeout 单次 SSE 写入的硬上限。客户端若完全不再读取（TCP 发送缓冲写满），
// 原生 Write 会永远阻塞并把 goroutine + 业务 ctx 都卡死；这里用 ResponseController 给每次
// 落盘设一个 deadline，超时后 Write 立刻失败，handler 感知到错误就能走正常清理路径。
const DefaultWriteTimeout = 15 * time.Second

// heartbeatFrame 是 SSE comment frame，客户端 EventSource 会静默忽略。
var heartbeatFrame = []byte(": ping\n\n")

// HeartbeatWriter 为 SSE 长连接提供线程安全的写入 + 自动心跳。
// 使用后必须调用 Stop 回收心跳 goroutine。
type HeartbeatWriter struct {
	w        io.Writer
	rc       *http.ResponseController // 可选：用于设置每次 Write 的 deadline
	writeTTL time.Duration            // 单次 Write 的超时上限
	mu       sync.Mutex
	cancel   context.CancelFunc
	done     chan struct{}
}

// NewHeartbeat 启动一个心跳写入器。interval 建议 < Nginx proxy_read_timeout / 2。
// 当 parentCtx 被取消或 Stop 被调用时，心跳 goroutine 会退出。
func NewHeartbeat(parentCtx context.Context, w io.Writer, interval time.Duration) *HeartbeatWriter {
	if interval <= 0 {
		interval = DefaultHeartbeatInterval
	}
	ctx, cancel := context.WithCancel(parentCtx)
	hw := &HeartbeatWriter{
		w:        w,
		writeTTL: DefaultWriteTimeout,
		cancel:   cancel,
		done:     make(chan struct{}),
	}
	// 仅当 w 是 http.ResponseWriter 时才能装配 ResponseController。
	if rw, ok := w.(http.ResponseWriter); ok {
		hw.rc = http.NewResponseController(rw)
	}
	safego.Go("sse-heartbeat", func() { hw.run(ctx, interval) })
	return hw
}

// setDeadline 在支持的情况下为下一次 Write 设置截止时间；返回清理函数（重置 deadline）。
// 某些 ResponseWriter（比如测试用 mock）不支持 SetWriteDeadline，会返回 ErrNotSupported，
// 此时忽略错误、退化为无超时（至少不会比现状更差）。
func (hw *HeartbeatWriter) setDeadline() {
	if hw.rc == nil || hw.writeTTL <= 0 {
		return
	}
	_ = hw.rc.SetWriteDeadline(time.Now().Add(hw.writeTTL))
}

func (hw *HeartbeatWriter) run(ctx context.Context, interval time.Duration) {
	defer close(hw.done)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			hw.writeHeartbeat()
		}
	}
}

func (hw *HeartbeatWriter) writeHeartbeat() {
	hw.mu.Lock()
	defer hw.mu.Unlock()
	hw.setDeadline()
	if _, err := hw.w.Write(heartbeatFrame); err != nil {
		// 客户端断连 / 底层错误：业务逻辑会通过正常 Write 感知，这里静默失败
		return
	}
	if f, ok := hw.w.(http.Flusher); ok {
		f.Flush()
	}
}

// Write 实现 io.Writer，串行化与心跳的写入。
func (hw *HeartbeatWriter) Write(p []byte) (int, error) {
	hw.mu.Lock()
	defer hw.mu.Unlock()
	hw.setDeadline()
	return hw.w.Write(p)
}

// Flush 实现 http.Flusher；sse.writeData 会在写完 data 后调用。
func (hw *HeartbeatWriter) Flush() {
	hw.mu.Lock()
	defer hw.mu.Unlock()
	if f, ok := hw.w.(http.Flusher); ok {
		f.Flush()
	}
}

// Stop 取消心跳 goroutine 并等待它退出。幂等，可重复调用。
func (hw *HeartbeatWriter) Stop() {
	hw.cancel()
	<-hw.done
}

// BeginStream 是 handler 层的便捷组合：
//   - 设置 SSE 响应头
//   - 基于 request context 启动 30s 心跳
//   - 返回 writer 和 stop 回收函数（调用方 defer stop()）
//
// 典型用法：
//
//	w, stop := sse.BeginStream(c)
//	defer stop()
//	svc.StreamSomething(c.Request.Context(), ..., w)
func BeginStream(c *gin.Context) (*HeartbeatWriter, func()) {
	SetHeaders(c)
	hw := NewHeartbeat(c.Request.Context(), c.Writer, DefaultHeartbeatInterval)
	return hw, hw.Stop
}
