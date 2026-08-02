// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gorm.io/gorm"
)

// ── 写侧合并 batcher(200ms / 4KB)—— P0 强制(详细设计 §3.2)。──
//
// 目的:把 content_delta 在写侧合并成 O(content-blocks) 行(非 O(tokens)),且真正的
// MySQL INSERT 脱离同步浏览器扇出热路径(在独立 writeLoop goroutine 做)。delta 路径
// 在 upstreamLoop 里只做内存 buf append + 可能 arm timer,完全无 MySQL。
//
// ev_seq 分配硬约束:delta 与非 delta 共用同一 per-turn nextSeq、同一把 b.mu(防撞
// UNIQUE(turn_id, ev_seq))。P0/P1 upstreamLoop 是 per-(feature,session) 单 goroutine
// (jsonl 单写者不变式仍在),故 nextSeq 无需 DB 取;UNIQUE 是 P2 多写者的 replica-safe 兜底。

const (
	batchFlushBytes    = 4096                   // 累计文本达 4KB → 立即 flush
	batchFlushInterval = 200 * time.Millisecond // 否则 200ms 后 flush
	batchWriteChanSize = 2048                   // 异步写通道缓冲(满则挂 overflow,由 drainLoop 锁外落库)
	overflowCap        = 50000                  // overflow 缓冲封顶:超界退回同步落库背压(防 MySQL 长挂时内存无界)
	overflowDrainEvery = 50 * time.Millisecond  // drainLoop 排空周期
)

// deltaAccum 是某 turn 的内存累加器。受 deltaBatcher.mu 守护。
// 文本(content_delta)与思考(thinking)各自合并到独立 buffer,避免一轮 ~百帧 thinking 爆行;
// 切块(type change)/ 非流式事件时按序 flush,保留「思考块 → 文本块 → 工具」的交错顺序。
type deltaAccum struct {
	turnID    uint64
	sid       string
	buf       strings.Builder // content_delta 合并文本(O(content-block) 非 O(token))
	bytes     int
	thinkBuf  strings.Builder // thinking 合并文本(独立 buffer)
	thinkByte int
	toolBuf   strings.Builder // content_delta.toolInput 合并(工具入参流,2026-07:供 in-flight replay 还原流式写文件预览)
	toolByte  int
	toolPath  string // 当前 toolInput 段的目标文件(agent 每帧可带;段内取最后非空,flush 时随行落库)
	nextSeq   uint        // 下一个 ev_seq(delta / thinking / toolInput / 非 delta 共用)
	timer     *time.Timer // 200ms flush(armed 时非 nil)
}

type deltaBatcher struct {
	mu        sync.Mutex
	db        *gorm.DB
	accums    map[uint64]*deltaAccum
	writeCh   chan *TurnEventRow
	overflow  []*TurnEventRow // 受 mu 守护:writeCh 满时的溢出行,由 drainLoop 锁外落库(不在扇出热路径持锁写 MySQL)
	stopDrain chan struct{}   // Shutdown 时关闭,通知 drainLoop 做最终排空后退出
	closed    bool            // 受 mu 守护:Shutdown 后 enqueue 改同步落库,不再 send 已关通道
	wg        sync.WaitGroup  // writeLoop + drainLoop 生命周期(优雅 drain)
	failCnt   atomic.Int64    // M4:落库最终失败计数(journal 已是历史唯一真源 → 失败必须可观测)
}

func newDeltaBatcher(db *gorm.DB) *deltaBatcher {
	b := &deltaBatcher{
		db:        db,
		accums:    make(map[uint64]*deltaAccum),
		writeCh:   make(chan *TurnEventRow, batchWriteChanSize),
		stopDrain: make(chan struct{}),
	}
	b.wg.Add(2)
	go b.writeLoop()
	go b.drainLoop()
	return b
}

