// ============================================================================
// 智能审稿 v3 — agent 流式输出广播器
//
// agent goroutine 跑 ServerSideChat 时, 把每个 content_delta 喂给 broker;
// 前端 SSE 端点 (StreamPartial) 订阅 broker, 把 deltas 推给浏览器。
//
// **多流支持** (2026-05): 同一 submission 在 4 轮审稿里要并存 4 条独立流,
// broker 改用复合 key (submissionID + slot) 寻址。Slot 命名:
//
//   meta                — Step1→2 抽 meta
//   letter              — Step2→3 起草投稿信
//   reviewer:alpha/beta/gamma  — 三位审稿人各自的流
//   reviewer:chief      — 主审决议
//
// 中途刷新 / 多 tab 同步:
//   新订阅者会先收到 "snapshot" 累积文本, 然后跟上后续 deltas。
//
// done 后保留 30s 再 evict — 兼容"流式刚结束用户就刷新"的场景。
//
// 单实例 in-memory 实现。多副本部署时换 Redis pub/sub + redis string snapshot。
// ============================================================================

package peerreview

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// StreamPhase 标记 stream 当前阶段, 前端 UI 用来区分骨架屏 / 流式中 / 完结。
type StreamPhase string

const (
	StreamPhaseComputing StreamPhase = "computing"
	StreamPhaseDone      StreamPhase = "done"
	StreamPhaseError     StreamPhase = "error"
	// status: 一条**瞬时进度提示** (如"正在读取稿件…/检索文献…"), 不进 text 缓冲,
	// 前端拿去显示 loading 文案。agent 用工具 (Read/Bash/MCP) 的"静默期"靠它给反馈。
	StreamPhaseStatus StreamPhase = "status"
)

// 已知 slot 常量 — service 内部硬编码, handler 在 SSE URL ?slot= 转发。
const (
	SlotMeta   = "meta"
	SlotLetter = "letter"
	// SlotMethodology — 评分前的方法论编排会话(读全文 + invoke 审稿 skill 产出"该怎么审")。
	// 这一轮过去用 no-op 回调丢弃输出, 前端只能干等一个被误标成"审稿人A评议中"的空转圈;
	// 现在推到这个 slot, 让前端在 compute_state=computing_methodology 时实时看到 agent 输出。
	SlotMethodology = "methodology"
)

// ReviewerSlot 把 role (alpha/beta/gamma/chief) 拼成 "reviewer:<role>" slot 字符串。
func ReviewerSlot(role string) string { return "reviewer:" + role }

// StreamEvent 是发给前端 SSE 的一帧。Snapshot / Delta / Done / Error 由 Phase 区分。
type StreamEvent struct {
	Phase StreamPhase `json:"phase"`
	Slot  string      `json:"slot,omitempty"`  // 例: "reviewer:alpha"
	Text  string      `json:"text,omitempty"`  // delta: 新增片段; snapshot/done: 当前完整文本; error: 留空
	Error string      `json:"error,omitempty"` // 只在 phase=error 时填
	Note  string      `json:"note,omitempty"`  // 只在 phase=status 时填: 瞬时进度提示 (不进 text)
}

// stream 是单条 (submissionID, slot) 的流式状态。
type stream struct {
	mu   sync.Mutex
	slot string // 给所有 outbound event 自动填 (一次设, 永不改)
	// text 用 strings.Builder 累积，避免 `text += delta` 每个 content_delta 重分配复制整串 (O(L²))。
	// 所有读写都在 s.mu 下，Builder 不被拷贝 (stream 永远按指针用)，安全。
	text   strings.Builder
	phase  StreamPhase
	errMsg string
	subs      map[chan StreamEvent]struct{}
	doneAt    time.Time // done 后保留 30s 给"流刚结束用户刷新"用
	createdAt time.Time // 建流时刻 — GC 用它清"建了 pending 但 slot 始终没 Begin"的僵尸占位
}

// StreamBroker 是 in-memory broker, 按 streamKey(submissionID+slot) 分桶。
type StreamBroker struct {
	mu      sync.RWMutex
	streams map[string]*stream
}

// streamKey 是 broker map 的内部 key — submissionID + slot 拼接。
func streamKey(id uint64, slot string) string {
	return fmt.Sprintf("%d|%s", id, slot)
}

func NewStreamBroker() *StreamBroker {
	b := &StreamBroker{streams: make(map[string]*stream)}
	// 后台 GC: 每 5 min 扫一次, 已 done 超过 30s 的 evict
	go b.gcLoop()
	return b
}

