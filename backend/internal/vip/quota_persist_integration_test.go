//go:build integration

// 额度窗口 MySQL 兜底副本(0103)集成测试 —— 直连 compose 的 MySQL + Redis。
//
// 🔴 这些用例守的是「Redis 丢数据那天」才第一次执行的那条路径。它平时不跑,所以只能靠测试
// 把「丢数据」这个事件**人工制造出来**(直接 DEL Redis 键),否则代码正确与否要等事故当天才知道。
//
// 运行(连 compose 网络):
//
//	docker run --rm --network scholar_scholar-network \
//	  -v "$PWD":/src -w /src -e CGO_ENABLED=0 \
//	  -e BILL_DSN='scholar_user:scholar_pass@tcp(mysql:3306)/scholar?charset=utf8mb4&parseTime=True&loc=Local' \
//	  -e BILL_REDIS_HOST=redis-persist \
//	  golang:1.23 go test -tags integration ./internal/vip/ -run QuotaPersist -v

package vip

import (
	"context"
	"testing"
	"time"

	"scholar-backend/internal/common/cache"

	"gorm.io/gorm"
)

// newPersistUser 建测试用户,并登记退出时清掉它的窗口行。
//
// 🔴 清理不是洁癖。本用例组会人为制造「DB 说在飞、Redis 无锚」的漂移,而漂移对账任务
// (cleanup,每 15 分钟)会把它当成真事故**永远告警下去** —— 开发机跑一次测试,
// 日志里从此每 15 分钟一条 WARN。一条恒亮的告警等于没有告警,而这条告警守的正是
// 「MySQL 兜底副本没写进去」这件只在灾难当天才致命的事。别让它被自己的测试数据淹掉。
func newPersistUser(t *testing.T, db *gorm.DB) uint {
	t.Helper()
	uid := mkUser(t, db)
	t.Cleanup(func() {
		db.Where("user_id = ?", uid).Delete(&QuotaWindowRow{})
	})
	return uid
}

// clearWindowKeys 模拟「Redis 侧这个用户的窗口没了」—— 换池 / 目录丢失 / FLUSHALL 的等价物。
func clearWindowKeys(t *testing.T, uid uint, anchor int64) {
	t.Helper()
	rdb := cache.GetRedisPersist()
	if err := rdb.Del(context.Background(),
		anchorKey(uid), tokenUsedKey(uid, anchor), noWindowKey(uid)).Err(); err != nil {
		t.Fatalf("clear redis window keys: %v", err)
	}
}

func windowRow(t *testing.T, db *gorm.DB, uid uint, anchor int64) QuotaWindowRow {
	t.Helper()
	var r QuotaWindowRow
	if err := db.Where("user_id = ? AND anchor_at = ?", uid, anchor).Take(&r).Error; err != nil {
		t.Fatalf("read window row (user=%d anchor=%d): %v", uid, anchor, err)
	}
	return r
}

// TestQuotaPersistRestoreAfterRedisLoss 主场景:用了额度 → Redis 整个丢掉 → 下次读额度时
// 从 MySQL 副本把窗口(含已用量)找回来,而不是白送一个满血窗口。
func TestQuotaPersistRestoreAfterRedisLoss(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	ctx := context.Background()
	uid := newPersistUser(t, db)

	const spent = 123_456 // 微元
	svc.AddUsage(ctx, uid, spent)

	w := svc.loadWindow(ctx, uid)
	if w.anchor <= 0 {
		t.Fatalf("AddUsage 后应有窗口, got anchor=%d", w.anchor)
	}
	if w.used != spent {
		t.Fatalf("used = %d, want %d", w.used, spent)
	}

	// used 是节流刷盘的 —— 测试里不等 60 秒 ticker,直接触发一次。
	svc.usedFlush.flush()

	row := windowRow(t, db, uid, w.anchor)
	if row.State != quotaWindowOpen {
		t.Fatalf("state = %q, want open", row.State)
	}
	if row.WindowUsedMicro != spent {
		t.Fatalf("落库 used = %d, want %d", row.WindowUsedMicro, spent)
	}
	if row.OpenReason != "usage" {
		t.Fatalf("open_reason = %q, want usage", row.OpenReason)
	}

	// ── 制造灾难 ──
	clearWindowKeys(t, uid, w.anchor)

	got := svc.loadWindow(ctx, uid)
	if got.anchor != w.anchor {
		t.Fatalf("恢复后 anchor = %d, want %d(窗口没被找回 = 用户白拿一整个窗口)", got.anchor, w.anchor)
	}
	if got.used != spent {
		t.Fatalf("恢复后 used = %d, want %d", got.used, spent)
	}
	if got.degraded {
		t.Fatalf("恢复不应标记 degraded")
	}

	// 恢复必须真的回灌 Redis(否则每次请求都打一次 MySQL)。
	if a, err := cache.GetRedisPersist().Get(ctx, anchorKey(uid)).Int64(); err != nil || a != w.anchor {
		t.Fatalf("恢复后 Redis anchor = %d (err=%v), want %d", a, err, w.anchor)
	}

	// 恢复之后继续消费,累加应接在恢复出来的基数上,而不是从 0 重新开始。
	svc.AddUsage(ctx, uid, 1_000)
	if after := svc.loadWindow(ctx, uid); after.used != spent+1_000 {
		t.Fatalf("恢复后再消费 used = %d, want %d", after.used, spent+1_000)
	}
}

