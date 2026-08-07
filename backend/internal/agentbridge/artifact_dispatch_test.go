package agentbridge

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// 轮末产物收割派发器的行为测试。
//
// 这一族**刻意全是行为断言,没有一条源码文本断言**。本仓库有过教训:用
// `strings.Contains(source, "...")` 写的回归测试只能证明「那行字写了」,
// 证明不了「那行字起作用」—— 而这套机制最可能的死法恰恰是「写了但没接上」。

// newTestDispatcher 造一个不自动起 worker 的派发器,由测试自己驱动,避免时序不确定。
func newTestDispatcher(cap int) *harvestDispatcher {
	return &harvestDispatcher{
		q:       make(chan harvestJob, cap),
		pending: make(map[string]struct{}),
	}
}

func TestHarvestDispatcher_InvokesHook(t *testing.T) {
	d := newTestDispatcher(4)
	got := make(chan string, 1)
	d.enqueue(harvestJob{
		feature: "claw", userID: 7, sessionID: "s1",
		hook: func(ctx context.Context, userID uint, sessionID string) {
			if userID != 7 {
				t.Errorf("userID = %d, want 7", userID)
			}
			if _, ok := ctx.Deadline(); !ok {
				t.Error("钩子拿到的 ctx 没有 deadline —— 收割必须有上限,否则一次卡死会占死 worker")
			}
			got <- sessionID
		},
	})
	go d.work()
	select {
	case s := <-got:
		if s != "s1" {
			t.Errorf("sessionID = %q, want s1", s)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("钩子没有被调用")
	}
}

// nil 钩子 / 空 sessionID 必须被直接丢掉,不能占队列也不能进 pending。
func TestHarvestDispatcher_IgnoresInvalidJobs(t *testing.T) {
	d := newTestDispatcher(4)
	d.enqueue(harvestJob{feature: "claw", sessionID: "s1"})                                             // hook == nil
	d.enqueue(harvestJob{feature: "claw", hook: func(context.Context, uint, string) {}})                // sessionID == ""
	if n := len(d.q); n != 0 {
		t.Errorf("队列里有 %d 个无效作业,应为 0", n)
	}
	d.mu.Lock()
	np := len(d.pending)
	d.mu.Unlock()
	if np != 0 {
		t.Errorf("pending 残留 %d 个键 —— 会永久压掉该会话后续的收割", np)
	}
}

// 同会话在「已排队但还没被 worker 取走」期间重复派发 → 只排一个。
func TestHarvestDispatcher_DedupesWhileQueued(t *testing.T) {
	d := newTestDispatcher(8)
	hook := func(context.Context, uint, string) {}
	for i := 0; i < 5; i++ {
		d.enqueue(harvestJob{feature: "claw", sessionID: "same", hook: hook})
	}
	if n := len(d.q); n != 1 {
		t.Errorf("同会话连排 5 次 → 队列里 %d 个,want 1", n)
	}
	// 不同会话不该被误压。
	d.enqueue(harvestJob{feature: "claw", sessionID: "other", hook: hook})
	if n := len(d.q); n != 2 {
		t.Errorf("不同会话被误判成重复:队列 %d 个,want 2", n)
	}
	// 同名会话但不同 feature 也是两件事(产物按 feature 分表分桶)。
	d.enqueue(harvestJob{feature: "stat_lab", sessionID: "same", hook: hook})
	if n := len(d.q); n != 3 {
		t.Errorf("跨 feature 同名会话被误判成重复:队列 %d 个,want 3", n)
	}
}

// 🔴 这条钉的是 work() 里那个「去重位在开工前释放」的决定。
//
// 若改成收工后释放,就会出现真实的丢失窗口:A 轮的收割正在列目录时 B 轮结束并写出新文件,
// B 的 enqueue 被 pending 压掉,而 A 那次扫描早于 B 的文件出现 ⇒ B 的产物一直等到再下一轮。
// 所以:钩子执行**期间**,同会话必须还能重新排队。
func TestHarvestDispatcher_AllowsRequeueWhileHookRunning(t *testing.T) {
	d := newTestDispatcher(4)
	entered := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32

	hook := func(context.Context, uint, string) {
		if calls.Add(1) == 1 {
			close(entered)
			<-release // 卡住第一次收割,模拟「正在列目录」
		}
	}
	d.enqueue(harvestJob{feature: "claw", sessionID: "s1", hook: hook})
	go d.work()

	<-entered
	// 此刻第一次收割正在跑。第二轮结束 → 必须能重新入队。
	d.enqueue(harvestJob{feature: "claw", sessionID: "s1", hook: hook})
	if n := len(d.q); n != 1 {
		t.Fatalf("钩子执行期间同会话无法重新入队(队列 %d)—— 这会让第二轮的产物漏收", n)
	}
	close(release)
}

// 队列满 → 丢弃且**不阻塞**(派发发生在 hub 的 endTurn 里,阻塞会卡住整个会话的帧扇出),
// 且必须把 pending 位还回去,否则该会话之后永远排不进队。
func TestHarvestDispatcher_DropsWhenFullWithoutBlocking(t *testing.T) {
	d := newTestDispatcher(1)
	hook := func(context.Context, uint, string) {}
	d.enqueue(harvestJob{feature: "claw", sessionID: "s1", hook: hook}) // 占满

	done := make(chan struct{})
	go func() {
		d.enqueue(harvestJob{feature: "claw", sessionID: "s2", hook: hook}) // 应被丢弃
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("队列满时 enqueue 阻塞了 —— 它跑在 hub 的 endTurn 里,阻塞会卡死该会话的帧扇出")
	}
	if d.dropped.Load() != 1 {
		t.Errorf("dropped = %d, want 1(丢弃必须可观测)", d.dropped.Load())
	}
	d.mu.Lock()
	_, stuck := d.pending["claw|s2"]
	d.mu.Unlock()
	if stuck {
		t.Error("被丢弃的作业把 pending 位留下了 —— 该会话之后将永远排不进队")
	}
}

// 单个作业 panic 不能带走 worker(否则 worker 池会逐个死光而无人察觉)。
func TestHarvestDispatcher_PanicDoesNotKillWorker(t *testing.T) {
	d := newTestDispatcher(4)
	ok := make(chan struct{})
	d.enqueue(harvestJob{feature: "claw", sessionID: "boom", hook: func(context.Context, uint, string) {
		panic("收割炸了")
	}})
	d.enqueue(harvestJob{feature: "claw", sessionID: "after", hook: func(context.Context, uint, string) {
		close(ok)
	}})
	go d.work()
	select {
	case <-ok:
	case <-time.After(3 * time.Second):
		t.Fatal("前一个作业 panic 之后 worker 死了,后续会话再也不会被收割")
	}
}

// 🔴 接线测试:SetArtifactHarvester 必须真的把钩子装进**这个** FeatureBridge 的 spec。
//
// 防的是两件事:
//   ① 有人把接收者从 *FeatureBridge 改成 FeatureBridge —— 那样赋值落在副本上,
//     hub 读到的永远是 nil,机制静默消失且没有任何红灯;
//   ② 有人「顺手」把它改成返回新实例的形态,而 bootstrap 忽略了返回值。
func TestSetArtifactHarvester_ActuallyBindsToSpec(t *testing.T) {
	f := &FeatureBridge{spec: FeatureSpec{Key: "claw"}}
	if f.spec.OnTurnArtifacts != nil {
		t.Fatal("初始应为 nil")
	}
	var called atomic.Bool
	f.SetArtifactHarvester(func(context.Context, uint, string) { called.Store(true) })
	if f.spec.OnTurnArtifacts == nil {
		t.Fatal("SetArtifactHarvester 之后 spec.OnTurnArtifacts 仍是 nil —— " +
			"钩子没接上,endTurn 里的 `if hook != nil` 会恒 false,整套机制等于不存在")
	}
	f.spec.OnTurnArtifacts(context.Background(), 1, "s")
	if !called.Load() {
		t.Error("装进去的不是传入的那个函数")
	}
	// nil 可以摘掉(灰度/紧急关闭)。
	f.SetArtifactHarvester(nil)
	if f.spec.OnTurnArtifacts != nil {
		t.Error("SetArtifactHarvester(nil) 应能摘掉钩子")
	}
}

// 懒启动:Bridge 没有任何 feature 接钩子时,enqueueArtifactHarvest(nil hook) 不该起 worker 池。
func TestBridge_EnqueueSkipsNilHookWithoutStartingPool(t *testing.T) {
	b := &Bridge{}
	b.enqueueArtifactHarvest(harvestJob{feature: "claw", sessionID: "s1"}) // hook == nil
	if b.harvest != nil {
		t.Error("nil 钩子不该触发 worker 池懒启动")
	}
}

// 并发派发不能 data race(go test -race 下才有意义,但结构性覆盖先放这)。
func TestHarvestDispatcher_ConcurrentEnqueue(t *testing.T) {
	d := newTestDispatcher(256)
	hook := func(context.Context, uint, string) {}
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			d.enqueue(harvestJob{feature: "claw", sessionID: string(rune('a' + i%8)), hook: hook})
		}(i)
	}
	wg.Wait()
	if n := len(d.q); n == 0 || n > 8 {
		t.Errorf("并发派发 8 个不同会话 → 队列 %d 个,期望 1..8(去重后)", n)
	}
}