// writeLoop 单后台 goroutine 串行落库(脱离 upstreamLoop 热路径)。
func (b *deltaBatcher) writeLoop() {
	defer b.wg.Done()
	for row := range b.writeCh {
		_ = b.createWithRetry(row)
	}
}

// drainLoop 周期性把 overflow 缓冲(writeCh 满时积压)在【锁外】落库(评审 2026-07 性能审计 P0)。
// 旧逻辑:writeCh 满时在 enqueue 里【持全局 b.mu】同步 createWithRetry(含最长 3×重试 sleep)——
// MySQL 一抖动就把所有会话的 append(流式扇出热路径)全卡在 b.mu 上,级联冻结全平台流式。
// 现在满则挂 overflow(锁内仅 append 切片,O(1)),真正的 DB IO 移到此后台 goroutine,不再持热路径锁。
func (b *deltaBatcher) drainLoop() {
	defer b.wg.Done()
	ticker := time.NewTicker(overflowDrainEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			b.drainOverflow()
		case <-b.stopDrain:
			b.drainOverflow() // 最终排空:保证 Shutdown 前挂在 overflow 的行都落库
			return
		}
	}
}

// drainOverflow 锁内换出 overflow 切片,锁外逐行落库。ev_seq 已在入队前分配(payload 自带),
// 读侧按 ev_seq 排序重放,故落库顺序无关正确性——writeLoop 与 drainLoop 并发 INSERT 安全。
func (b *deltaBatcher) drainOverflow() {
	b.mu.Lock()
	rows := b.overflow
	b.overflow = nil
	b.mu.Unlock()
	for _, r := range rows {
		_ = b.createWithRetry(r)
	}
}

// createWithRetry 落一行事件,带有限重试 + 失败可观测(M4)。journal 现在是 executor feature 历史的
// **唯一真源**(fork 已退役),写失败 = 永久不可恢复 → 不能再像 shadow 期只 Warn 后吞掉:
// 重试 3 次(短退避吸收 DB 瞬时抖动),仍失败则计数 + Error(可被 docker logs / 监控抓到)。
// 重试撞 UNIQUE(turn_id,ev_seq)= 前一次其实写成功了 → 视为成功(幂等)。
func (b *deltaBatcher) createWithRetry(row *TurnEventRow) error {
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		if err = b.db.Create(row).Error; err == nil {
			return nil
		}
		if IsDuplicateKey(err) {
			return nil // 重试导致的重复 = 已落库
		}
		time.Sleep(time.Duration(20*(attempt+1)) * time.Millisecond)
	}
	n := b.failCnt.Add(1)
	slog.Error("agentbridge: event journal insert FAILED after retries (journal=历史唯一真源, 此行已丢)",
		"turn_id", row.TurnID, "ev_seq", row.EvSeq, "ev_type", row.EvType, "err", err, "total_failures", n)
	return err
}

// writeFailures 返回累计落库失败数(M4 可观测:=0 才可信 journal 完整;>0 需排查)。
func (b *deltaBatcher) writeFailures() int64 { return b.failCnt.Load() }

// Shutdown 优雅停机:关通道 + 等 writeLoop 把在途行 drain 完(ctx 超时则放弃)。
// 防部署/重启时 writeCh 里未落盘的事件随进程退出丢失。
func (b *deltaBatcher) Shutdown(ctx context.Context) {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}
	b.closed = true
	close(b.writeCh)
	close(b.stopDrain) // 通知 drainLoop 最终排空 overflow 后退出
	b.mu.Unlock()

	done := make(chan struct{})
	go func() { b.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-ctx.Done():
		slog.Warn("agentbridge: journal drain timed out on shutdown", "pending_failures", b.failCnt.Load())
	}
}

// accumLocked 取(或建)某 turn 的累加器。caller 持 b.mu。
func (b *deltaBatcher) accumLocked(turnID uint64, sid string) *deltaAccum {
	a := b.accums[turnID]
	if a == nil {
		a = &deltaAccum{turnID: turnID, sid: sid}
		b.accums[turnID] = a
	}
	return a
}

