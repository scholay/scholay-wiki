// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 轮末产物收割派发(2026-08-07 交付链路重建 · B1)
//
// ── 为什么需要它:生产实测的病灶 ────────────────────────────────────────────────
//
// 2026-08-07 对生产库的取证:claw 里有 13 个会话调用过写文件工具(Write /
// ExportDocument / BuildDeck),但 `agent_artifacts` 里只有 7 个会话有行。
// 最典型的一例(会话 05fe48bb):模型把 9 份文件规规矩矩写进 `./out/`(系统综述、
// PRISMA 流程、RCT 分析),反复编辑,**发出了 12 个 artifact 帧** —— 用户当时在
// 对话里是看得见产物卡的 —— 但 `agent_artifacts` 一行都没有。
//
// 根因不是模型行为,也不是帧丢了,而是**耐久化的唯一触发点是用户点开产物面板**:
//
//	GET /<feature>/session/artifacts → GetSessionArtifacts → harvestSession
//
// 而会话工作区是临时的(executor 的 /home/bun/sessions,容器重启即清、30 天 GC)。
// 用户没在那个窗口期点过面板 → 永远不收割 → 重进会话面板是空的、卡片变成死链。
// 也就是说「一份成果能不能留下来」取决于用户有没有点某个按钮 —— 这不是一条能接受
// 的耐久语义,而且失败时**零日志**:没人知道东西丢过。
//
// 顺带说明另外两类同源的丢失:server-side 轮(没有前端连接,自然没人点面板)、
// 以及用户看完就关标签的轮。
//
// ── 修法 ────────────────────────────────────────────────────────────────────
//
// 轮一结束(complete / error / 硬超时 / 上游断开都算)就派发一次收割,与用户是否
// 在线、是否打开过面板无关。原来的 on-list 收割**保留**为兜底 —— 它现在只是一次
// 慢一步的幂等重复,不删,因为它同时兜住「钩子未接线的 feature」与「派发被丢弃」。
//
// ── 三条刻意的约束 ──────────────────────────────────────────────────────────
//
//	① 绝不在 hub 的 goroutine 里同步做 IO。收割要列目录 + 读字节 + PUT MinIO,
//	   放进 hub 的帧循环会阻塞该会话所有订阅者的扇出。
//	② 有界。队列满就丢弃 + slog.Error 计数,不静默、也不让 goroutine 无限增长。
//	   本仓库有过「fire-and-forget 易丢且不可观测」的前科,这里宁可吵。
//	③ 同会话去重。背靠背的快轮不该排出一串对同一个 `out/` 的重复扫描。
//	   去重位在**开工前**释放而不是收工后释放,理由见 work() 里的注释。
package agentbridge

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"scholar-backend/internal/common/safego"
)

const (
	// harvestQueueCap 队列容量。一次积压 2048 个会话级收割作业已经远超任何正常负载
	// (它等于「同时有 2048 个会话在同一瞬间结束轮次且 worker 全被卡住」);
	// 到这个量级说明下游(agent 容器 / MinIO)已经出了更大的问题,丢弃并大声报错
	// 比无限排队更可取 —— 排队只会把内存也一起拖垮。
	harvestQueueCap = 2048
	// harvestWorkers 并发收割数。收割是 IO 密集(HTTP 列目录 + 读字节 + MinIO PUT),
	// 但每个作业都会打 agent 容器,并发过高会和用户的实时请求抢执行器的 HTTP 处理能力。
	harvestWorkers = 4
	// harvestTimeout 单次收割上限。一个会话的 out/ 顶层文件数有限,正常在秒级;
	// 给到 2min 是为了容忍「一次交付十几 MB deck + 弱网 MinIO」的长尾。
	harvestTimeout = 2 * time.Minute
)

// harvestJob 一次会话级产物收割作业。
type harvestJob struct {
	hook      OnTurnArtifactsFn
	feature   string
	userID    uint
	sessionID string
}

// harvestDispatcher 有界队列 + 固定 worker 池。进程内单例(挂在 Bridge 上,懒启动)。
type harvestDispatcher struct {
	q chan harvestJob

	mu      sync.Mutex
	pending map[string]struct{} // "feature|sessionID" → 已在排队/刚出队

	dropped atomic.Int64
}

func newHarvestDispatcher() *harvestDispatcher {
	d := &harvestDispatcher{
		q:       make(chan harvestJob, harvestQueueCap),
		pending: make(map[string]struct{}, 64),
	}
	for i := 0; i < harvestWorkers; i++ {
		safego.Go("agentbridge-artifact-harvest", d.work)
	}
	return d
}

func harvestKey(feature, sessionID string) string { return feature + "|" + sessionID }

// enqueue 派发一次收割。非阻塞:队列满立即丢弃并留痕。
func (d *harvestDispatcher) enqueue(j harvestJob) {
	if j.hook == nil || j.sessionID == "" {
		return
	}
	k := harvestKey(j.feature, j.sessionID)

	d.mu.Lock()
	if _, dup := d.pending[k]; dup {
		d.mu.Unlock()
		return // 同会话已有在排的作业;收割是全量幂等 upsert,重复排队无收益
	}
	d.pending[k] = struct{}{}
	d.mu.Unlock()

	select {
	case d.q <- j:
	default:
		d.mu.Lock()
		delete(d.pending, k)
		d.mu.Unlock()
		n := d.dropped.Add(1)
		// 🔴 丢弃 = 该会话的产物退回「等用户打开面板才落库」的旧行为(不是永久丢失,
		//    因为 on-list 兜底还在),但那正是我们要消灭的语义,所以按 Error 报。
		slog.Error("agentbridge: 产物收割队列已满,作业被丢弃(该会话退回 on-list 兜底收割)",
			"feature", j.feature, "session_id", j.sessionID,
			"dropped_total", n, "cap", cap(d.q)) // 打真实容量而非常量:测试用的小队列不该在日志里自称 2048
	}
}

func (d *harvestDispatcher) work() {
	for j := range d.q {
		k := harvestKey(j.feature, j.sessionID)
		// 🔴 去重位在**开工前**释放,不是收工后。
		//    收工后释放会制造一个真实的丢失窗口:A 轮的收割正在列 out/ 目录时,
		//    B 轮结束并写出了新文件 —— B 的 enqueue 因为 pending 仍占着而被压掉,
		//    而 A 那次扫描早于 B 的文件出现 ⇒ B 的产物要等到再下一轮(或用户点面板)。
		//    开工前释放的代价是同一会话可能有两次收割并发跑;收割是按
		//    dedup_anchor 的幂等 upsert,并发重复只是把同样的字节多写一次,安全。
		d.mu.Lock()
		delete(d.pending, k)
		d.mu.Unlock()

		d.run(j)
	}
}

// run 跑一个作业。单个作业 panic 不能带走 worker(否则池会逐个死光而无人察觉)。
func (d *harvestDispatcher) run(j harvestJob) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("agentbridge: 产物收割 panic",
				"feature", j.feature, "session_id", j.sessionID, "panic", r)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), harvestTimeout)
	defer cancel()
	j.hook(ctx, j.userID, j.sessionID)
}

// enqueueArtifactHarvest 是 hub 的入口。懒启动 worker 池:没有任何 feature 接
// OnTurnArtifacts 时,一个 goroutine 都不会起。
func (b *Bridge) enqueueArtifactHarvest(j harvestJob) {
	if j.hook == nil {
		return
	}
	b.harvestOnce.Do(func() { b.harvest = newHarvestDispatcher() })
	b.harvest.enqueue(j)
}
