package agentrun

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"scholar-backend/internal/agentbridge"
)

// 针对**真实 MySQL** 的调度语义测试。
//
// 为什么必须打真库、不能用 sqlite 替身:本文件测的四件事全部依赖 MySQL 的具体语义 ——
// 条件 UPDATE 的 RowsAffected、读已提交下的并发可见性、DATETIME(3) 的比较精度。
// 换个引擎测出来的"通过"证明不了生产会通过,那正是本仓库反复吃过的假绿。
//
// 不设 AGENTRUN_TEST_DSN 时整族 skip 并**明确说明跳过了什么**(不是静默绿灯)。
// 跑法:
//
//	AGENTRUN_TEST_DSN='scholar_user:scholar_pass@tcp(127.0.0.1:3306)/scholar?parseTime=true&loc=Local' \
//	  go test ./internal/agentrun/ -run MySQL -v
func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("AGENTRUN_TEST_DSN")
	if dsn == "" {
		t.Skip("跳过:未设 AGENTRUN_TEST_DSN —— 原子认领/串行/租约回收**本次没有被验证**,不是通过")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	return db
}

// 每个用例用独立 runID 命名空间,互不干扰;结束后清理。
func seedRun(t *testing.T, r *Repo, runID uint64, steps ...string) func() {
	t.Helper()
	ctx := context.Background()
	tpl := RunTemplate{Key: "t", Steps: make([]StepDef, 0, len(steps))}
	for _, k := range steps {
		tpl.Steps = append(tpl.Steps, StepDef{Key: k})
	}
	if err := r.SeedSteps(ctx, runID, "test", tpl); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return func() {
		r.db.Where("saga_id = ?", SagaIDFor(runID)).Delete(&agentbridge.SagaStepRow{})
	}
}