// TestQuotaPersistUpgradeTombstone 这是整套方案里最贵的一条:升级满血靠 DEL anchor 实现,
// 若 DB 侧没有 tombstone,恢复会把**升级前那个已耗尽的窗口**读回来 —— 用户付钱买到的满血
// 被从背后撤销,而且系统认为一切正常(anchor 有效、used 有据可查)。
func TestQuotaPersistUpgradeTombstone(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	ctx := context.Background()
	uid := newPersistUser(t, db)

	svc.AddUsage(ctx, uid, 999_999)
	w := svc.loadWindow(ctx, uid)
	if w.anchor <= 0 {
		t.Fatal("前置:应已开窗")
	}
	svc.usedFlush.flush()

	// 升级满血
	if !svc.applyUpgradeRefill(ctx, uid) {
		t.Fatal("applyUpgradeRefill 应成功")
	}

	row := windowRow(t, db, uid, w.anchor)
	if row.State != quotaWindowVoided {
		t.Fatalf("升级后 state = %q, want voided —— 没有 tombstone 的恢复会夺回用户已兑现的满血", row.State)
	}
	if row.VoidedReason != "upgrade" {
		t.Fatalf("voided_reason = %q, want upgrade", row.VoidedReason)
	}

	// 制造灾难:满血状态下 Redis 丢数据,恢复**不能**把旧窗口读回来。
	clearWindowKeys(t, uid, w.anchor)
	if got := svc.loadWindow(ctx, uid); got.anchor != 0 || got.used != 0 {
		t.Fatalf("升级满血后遇 Redis 丢数据,应仍是满血,got anchor=%d used=%d", got.anchor, got.used)
	}
}

// TestQuotaPersistNoWindowNoRestore 从没用过 AI 的用户不应被恢复出任何窗口;
// 且要落负缓存,避免每次请求都打一次 MySQL。
func TestQuotaPersistNoWindowNoRestore(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	ctx := context.Background()
	uid := newPersistUser(t, db)

	_ = cache.GetRedisPersist().Del(ctx, noWindowKey(uid)).Err()

	if got := svc.loadWindow(ctx, uid); got.anchor != 0 || got.used != 0 {
		t.Fatalf("新用户应无窗口, got anchor=%d used=%d", got.anchor, got.used)
	}
	if v, err := cache.GetRedisPersist().Get(ctx, noWindowKey(uid)).Result(); err != nil || v == "" {
		t.Fatalf("应落负缓存(否则每个免费用户的每次请求都打一次 MySQL), err=%v", err)
	}
}

// TestQuotaPersistStaleFlushCannotResurrect 落后的 used 刷盘绝不能把已作废的窗口复活成 open,
// 也不能把已换锚的旧值写进新窗口 —— 后者由复合主键 (user_id, anchor_at) 在结构上排除。
func TestQuotaPersistStaleFlushCannotResurrect(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	ctx := context.Background()
	uid := newPersistUser(t, db)

	svc.AddUsage(ctx, uid, 500_000)
	w := svc.loadWindow(ctx, uid)
	svc.usedFlush.flush()

	// 升级作废该窗口
	if !svc.applyUpgradeRefill(ctx, uid) {
		t.Fatal("applyUpgradeRefill 应成功")
	}

	// 模拟一个「作废之前就标脏、作废之后才落盘」的滞后刷盘
	svc.usedFlush.mark(uid, w.anchor, 800_000)
	svc.usedFlush.flush()

	row := windowRow(t, db, uid, w.anchor)
	if row.State != quotaWindowVoided {
		t.Fatalf("滞后刷盘把作废窗口复活成了 %q", row.State)
	}
	if row.WindowUsedMicro != 800_000 {
		t.Fatalf("used 应仍按 GREATEST 合并到 %d, got %d", 800_000, row.WindowUsedMicro)
	}
}