// buildDeltaRowLocked 把缓冲的合并 content_delta 取成一行(占一个 nextSeq),清空 buffer。
// 返回 nil = 无待写。caller 持 b.mu。供异步(flushDeltaLocked)与同步(flushTurnSync)共用。
func (b *deltaBatcher) buildDeltaRowLocked(a *deltaAccum) *TurnEventRow {
	if a.bytes == 0 {
		return nil
	}
	payload, _ := json.Marshal(map[string]string{"type": string(EvContentDelta), "text": a.buf.String()})
	row := &TurnEventRow{TurnID: a.turnID, AgentSessionID: a.sid, EvSeq: a.nextSeq, EvType: string(EvContentDelta), Payload: payload}
	a.nextSeq++
	a.buf.Reset()
	a.bytes = 0
	return row
}

// buildThinkRowLocked 同上,thinking buffer。caller 持 b.mu。
func (b *deltaBatcher) buildThinkRowLocked(a *deltaAccum) *TurnEventRow {
	if a.thinkByte == 0 {
		return nil
	}
	payload, _ := json.Marshal(map[string]string{"type": string(EvThinking), "text": a.thinkBuf.String()})
	row := &TurnEventRow{TurnID: a.turnID, AgentSessionID: a.sid, EvSeq: a.nextSeq, EvType: string(EvThinking), Payload: payload}
	a.nextSeq++
	a.thinkBuf.Reset()
	a.thinkByte = 0
	return row
}

// buildToolRowLocked 同上,toolInput buffer(帧形态与 agent 原帧同构:content_delta{toolInput,toolPath},
// in-flight replay 原样重发即可被前端 fold 消费;历史 fold 对该形态有守卫不产 message)。caller 持 b.mu。
func (b *deltaBatcher) buildToolRowLocked(a *deltaAccum) *TurnEventRow {
	if a.toolByte == 0 {
		return nil
	}
	m := map[string]string{"type": string(EvContentDelta), "toolInput": a.toolBuf.String()}
	if a.toolPath != "" {
		m["toolPath"] = a.toolPath
	}
	payload, _ := json.Marshal(m)
	row := &TurnEventRow{TurnID: a.turnID, AgentSessionID: a.sid, EvSeq: a.nextSeq, EvType: string(EvContentDelta), Payload: payload}
	a.nextSeq++
	a.toolBuf.Reset()
	a.toolByte = 0
	a.toolPath = ""
	return row
}

func (b *deltaBatcher) flushDeltaLocked(a *deltaAccum) {
	if row := b.buildDeltaRowLocked(a); row != nil {
		b.enqueue(row)
	}
}

func (b *deltaBatcher) flushThinkLocked(a *deltaAccum) {
	if row := b.buildThinkRowLocked(a); row != nil {
		b.enqueue(row)
	}
}

func (b *deltaBatcher) flushToolLocked(a *deltaAccum) {
	if row := b.buildToolRowLocked(a); row != nil {
		b.enqueue(row)
	}
}

// enqueue 异步入队。caller 持 b.mu。绝不丢事件:
//   - 稳态通道满 → 挂 overflow(锁内仅 append 切片,O(1)),真正的 DB IO 由 drainLoop 锁外做,
//     不再在扇出热路径持全局锁同步写 MySQL(性能审计 P0:根除 MySQL 抖动冻结全平台流式)。
//   - overflow 超封顶(MySQL 长时间不可用)→ 退回同步落库做背压(宁可慢不 OOM,journal 是唯一真源)。
//   - 已 Shutdown → 同步落库(非稳态热路径,可接受)。
func (b *deltaBatcher) enqueue(row *TurnEventRow) {
	if b.closed {
		_ = b.createWithRetry(row)
		return
	}
	select {
	case b.writeCh <- row:
	default:
		if len(b.overflow) < overflowCap {
			b.overflow = append(b.overflow, row)
		} else {
			_ = b.createWithRetry(row)
		}
	}
}