func TestMySQLClaimIsAtomic(t *testing.T) {
	db := openTestDB(t)
	r := NewRepo(db)
	const runID = 9900001
	defer seedRun(t, r, runID, "s1")()

	// 🔴 核心不变式:N 个 worker 同时认领同一步,**有且只有一个**成功。
	// 失守的后果不是报错,是同一步被跑两遍 —— 烧两份钱、两份产物互相覆盖,
	// 而 Run 看起来一切正常。这正是 MySQL 无 RETURNING 时最容易写错的地方。
	const workers = 12
	var wg sync.WaitGroup
	var mu sync.Mutex
	won := 0
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func(i int) {
			defer wg.Done()
			step, err := r.ClaimNextStep(context.Background(), runID, "w", time.Minute, 0)
			if err == nil && step != nil {
				mu.Lock()
				won++
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()
	if won != 1 {
		t.Fatalf("并发认领赢家 = %d,必须恰好 1 —— 否则同一步会被跑多遍", won)
	}
}

func TestMySQLSerialDoesNotSkipRunningStep(t *testing.T) {
	db := openTestDB(t)
	r := NewRepo(db)
	const runID = 9900002
	defer seedRun(t, r, runID, "s1", "s2")()
	ctx := context.Background()

	first, err := r.ClaimNextStep(ctx, runID, "w1", time.Minute, 0)
	if err != nil || first == nil {
		t.Fatalf("first claim failed: %v", err)
	}
	if first.StepKey != "s1" {
		t.Fatalf("first claimed %s, want s1", first.StepKey)
	}

	// 🔴 串行语义:s1 正在跑(租约有效)时,**谁也不能去认领 s2**。
	// 曾经的写法「取最早的 pending 或租约过期的 running」会跳过 s1 直接拿 s2,
	// 于是两步并发跑、s2 读不到 s1 的产物 —— 而且完全没有报错。
	if second, err := r.ClaimNextStep(ctx, runID, "w2", time.Minute, 0); err == nil && second != nil {
		t.Fatalf("在 s1 运行中却认领到了 %s —— 串行语义被破坏", second.StepKey)
	}

	// s1 收口后,s2 才轮得到。
	if err := r.CompleteStep(ctx, first.ID, nil, OutputRef{Chars: 1}); err != nil {
		t.Fatalf("complete: %v", err)
	}
	next, err := r.ClaimNextStep(ctx, runID, "w2", time.Minute, 0)
	if err != nil || next == nil || next.StepKey != "s2" {
		t.Fatalf("s1 完成后应能认领 s2,得到 %v err=%v", next, err)
	}
}

func TestMySQLExpiredLeaseIsReclaimed(t *testing.T) {
	db := openTestDB(t)
	r := NewRepo(db)
	const runID = 9900003
	defer seedRun(t, r, runID, "s1")()
	ctx := context.Background()

	// 认领后立刻让租约过期(模拟 worker 被 kill -9)。
	step, err := r.ClaimNextStep(ctx, runID, "dead-worker", time.Minute, 0)
	if err != nil || step == nil {
		t.Fatalf("claim: %v", err)
	}
	past := time.Now().Add(-time.Hour)
	if err := db.Model(&agentbridge.SagaStepRow{}).Where("id = ?", step.ID).
		Update("lease_until", past).Error; err != nil {
		t.Fatalf("expire lease: %v", err)
	}

	n, err := r.ReconcileLeases(ctx)
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if n < 1 {
		t.Fatal("租约过期的 running 步必须被退回 pending —— 否则 worker 一崩,Run 永久卡死")
	}
	// 回收后能被重新认领(这才叫"续跑")。
	again, err := r.ClaimNextStep(ctx, runID, "new-worker", time.Minute, 0)
	if err != nil || again == nil {
		t.Fatalf("回收后应可重新认领: %v", err)
	}
	if again.Attempt < 2 {
		t.Fatalf("attempt 应随每次认领自增,得到 %d", again.Attempt)
	}
}

func TestMySQLReconcileOnlyTouchesRunSagas(t *testing.T) {
	db := openTestDB(t)
	r := NewRepo(db)
	ctx := context.Background()

	// 🔴 0048 是**通用**底座,peerreview 之类的编排骑同一张表。
	// reconciler 只能回收 `run:` 前缀的步 —— 回收别人的会破坏那些编排自己的状态机。
	foreign := agentbridge.SagaStepRow{
		SagaID: "peerreview:99999", FeatureKey: "peerreview", StepKey: "alpha",
		Status: StepRunning, ExecutorID: "x",
	}
	past := time.Now().Add(-time.Hour)
	foreign.LeaseUntil = &past
	if err := db.Create(&foreign).Error; err != nil {
		t.Fatalf("seed foreign saga: %v", err)
	}
	defer db.Where("saga_id = ?", foreign.SagaID).Delete(&agentbridge.SagaStepRow{})

	if _, err := r.ReconcileLeases(ctx); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	var after agentbridge.SagaStepRow
	if err := db.First(&after, foreign.ID).Error; err != nil {
		t.Fatalf("reload: %v", err)
	}
	if after.Status != StepRunning {
		t.Fatalf("非 run: 前缀的 saga 被动了(status=%s)—— 会破坏 peerreview 自己的状态机", after.Status)
	}
}

func TestMySQLRequeueKeepsAttemptAndAllowsContinue(t *testing.T) {
	db := openTestDB(t)
	r := NewRepo(db)
	const runID = 9900004
	defer seedRun(t, r, runID, "s1")()
	ctx := context.Background()

	step, _ := r.ClaimNextStep(ctx, runID, "w", time.Minute, 0)
	if step == nil {
		t.Fatal("claim failed")
	}
	// 分页重排队(轮尽)——**不是失败**。
	if err := r.RequeueStep(ctx, step.ID, "step_incomplete"); err != nil {
		t.Fatalf("requeue: %v", err)
	}
	again, err := r.ClaimNextStep(ctx, runID, "w", time.Minute, 0)
	if err != nil || again == nil {
		t.Fatalf("重排队后应能继续认领: %v", err)
	}
	if again.Attempt != 2 {
		t.Fatalf("attempt = %d,want 2(每次认领 +1,用于 DLQ 判定)", again.Attempt)
	}
	if again.Status != StepRunning {
		t.Fatalf("status = %s,want running", again.Status)
	}
}

func TestMySQLOutputRefRejectsInlineBody(t *testing.T) {
	db := openTestDB(t)
	r := NewRepo(db)
	const runID = 9900005
	defer seedRun(t, r, runID, "s1")()
	ctx := context.Background()

	step, _ := r.ClaimNextStep(ctx, runID, "w", time.Minute, 0)
	if step == nil {
		t.Fatal("claim failed")
	}
	// 🔴 契约执法:正文永远在 workDir,DB 只存引用。
	// 没有这条断言,一定有人图省事把整篇中间稿塞进 JSON 列。
	big := make([]byte, OutputRefMaxBytes+1)
	for i := range big {
		big[i] = 'x'
	}
	err := r.CompleteStep(ctx, step.ID, nil, OutputRef{Note: string(big)})
	if err == nil {
		t.Fatal("超限的 output_ref 必须被拒绝(正文不许进 DB)")
	}
}