// TestQuotaPersistResetOpensNewRow 走**真实的** ResetQuota 路径:换锚 → 新 anchor 新行,
// 恢复读到的是新窗口(满血)而不是重置前那个用满的窗口。
//
// 重置这条路径刻意**不打 tombstone** —— 它产生新行,而恢复取 anchor 最大的一行,新窗天然赢。
// 本用例就是钉住这个判断(升级/降级必须打 tombstone,是因为它们只删 anchor、不产生新行)。
func TestQuotaPersistResetOpensNewRow(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	ctx := context.Background()
	uid := newPersistUser(t, db)

	svc.AddUsage(ctx, uid, 300_000)
	old := svc.loadWindow(ctx, uid)
	if old.anchor <= 0 {
		t.Fatal("前置:应已开窗")
	}
	svc.usedFlush.flush()

	// 把 anchor 挪到 2 秒前:reset 换的新锚是 now,同秒换锚在 DB 里是同一行(主键相同),
	// 那样就测不出「新行赢旧行」。真实世界里用满一个窗口不可能在同一秒内发生。
	past := time.Now().Unix() - 2
	if err := cache.GetRedisPersist().Rename(ctx, tokenUsedKey(uid, old.anchor), tokenUsedKey(uid, past)).Err(); err != nil {
		t.Fatalf("rename used key: %v", err)
	}
	if err := cache.GetRedisPersist().Set(ctx, anchorKey(uid), past, svc.quotaKeyTTL()).Err(); err != nil {
		t.Fatalf("set past anchor: %v", err)
	}

	// ⚠️ 刻意**不用** GrantResetPasses:它写 StartsAt=time.Now(),而 credit_reset_passes.starts_at
	// 是 datetime(0),MySQL 对小数秒是**四舍五入**不是截断 —— 在 .5s 之后调用会存成「1 秒后生效」,
	// 紧接着的 ConsumeResetPass(条件 starts_at <= now)就找不到它,约 50% 概率 ErrNoResetPass。
	// (生产里无害:没人在发放后 500ms 内兑换。但测试不能建在这上面。)
	// 与本包既有用例同款:直接插一条已生效的批次。
	if err := db.Create(&CreditResetPass{
		UserID: uid, CountInitial: 1, CountRemaining: 1, Source: "test", Ref: "quota-persist",
		StartsAt:  time.Now().Add(-time.Minute).Truncate(time.Second),
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}).Error; err != nil {
		t.Fatalf("grant reset pass: %v", err)
	}
	if _, err := svc.ResetQuota(ctx, uid); err != nil {
		t.Fatalf("ResetQuota: %v", err)
	}

	w := svc.loadWindow(ctx, uid)
	if w.anchor <= past {
		t.Fatalf("重置后 anchor 应换新, got %d (old=%d)", w.anchor, past)
	}
	if r := windowRow(t, db, uid, w.anchor); r.OpenReason != "reset" || r.State != quotaWindowOpen {
		t.Fatalf("新窗行 open_reason=%q state=%q, want reset/open", r.OpenReason, r.State)
	}

	// 制造灾难:恢复必须取到重置后的新窗(满血),不能取回重置前那个用了 30 万的旧窗。
	clearWindowKeys(t, uid, w.anchor)
	got := svc.loadWindow(ctx, uid)
	if got.anchor != w.anchor {
		t.Fatalf("恢复应取最新窗口 anchor=%d, got %d", w.anchor, got.anchor)
	}
	if got.used != 0 {
		t.Fatalf("重置后的新窗口应满血, got used=%d(重置被恢复路径从背后撤销了)", got.used)
	}
}

// TestQuotaPersistDriftReconcile 漂移对账要能发现「DB 说在飞、Redis 没有」的情况 ——
// 这条任务的价值不在于修数据(它只读),而在于让恢复路径依赖的副本平时就被验证。
func TestQuotaPersistDriftReconcile(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	ctx := context.Background()
	uid := newPersistUser(t, db)

	svc.AddUsage(ctx, uid, 42_000)
	w := svc.loadWindow(ctx, uid)
	svc.usedFlush.flush()
	clearWindowKeys(t, uid, w.anchor)

	checked, drift, err := svc.ReconcileQuotaWindowDrift(ctx, 500)
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if checked == 0 {
		t.Fatal("对账一行都没检查到 —— 说明抽样条件与写入口径对不上")
	}
	if drift == 0 {
		t.Fatal("刚人为制造了漂移却没被发现 —— 对账任务是假的")
	}
}