// flushTurnSync 终态前**同步**把该 turn 缓冲的最后一段 delta/thinking 落库(绕异步通道,带重试),
// 保证「答案文本」在 status=complete 前已持久 —— 杜绝 M5 截断:崩在「标记完成 ↔ 异步 writeLoop 落盘」
// 窗口会让 status=complete 但末段 delta 永久丢失。append 切块逻辑保证终态时至多一种 buffer 非空。
func (b *deltaBatcher) flushTurnSync(turnID uint64) error {
	b.mu.Lock()
	a := b.accums[turnID]
	if a == nil {
		b.mu.Unlock()
		return nil
	}
	b.stopTimerLocked(a)
	dRow := b.buildDeltaRowLocked(a)
	tRow := b.buildThinkRowLocked(a)
	tlRow := b.buildToolRowLocked(a)
	b.mu.Unlock()

	var firstErr error
	for _, r := range []*TurnEventRow{dRow, tRow, tlRow} {
		if r == nil {
			continue
		}
		if err := b.createWithRetry(r); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// append 处理一个事件。delta(有 text)累加;其余 flush 当前 delta 再立即取号入队。
// **终态事件(message_complete / error)同步落库**(连同末段 delta/think):journal 是历史唯一真源,
// 必须保证「答案文本 + 终态」在 CompleteTurn 标记 status 前已持久,杜绝 M5 截断窗口。
func (b *deltaBatcher) append(turnID uint64, sid string, evType EvType, frame []byte) {
	b.mu.Lock()
	a := b.accumLocked(turnID, sid)

	if evType == EvContentDelta {
		text := extractDeltaText(frame)
		if text == "" {
			// toolInput 变体(工具入参流,2026-07 起入 journal):独立 buffer 合并成 O(4KB) 行。
			// 价值:in-flight replay 走 journal(addSubscriber useJournal 路径),此前该信号不落库
			// → 重连/刷新时进行中的流式写文件预览「消失到 tool_use_complete 才恢复」。写放大有界:
			// agent 侧 MAX_STREAM_JSON=512KB 截流;历史 fold(FoldToMessages)对 toolInput 行已有
			// 守卫不产 message。真空帧(无 text 无 toolInput)仍旧跳过。
			ti, tp := extractDeltaToolInput(frame)
			if ti == "" {
				b.mu.Unlock()
				return
			}
			if a.bytes > 0 {
				b.flushDeltaLocked(a) // 切块保序:文本 → 工具入参
			}
			if a.thinkByte > 0 {
				b.flushThinkLocked(a)
			}
			a.toolBuf.WriteString(ti)
			a.toolByte += len(ti)
			if tp != "" {
				a.toolPath = tp
			}
			if a.toolByte >= batchFlushBytes {
				b.stopTimerLocked(a)
				b.flushToolLocked(a)
				b.mu.Unlock()
				return
			}
			if a.timer == nil {
				tid := turnID
				a.timer = time.AfterFunc(batchFlushInterval, func() { b.timedFlush(tid) })
			}
			b.mu.Unlock()
			return
		}
		if a.thinkByte > 0 {
			b.flushThinkLocked(a) // 切块:先落 thinking 再开始攒文本,保交错顺序
		}
		if a.toolByte > 0 {
			b.flushToolLocked(a) // 切块:工具入参流 → 文本
		}
		a.buf.WriteString(text)
		a.bytes += len(text)
		if a.bytes >= batchFlushBytes {
			b.stopTimerLocked(a)
			b.flushDeltaLocked(a)
			b.mu.Unlock()
			return
		}
		if a.timer == nil {
			tid := turnID
			a.timer = time.AfterFunc(batchFlushInterval, func() { b.timedFlush(tid) })
		}
		b.mu.Unlock()
		return
	}

	if evType == EvThinking {
		text := extractDeltaText(frame) // thinking 帧文本也在 text 字段
		if text == "" {
			b.mu.Unlock()
			return
		}
		if a.bytes > 0 {
			b.flushDeltaLocked(a) // 切块:先落文本再开始攒 thinking
		}
		if a.toolByte > 0 {
			b.flushToolLocked(a) // 切块:工具入参流 → thinking
		}
		a.thinkBuf.WriteString(text)
		a.thinkByte += len(text)
		if a.thinkByte >= batchFlushBytes {
			b.stopTimerLocked(a)
			b.flushThinkLocked(a)
			b.mu.Unlock()
			return
		}
		if a.timer == nil {
			tid := turnID
			a.timer = time.AfterFunc(batchFlushInterval, func() { b.timedFlush(tid) })
		}
		b.mu.Unlock()
		return
	}

	// 非流式事件:先 flush 当前 delta + thinking + toolInput(各占 nextSeq、保序),再给本事件取号。
	// (toolInput 段的下一个非流式事件通常就是它的 tool_use_complete —— 流式行落在完整 input 行之前,保序。)
	b.stopTimerLocked(a)
	dRow := b.buildDeltaRowLocked(a)
	tRow := b.buildThinkRowLocked(a)
	tlRow := b.buildToolRowLocked(a)
	evRow := &TurnEventRow{TurnID: turnID, AgentSessionID: sid, EvSeq: a.nextSeq, EvType: string(evType), Payload: append(json.RawMessage(nil), frame...)}
	a.nextSeq++

	if evType == EvMessageComplete || evType == EvError {
		// 终态:锁外同步落库(不阻塞其它 turn 的 append),保证答案+终态先于 status=complete 持久(M5)。
		b.mu.Unlock()
		for _, r := range []*TurnEventRow{dRow, tRow, tlRow, evRow} {
			if r != nil {
				_ = b.createWithRetry(r)
			}
		}
		return
	}

	// 普通非流式(tool_use / tool_result / permission / content_start):异步入队。
	for _, r := range []*TurnEventRow{dRow, tRow, tlRow, evRow} {
		if r != nil {
			b.enqueue(r)
		}
	}
	b.mu.Unlock()
}

func (b *deltaBatcher) stopTimerLocked(a *deltaAccum) {
	if a.timer != nil {
		a.timer.Stop()
		a.timer = nil
	}
}

func (b *deltaBatcher) timedFlush(turnID uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.accums[turnID]
	if a == nil {
		return
	}
	a.timer = nil
	b.flushDeltaLocked(a)
	b.flushThinkLocked(a)
	b.flushToolLocked(a)
}

// flushTurn 强制 flush 某 turn 的待写 delta + thinking + toolInput(turn 终结符时调)。
func (b *deltaBatcher) flushTurn(turnID uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.accums[turnID]
	if a == nil {
		return
	}
	b.stopTimerLocked(a)
	b.flushDeltaLocked(a)
	b.flushThinkLocked(a)
	b.flushToolLocked(a)
}

// dropTurn 清理某 turn 的 accum(turn 终态后,防 map 无界增长)。
func (b *deltaBatcher) dropTurn(turnID uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if a := b.accums[turnID]; a != nil {
		b.stopTimerLocked(a)
	}
	delete(b.accums, turnID)
}

// extractDeltaText 从 content_delta 帧取 text 字段(无 text = toolInput 变体,返回 "")。
func extractDeltaText(frame []byte) string {
	var f struct {
		Text string `json:"text"`
	}
	_ = json.Unmarshal(frame, &f)
	return f.Text
}

// extractDeltaToolInput 从 content_delta 帧取 toolInput/toolPath(非 toolInput 变体返回 "")。
func extractDeltaToolInput(frame []byte) (string, string) {
	var f struct {
		ToolInput string `json:"toolInput"`
		ToolPath  string `json:"toolPath"`
	}
	_ = json.Unmarshal(frame, &f)
	return f.ToolInput, f.ToolPath
}
