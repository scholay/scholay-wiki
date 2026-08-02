// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package safego

// 全局共享的「统计/账本异步落库」有界池。
//
// 背景: usagestat / llmusage / usagelog / hotcontent / seo seeds / thirdparty 这类
// fire-and-forget 统计写, 原来每个事件裸 `safego.Go` 一个 goroutine 做单行 INSERT/UPSERT。
// 正常流量没问题, 但 DB 一旦变慢, 这些无 deadline 的 goroutine 会无限堆积、长期占满
// 90 连接池连接, 反过来拖垮请求路径查询; 多 IP 洪泛也会绕过单实例内存限流直接放大 fan-out。
//
// 收口后: 全部统计写共享 recordPoolWorkers 个 worker, 在途 DB 写最多 = worker 数;
// 队列满直接 drop + Warn (统计是 best-effort, 宁丢不堆积)。
//
// 何时用 Record vs 裸 Go: 见 pool.go 顶部注释 —— 统计/遥测类 per-event 落库一律走 Record。

import (
	"log/slog"
	"time"
)

const (
	// recordPoolWorkers 在途统计写并发上限 —— 也是 DB 连接占用上限。
	// 单行 INSERT/UPSERT 亚毫秒级, 4 个 worker 足够吞每秒数千事件。
	recordPoolWorkers = 4
	// recordPoolQueue 待写事件缓冲。打满说明 DB 已经异常 (或被洪泛), 此时丢统计保业务。
	recordPoolQueue = 1024
)

var recordPool = NewPool("async-record", recordPoolWorkers, recordPoolQueue)

const (
	// 账本(llm_token_usage)专用池 —— 与匿名 beacon 类统计隔离。
	// 账本喂未来的计费重做(读这张表做收入归因),洪泛时绝不能和垃圾统计同等被丢。
	ledgerPoolWorkers = 2
	ledgerPoolQueue   = 512
)

var ledgerPool = NewPool("async-ledger", ledgerPoolWorkers, ledgerPoolQueue)

// Record 把一条 fire-and-forget 的统计/遥测写提交进全局有界池(beacon/曝光/热度等)。
// 不阻塞调用方; 队列满时直接丢弃该条并 Warn (带累计 rejected 计数, 方便监控调容量)。
func Record(name string, fn func()) {
	if !recordPool.Submit(fn) {
		_, rejected := recordPool.Stats()
		slog.Warn("async record pool full, task dropped", "task", name, "rejected_total", rejected)
	}
}

// ledgerSubmitWait 队列满时的最长等待。账本行丢一条就是「钱扣了但账上查无此笔」,
// 值得让调用方多等一小会儿;上界 2s 保证 WS pipe 的转发路径不会被 DB 抖动卡死。
const ledgerSubmitWait = 2 * time.Second

// RecordLedger 把一条**账本类**写(llm_token_usage)提交进独立的 ledger 池,
// 不与高频匿名 beacon 抢同一队列 —— 后者洪泛时不会顺带丢掉计费相关的账本行。
//
// 🔴 2026-08-02 计费审计 P1-5:额度/经费的扣减是**同步**发生的(llmusage.Record 里 observer
// 直调 vip.AddUsage → Redis INCRBY + 越线时 MySQL 事务实扣经费),而账本 INSERT 走这条
// 可丢的异步队列 —— 两者在 DB 劣化下的失败模式恰好相反:钱那边「慢但成」(ConsumeForQuota
// 的事务没有 ctx deadline),账本这边「快且丢」。结果是用户被扣了钱、per-call 明细查无此笔,
// admin 成本看板与用户月度热力图同步少计,且**没有任何补偿**(全仓无人读 rejected 计数、
// 无重试、无落盘 spool)。
// 现在:先等一小会儿(绝大多数抖动能排上),真丢了就打 **Error** 并把整行内容留在日志里 ——
// 至少从 docker logs 可人工追补,而不是无声无息。
func RecordLedger(name string, fn func()) {
	if ledgerPool.SubmitWait(fn, ledgerSubmitWait) {
		return
	}
	_, rejected := ledgerPool.Stats()
	slog.Error("async ledger pool full — 账本行已丢失(额度/经费已扣但 llm_token_usage 无此笔,需人工对账)",
		"task", name, "rejected_total", rejected, "waited", ledgerSubmitWait)
}