func (b *StreamBroker) gcLoop() {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for range t.C {
		b.gcOnce()
	}
}

func (b *StreamBroker) gcOnce() {
	cutoff := time.Now().Add(-30 * time.Second)
	staleCutoff := time.Now().Add(-5 * time.Minute)
	b.mu.Lock()
	defer b.mu.Unlock()
	for id, s := range b.streams {
		s.mu.Lock()
		// (a) 正常结束/出错且保留期已过、无订阅者; 或
		// (b) SubscribePending 建的占位流: 始终没出过内容(text 空)、无订阅者、超 5min 仍未 Begin —— 视为僵尸清掉。
		dead := (s.phase != StreamPhaseComputing && !s.doneAt.IsZero() && s.doneAt.Before(cutoff) && len(s.subs) == 0) ||
			(s.phase == StreamPhaseComputing && len(s.subs) == 0 && s.text.Len() == 0 && !s.createdAt.IsZero() && s.createdAt.Before(staleCutoff))
		s.mu.Unlock()
		if dead {
			delete(b.streams, id)
		}
	}
}

// Begin 开一条新流 — agent goroutine 启动时调。slot 是该流的稳定标签。
func (b *StreamBroker) Begin(id uint64, slot string) {
	key := streamKey(id, slot)
	b.mu.Lock()
	s, ok := b.streams[key]
	if !ok {
		s = &stream{slot: slot, createdAt: time.Now(), subs: make(map[chan StreamEvent]struct{})}
		b.streams[key] = s
	}
	b.mu.Unlock()

	s.mu.Lock()
	s.text.Reset()
	s.phase = StreamPhaseComputing
	s.errMsg = ""
	s.doneAt = time.Time{}
	// 给现有 subscribers 推一个 "重置" snapshot
	evt := StreamEvent{Phase: StreamPhaseComputing, Slot: slot, Text: ""}
	for ch := range s.subs {
		nonBlockingSend(ch, evt)
	}
	s.mu.Unlock()
}

// Append 加一个 delta + 广播。
func (b *StreamBroker) Append(id uint64, slot, delta string) {
	if delta == "" {
		return
	}
	b.mu.RLock()
	s := b.streams[streamKey(id, slot)]
	b.mu.RUnlock()
	if s == nil {
		return
	}
	s.mu.Lock()
	s.text.WriteString(delta)
	evt := StreamEvent{Phase: StreamPhaseComputing, Slot: slot, Text: delta}
	for ch := range s.subs {
		nonBlockingSend(ch, evt)
	}
	s.mu.Unlock()
}

// Status 广播一条瞬时进度提示 (不累加进 text)。agent 在用工具 (读文件 / 检索) 的静默期,
// 靠它给前端 loading 文案, 让"流式"在没有正文 delta 时也有反应。stream 不存在时静默忽略。
func (b *StreamBroker) Status(id uint64, slot, note string) {
	if note == "" {
		return
	}
	b.mu.RLock()
	s := b.streams[streamKey(id, slot)]
	b.mu.RUnlock()
	if s == nil {
		return
	}
	s.mu.Lock()
	evt := StreamEvent{Phase: StreamPhaseStatus, Slot: slot, Note: note}
	for ch := range s.subs {
		nonBlockingSend(ch, evt)
	}
	s.mu.Unlock()
}

// Done 标记 stream 完结 (success) — 发最终 snapshot, 30s 后 GC 会 evict。
func (b *StreamBroker) Done(id uint64, slot string) {
	b.mu.RLock()
	s := b.streams[streamKey(id, slot)]
	b.mu.RUnlock()
	if s == nil {
		return
	}
	s.mu.Lock()
	s.phase = StreamPhaseDone
	s.doneAt = time.Now()
	evt := StreamEvent{Phase: StreamPhaseDone, Slot: slot, Text: s.text.String()}
	for ch := range s.subs {
		nonBlockingSend(ch, evt)
	}
	s.mu.Unlock()
}

// Fail 标记 stream 异常完结。
func (b *StreamBroker) Fail(id uint64, slot, errMsg string) {
	b.mu.RLock()
	s := b.streams[streamKey(id, slot)]
	b.mu.RUnlock()
	if s == nil {
		return
	}
	s.mu.Lock()
	s.phase = StreamPhaseError
	s.errMsg = errMsg
	s.doneAt = time.Now()
	evt := StreamEvent{Phase: StreamPhaseError, Slot: slot, Error: errMsg}
	for ch := range s.subs {
		nonBlockingSend(ch, evt)
	}
	s.mu.Unlock()
}

// FailAll — submission 整体被取消 (DeleteSubmission) 时, 把所有 slot 一次性 Fail,
// 让所有 active SSE 客户端立即收到 error 然后 close。
func (b *StreamBroker) FailAll(id uint64, errMsg string) {
	prefix := fmt.Sprintf("%d|", id)
	b.mu.RLock()
	keys := make([]string, 0)
	for k := range b.streams {
		if len(k) >= len(prefix) && k[:len(prefix)] == prefix {
			keys = append(keys, k)
		}
	}
	b.mu.RUnlock()
	for _, k := range keys {
		// 从 key 反推 slot
		slot := k[len(prefix):]
		b.Fail(id, slot, errMsg)
	}
}

// Subscribe 给 SSE 端点订阅, 返回 (snapshot 初始事件, 后续 events channel, unsubscribe func)。
// 没有对应 stream → 返 nil channel (调用方应判 nil 后直接关掉 SSE)。
func (b *StreamBroker) Subscribe(id uint64, slot string, bufSize int) (StreamEvent, <-chan StreamEvent, func()) {
	b.mu.Lock()
	s, ok := b.streams[streamKey(id, slot)]
	if !ok {
		// 没有正在跑的 stream — 让调用方拿到一个 phase=done 的空快照, channel = nil
		b.mu.Unlock()
		return StreamEvent{Phase: StreamPhaseDone, Slot: slot}, nil, func() {}
	}
	b.mu.Unlock()

	ch := make(chan StreamEvent, bufSize)
	s.mu.Lock()
	snap := StreamEvent{Phase: s.phase, Slot: slot, Text: s.text.String(), Error: s.errMsg}
	s.subs[ch] = struct{}{}
	s.mu.Unlock()

	unsub := func() {
		s.mu.Lock()
		delete(s.subs, ch)
		s.mu.Unlock()
		// 不 close(ch) 给发送端避免 panic;reader goroutine 终止前 drain
	}
	return snap, ch, unsub
}

// SubscribePending 跟 Subscribe 同义, 但 stream 不存在时**先建一个 computing 占位**并挂上订阅者:
// 于是"在 slot 还没 Begin 之前就来订阅"的客户端会在后续 Begin/Append 时收到事件, 而非立刻拿 done 后断开。
// 用于审稿中(reviewing)前端提前订阅 reviewer:alpha/beta/gamma/chief —— 4 轮串行, 后面几个 slot 起步晚,
// 不 pending 的话前端订阅早了会立即收到 done 而漏掉整段流(这正是详情页"一口气出"的根因之一)。
// 占位流若始终没 Begin, 由 gcOnce 的僵尸清理兜底。
func (b *StreamBroker) SubscribePending(id uint64, slot string, bufSize int) (StreamEvent, <-chan StreamEvent, func()) {
	key := streamKey(id, slot)
	b.mu.Lock()
	s, ok := b.streams[key]
	if !ok {
		s = &stream{slot: slot, phase: StreamPhaseComputing, createdAt: time.Now(), subs: make(map[chan StreamEvent]struct{})}
		b.streams[key] = s
	}
	b.mu.Unlock()

	ch := make(chan StreamEvent, bufSize)
	s.mu.Lock()
	snap := StreamEvent{Phase: s.phase, Slot: slot, Text: s.text.String(), Error: s.errMsg}
	s.subs[ch] = struct{}{}
	s.mu.Unlock()

	unsub := func() {
		s.mu.Lock()
		delete(s.subs, ch)
		s.mu.Unlock()
	}
	return snap, ch, unsub
}

// WaitDone 给"调用方想知道流到底完没完", 比 ctx 超时短的话提前返。
// 当前未使用, 留作未来 admin 调试接口的钩子。
func (b *StreamBroker) WaitDone(ctx context.Context, id uint64, slot string) error {
	_, ch, unsub := b.Subscribe(id, slot, 16)
	defer unsub()
	if ch == nil {
		return nil
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case evt := <-ch:
			if evt.Phase == StreamPhaseDone || evt.Phase == StreamPhaseError {
				return nil
			}
		}
	}
}

// nonBlockingSend 给 subscriber channel 推一条; 满了就丢弃 (避免一个慢消费者拖垮所有人)。
// 实际 SSE 写超时由 handler 自己控制, broker 不阻塞。
func nonBlockingSend(ch chan StreamEvent, evt StreamEvent) {
	select {
	case ch <- evt:
	default:
		// 满了 — 丢一帧, 下次 snapshot 还能拿到累积 text 重建
	}
}
