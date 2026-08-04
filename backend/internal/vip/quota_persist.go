// ============================================================================
// 额度窗口的 MySQL 持久化副本(0103/0104)—— Redis 丢数据后的自动恢复。
//
// 在此之前**全部**计费周期状态只活在 Redis。Redis 数据目录丢失 / 换池 / FLUSHALL
// (最后一个还写在 CLAUDE.md 的常规运维命令里)都会让所有人的计费周期归零且无从恢复。
//
// ── 形状:单向兜底,不是字面双写 ────────────────────────────────────────────
//
// 「双写」的天真实现是每次 AddUsage 同时写 Redis 和 MySQL。**不能那么做**:
// AddUsage 的频率是 **LLM 调用**频率而非对话轮频率(agent 一轮工具循环几十次 call,
// 每次都经 recordAgentTokens → Record → observer → AddUsage),而 anchor 的变更是
// **1 次/用户/7 天**。让「稀有且不可重建」的那份去付「高频且可重建」的账,还会把今天
// 完全并行的计费路径压到 InnoDB 的单行锁上串行化 —— 而这条路径的既定纪律是
// 「必须轻量, 不可阻塞」(见 llmusage.Record 与 safego.RecordLedger 的红字)。
//
// 所以分工是:
//   · anchor(开窗/换锚/作废)—— 事件发生**当场同步**写,低频,几乎不花钱;
//   · used —— 每次 AddUsage 只在进程内**标脏**,后台 flusher 节流批量落绝对值。
//
// ── used 的来源:Redis 绝对值,**不是**从账本 SUM 重建 ──────────────────────
//
// 「从 llm_token_usage 按 created_at >= anchor 求和」看着很美,实际有七处系统性不等,
// 其中三处是**多算**方向:① 平台自担轮(SkipQuota,我们明确告诉用户「没拿到东西不收钱」的那笔,
// 账本里没有任何列能区分它);② 收费总开关关闭期(Record 不看 cfg.Enabled,addUsage 看);
// ③ created_at 是 datetime(0) 而 MySQL 对小数秒**四舍五入**不是截断,会把上个窗口的尾巴拉进来。
//
// 而多算的后果不是「少给点额度」:用户一旦越线,payAsYouGoOverflow 返回的是**本次全额**,
// chargePayAsYouGo → ConsumeForQuota 不校验余额、可扣成负。**重建偏高 = 直接烧用户的经费。**
// 快照法没有这个问题:它取自 Redis 的 INCRBY 返回值,滞后只会让它**偏小**(偏向用户),
// 方向是安全的。
// ============================================================================

package vip

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
)

// QuotaWindowRow mirrors docker/mysql/migrations/0103_quota_window_fields.sql
type QuotaWindowRow struct {
	UserID          uint       `gorm:"column:user_id;primaryKey"`
	AnchorAt        int64      `gorm:"column:anchor_at;primaryKey"`
	Version         int64      `gorm:"column:version"`
	State           string     `gorm:"column:state"`
	WindowUsedMicro int64      `gorm:"column:window_used_micro"`
	UsedSyncedAt    *time.Time `gorm:"column:used_synced_at"`
	WindowSec       int        `gorm:"column:window_sec"`
	Tier            string     `gorm:"column:tier"`
	OpenReason      string     `gorm:"column:open_reason"`
	VoidedReason    string     `gorm:"column:voided_reason"`
	VoidedAt        *time.Time `gorm:"column:voided_at"`
	CreatedAt       time.Time  `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt       time.Time  `gorm:"column:updated_at;autoUpdateTime"`
}

func (QuotaWindowRow) TableName() string { return "user_quota_windows" }

const (
	quotaWindowOpen   = "open"
	quotaWindowVoided = "voided"
)

// nextWindowVersion 顺序判据。**只看它,不看 anchor 大小** —— anchor 不单调
// (reset 变大、两个 DEL 是「变没」),照抄 agentbridge 水位那套「取 max」会把 DEL
// 判成「更旧」而丢弃。四个 mutator 之间没有任何顺序保证,必须靠显式版本号做最新者胜。
//
// 用 UnixNano 而非进程内计数器:后者进程重启会归零、多副本会撞车,而墙钟纳秒天然跨进程可比。
// 代价是依赖时钟不倒退 —— 容器内 NTP 回拨的量级(毫秒)远小于 mutator 的间隔(分钟~天),
// 且真回拨了最坏结果是「一次落后的写被丢弃」,下一次 mutator 会纠正。
func nextWindowVersion() int64 { return time.Now().UnixNano() }

// ─── 负缓存 ───────────────────────────────────────────────────────────────
//
// 没有它,**每一个从未用过 AI 的用户的每一次请求**都会打一次 MySQL:loadWindow 在
// redis.Nil 分支要去 DB 确认「到底是没窗口,还是 Redis 丢了」。免费用户基数最大、
// 恰恰又都是「真的没窗口」,那就是把热路径的读放大加到了最不该加的人群上。
//
// TTL 取 6 小时:「这个用户在 DB 里也没有活窗口」对没用过 AI 的人是**稳定事实**,
// 而一旦他真的用了 AI,AddUsage 会在 Redis 建 anchor,loadWindow 走第一分支、根本不会
// 再看负缓存。灾后恢复场景下负缓存也随 Redis 一起没了,不会挡住恢复。
func noWindowKey(userID uint) string { return fmt.Sprintf("quota:nowin:%d", userID) }

const noWindowTTL = 6 * time.Hour

// restoreCount 恢复计数(可观测)。**大量恢复同时发生 ≠ 灾难,更可能是配置事故**
// (比如 REDIS_PERSIST_HOST 被改回空 → 指向一个空池 → 全站集体 restore)。
// 刻意不做成阈值阻断:恢复本身是正确行为,拦下来只会让所有人白拿额度;
// 但必须**吵**,否则一次配置漂移会以「一切正常」的样子完成全站计费状态迁移。
var restoreCount atomic.Int64

// ─── 写入侧 ───────────────────────────────────────────────────────────────

// persistWindowOpen 开窗/换锚时同步落库。best-effort:失败只告警,绝不影响 Redis 主路径
// (Redis 才是活窗的权威;DB 写失败最坏是「这个窗口没有兜底副本」,而不是计费出错)。
func (s *Service) persistWindowOpen(userID uint, anchor int64, reason string, cfg *BillingConfig) {
	if s.repo == nil || anchor <= 0 {
		return
	}
	tier := s.EffectiveTier(userID)
	row := QuotaWindowRow{
		UserID: userID, AnchorAt: anchor, Version: nextWindowVersion(),
		State: quotaWindowOpen, WindowSec: int(cfg.WindowDuration() / time.Second),
		Tier: tier, OpenReason: reason,
	}
	// 同一 (user, anchor) 重复开窗(并发 AddUsage 都拿到同一个赢家 anchor)是常态,
	// 走 ON DUPLICATE 幂等;version 更大者才允许改写 state/reason,防落后的写把
	// 一个已被作废的窗口复活成 open。
	dbCtx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	err := s.repo.DB().WithContext(dbCtx).Exec(`
		INSERT INTO user_quota_windows
		  (user_id, anchor_at, version, state, window_sec, tier, open_reason)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
		  state       = IF(VALUES(version) > version, VALUES(state), state),
		  open_reason = IF(VALUES(version) > version, VALUES(open_reason), open_reason),
		  tier        = IF(VALUES(version) > version, VALUES(tier), tier),
		  window_sec  = IF(VALUES(version) > version, VALUES(window_sec), window_sec),
		  -- 🔴 开窗必须把 used 归零。「在 anchor=X 开一个窗口」的定义就是这个窗口的 used 从 0 起算;
		  -- 若行已存在(手动重置换的新锚恰好等于该用户历史上某个 anchor),那个残值属于**另一个**
		  -- 窗口实例,留着它就是**多算**。多算在本系统里不是精度问题:用户一旦越线,
		  -- payAsYouGoOverflow 返回的是本次**全额**,chargePayAsYouGo → ConsumeForQuota 不校验余额、
		  -- 可扣成负 —— 多算 = 直接烧用户的经费。宁可少算(方向偏向用户)。
		  -- 归零不会丢真实用量:Redis 才是权威,下一次 flush 写的是 INCRBY 的**绝对值**,自然补回。
		  window_used_micro = IF(VALUES(version) > version, 0, window_used_micro),
		  used_synced_at    = IF(VALUES(version) > version, NULL, used_synced_at),
		  -- version 必须放在最后:MySQL 的 ON DUPLICATE KEY UPDATE 按书写顺序逐条求值,
		  -- 提前更新它会让上面每一条 IF 都拿改过的值去比,条件全部失效。
		  version     = GREATEST(version, VALUES(version))`,
		row.UserID, row.AnchorAt, row.Version, row.State, row.WindowSec, row.Tier, row.OpenReason).Error
	if err != nil {
		slog.Warn("billing: 窗口开窗落库失败(Redis 仍权威,本窗口暂无兜底副本)",
			"user_id", userID, "anchor", anchor, "reason", reason, "err", err)
	}
}

// persistWindowVoided 给窗口打 tombstone。**这是整套方案最关键的一个写** ——
//
// anchor 有四个变更点,其中**两个是 DEL**(升级满血 applyUpgradeRefill、降级对齐
// realignWindowAfterDowngrade)。若 DB 侧只会记「anchor = X」而没有「已作废」的表示,
// 恢复路径就会从 MySQL 读回**升级前那个已耗尽的窗口**:用户付钱升级拿到满血,
// Redis 一丢就被夺回去,而系统认为一切正常(anchor 有效、used 有据可查)。
// ResetBaselineOnUpgrade 那一整套 refill_pending + reconciler 补偿正是为了保证满血兑现,
// 没有 tombstone 的恢复会从背后把它撤销。
func (s *Service) persistWindowVoided(userID uint, anchor int64, reason string) {
	if s.repo == nil || anchor <= 0 {
		return
	}
	now := time.Now()
	dbCtx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	err := s.repo.DB().WithContext(dbCtx).Exec(`
		INSERT INTO user_quota_windows
		  (user_id, anchor_at, version, state, voided_reason, voided_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
		  state         = IF(VALUES(version) > version, VALUES(state), state),
		  voided_reason = IF(VALUES(version) > version, VALUES(voided_reason), voided_reason),
		  voided_at     = IF(VALUES(version) > version, VALUES(voided_at), voided_at),
		  version       = GREATEST(version, VALUES(version))`,
		userID, anchor, nextWindowVersion(), quotaWindowVoided, reason, now).Error
	if err != nil {
		slog.Error("billing: 窗口作废落库失败 —— 该窗口若被恢复会夺回用户已兑现的满血,需人工核对",
			"user_id", userID, "anchor", anchor, "reason", reason, "err", err)
	}
}

// ─── used 快照:标脏 + 后台节流刷盘 ─────────────────────────────────────────

type dirtyWindow struct {
	anchor  int64
	usedAbs int64
}

// usedFlusher 收集「哪些窗口的 used 变了」,由 ticker 批量落库。
// 刻意存**绝对值**(直接用 IncrBy 的返回值,零额外 Redis 读),配 GREATEST 合并 ——
// 幂等、乱序无害、多副本各写各的也收敛到最大值。
type usedFlusher struct {
	mu    sync.Mutex
	dirty map[uint]dirtyWindow
	svc   *Service
	stop  chan struct{}
	kick  chan struct{} // dirtyCap 超限时的提前刷盘唤醒(容量 1,挤不进去即丢弃)
	once  sync.Once
}

// usedFlushInterval 刷盘间隔。要防的事件是 Redis persist 池丢数据 —— 而那类事件是
// **灾难性**的(删目录 / FLUSHALL / 换池)。在这类事件下,「60 秒陈旧的快照」与
// 「每次调用都写的快照」在恢复价值上没有可分辨的差别,而后者的成本(见文件头)是实打实的。
const usedFlushInterval = 60 * time.Second

// dirtyCap 脏集合上限。超过即**唤醒** flusher 提前刷一轮,绝不让它无界增长
// (本仓库有过「异步统计写无 deadline 堆积拖垮连接池」的前科)。
//
// ⚠️ 别把这个数理解成「2 万次消耗」:dirty 是 map[userID],同一用户在 60 秒内打 500 次
// 工具循环 call 也只占 1 个键。所以它的真实含义是「60 秒内 2 万个**不同**用户」——
// 以当前规模(注册总数几百)是够不到的死分支。留着是因为它是防无界增长的兜底,
// 而兜底的正确性不该建立在「规模永远上不来」上。
const dirtyCap = 20000

// flushBatchSize 单条 INSERT 携带的行数。多值批量而非逐行 Exec:每行一个自治事务 =
// 每行一次 binlog fsync(线上 log_bin=ON, sync_binlog=1)。实测 1000 行逐行 229~289ms、
// 500 行/批 12ms(≈24×);5000 行 1.06~1.42s → 51~122ms。
// 今天的脏集合只有个位数,这个优化眼下不解决任何痛点 —— 它的价值是把上面那条兜底分支
// 真被触发那天的当量从「秒级」压到「亚秒级」。
const flushBatchSize = 500

func newUsedFlusher(s *Service) *usedFlusher {
	return &usedFlusher{
		dirty: make(map[uint]dirtyWindow),
		svc:   s,
		stop:  make(chan struct{}),
		kick:  make(chan struct{}, 1),
	}
}

// mark 在 AddUsage 里被调用 —— 纯内存 map 写(实测 21~27ns),不碰 DB。
func (f *usedFlusher) mark(userID uint, anchor, usedAbs int64) {
	if f == nil || anchor <= 0 {
		return
	}
	f.mu.Lock()
	f.dirty[userID] = dirtyWindow{anchor: anchor, usedAbs: usedAbs}
	over := len(f.dirty) >= dirtyCap
	f.mu.Unlock()
	if over {
		// 🔴 只唤醒,**不在这里同步 flush**。本函数挂在 AddUsage 上 = LLM 调用频率;
		// 而 flush 是这套代码里最慢的循环。让「防止堆积」的兜底动作跑在最热的调用者身上,
		// 方向是反的 —— 真触发时等于把一次记账变成一次秒级阻塞。
		// 带缓冲 channel + default 丢弃:唤醒是幂等信号,挤不进去说明已经有一次待处理。
		select {
		case f.kick <- struct{}{}:
			slog.Warn("billing: 窗口用量脏集合超上限,已唤醒提前刷盘", "cap", dirtyCap)
		default:
		}
	}
}

// flush 把脏集合批量写库。取走再写,写失败**不回填** —— 下一次 AddUsage 会重新标脏
// 并带上更新的绝对值,回填只会让一个坏掉的 DB 把脏集合撑爆。
//
// 锁只在换出 map 的那几行内持有,DB I/O 全程不持锁 —— 刷盘期间 mark() 照常写入。
func (f *usedFlusher) flush() {
	if f == nil || f.svc == nil || f.svc.repo == nil {
		return
	}
	f.mu.Lock()
	if len(f.dirty) == 0 {
		f.mu.Unlock()
		return
	}
	batch := f.dirty
	f.dirty = make(map[uint]dirtyWindow, len(batch))
	f.mu.Unlock()

	now := time.Now()
	rows := make([]dirtyRow, 0, len(batch))
	for uid, d := range batch {
		rows = append(rows, dirtyRow{uid: uid, anchor: d.anchor, used: d.usedAbs})
	}

	failed := 0
	for i := 0; i < len(rows); i += flushBatchSize {
		end := i + flushBatchSize
		if end > len(rows) {
			end = len(rows)
		}
		if err := f.writeBatch(rows[i:end], now); err != nil {
			failed += end - i
		}
	}
	if failed > 0 {
		slog.Warn("billing: 窗口用量刷盘部分失败(下轮重标脏自愈)", "failed", failed, "total", len(rows))
	}
}

type dirtyRow struct {
	uid    uint
	anchor int64
	used   int64
}

// writeBatch 一条多值 INSERT ... ON DUPLICATE KEY UPDATE 写一批。
// GREATEST 逐行合并在多值形式下**完全保持**幂等与乱序无害 —— 每行各自与自己那行的现值取大。
func (f *usedFlusher) writeBatch(rows []dirtyRow, now time.Time) error {
	if len(rows) == 0 {
		return nil
	}
	var sb strings.Builder
	sb.WriteString(`INSERT INTO user_quota_windows
		  (user_id, anchor_at, version, state, window_used_micro, used_synced_at) VALUES `)
	args := make([]any, 0, len(rows)*5)
	for i, r := range rows {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString("(?,?,?,'open',?,?)")
		args = append(args, r.uid, r.anchor, nextWindowVersion(), r.used, now)
	}
	// 刻意**不写 state**:一个滞后的 used 刷盘绝不能把已作废的窗口复活成 open。
	// 新行(窗口刚开、开窗写还没到)才由 INSERT 那半边给出 state='open'。
	sb.WriteString(`
		ON DUPLICATE KEY UPDATE
		  window_used_micro = GREATEST(window_used_micro, VALUES(window_used_micro)),
		  used_synced_at    = VALUES(used_synced_at)`)

	ctx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	return f.svc.repo.DB().WithContext(ctx).Exec(sb.String(), args...).Error
}

// Start 由 bootstrap 调用;Stop 在 SIGTERM 序列里同步 flush 一次。
func (f *usedFlusher) Start() {
	safego.Go("vip-quota-used-flusher", func() {
		t := time.NewTicker(usedFlushInterval)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				f.flush()
			case <-f.kick: // dirtyCap 触发的提前刷盘 —— 跑在本 goroutine,不占调用者
				f.flush()
			case <-f.stop:
				return
			}
		}
	})
}

func (f *usedFlusher) Stop() {
	if f == nil {
		return
	}
	f.once.Do(func() { close(f.stop) })
	f.flush() // 退出前最后一次:优雅重启不该丢掉这一分钟的快照
}

// ─── 恢复侧 ───────────────────────────────────────────────────────────────

// restoreWindowFromDB 在 Redis **确定没有** anchor(redis.Nil)时,从 MySQL 找回活窗口。
//
// 🔴 四条硬规则,任何一条破了都会把钱算错:
//
// ① **只在 redis.Nil 时走这里,命令失败(degraded)绝不走。**
//    Redis 报错时全站会同时涌向 MySQL —— 那是把一次 Redis 故障放大成一次 DB 故障。
//    降级路径仍走进程内兜底计数器(有界 fail-open),这个分工在 loadWindow 里是硬编码的。
//
// ② **tombstone 一票否决。** state=voided 的窗口是被升级满血/降级对齐显式删掉的,
//    恢复它 = 把用户付钱换来的满血夺回去。
//
// ③ **到期判定用当前配置,不用行里的 window_sec 快照。**
//    与线上语义一致:anchorRollLua 每次消耗都给在飞 anchor 续 TTL,admin 调大 window_days
//    会延长在飞窗口。读快照会让「恢复」与「正常运行」两套语义静默分叉。
//
// ④ **回灌 anchor 用 SETNX。** 并发的 AddUsage 可能已经用 Lua CAS 开了新窗口,
//    恢复必须让路 —— 那个新窗口是更新的事实。SETNX 失败即放弃恢复、按新窗口走。
func (s *Service) restoreWindowFromDB(ctx context.Context, rdb *redis.Client, userID uint) (quotaWindow, bool) {
	if s.repo == nil {
		return quotaWindow{}, false
	}
	// 负缓存:大多数免费用户「DB 里也确实没有活窗口」,不能让他们每次请求都打一次 MySQL。
	if v, err := rdb.Get(ctx, noWindowKey(userID)).Result(); err == nil && v != "" {
		return quotaWindow{}, false
	}

	dbCtx, cancel := ctxutil.WithParent(ctx, ctxutil.QuickIO)
	defer cancel()
	var row QuotaWindowRow
	err := s.repo.DB().WithContext(dbCtx).Where("user_id = ?", userID).
		Order("anchor_at DESC").Limit(1).Take(&row).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			slog.Warn("billing: 窗口兜底副本读取失败", "user_id", userID, "err", err)
			return quotaWindow{}, false // DB 也读不到 → 按无窗口(满血),与旧行为一致
		}
		_ = rdb.Set(ctx, noWindowKey(userID), "1", noWindowTTL).Err()
		return quotaWindow{}, false
	}

	windowSec := s.windowSeconds()
	// ② tombstone 一票否决;③ 到期用当前配置判
	if row.State == quotaWindowVoided || row.AnchorAt <= 0 || time.Now().Unix() >= row.AnchorAt+windowSec {
		_ = rdb.Set(ctx, noWindowKey(userID), "1", noWindowTTL).Err()
		return quotaWindow{}, false
	}

	// ④ SETNX 让路:并发 AddUsage 可能刚开了新窗口
	ok, serr := rdb.SetNX(ctx, anchorKey(userID), row.AnchorAt, s.quotaKeyTTL()).Result()
	if serr != nil {
		return quotaWindow{}, false
	}
	if !ok {
		return quotaWindow{}, false // 别人赢了,按他的新窗口走(loadWindow 会重读)
	}
	// used 快照同样用 SETNX:同一时刻的并发消耗可能已经 INCRBY 过,不能把它盖掉。
	if row.WindowUsedMicro > 0 {
		_ = rdb.SetNX(ctx, tokenUsedKey(userID, row.AnchorAt), row.WindowUsedMicro, s.quotaKeyTTL()).Err()
	}
	n := restoreCount.Add(1)
	slog.Warn("billing: 从 MySQL 兜底副本恢复了额度窗口 —— Redis 侧该键此前不存在",
		"user_id", userID, "anchor", row.AnchorAt, "used_micro", row.WindowUsedMicro,
		"used_synced_at", row.UsedSyncedAt, "restored_total", n,
		"hint", "大量恢复同时发生通常不是灾难,而是配置事故(如 REDIS_PERSIST_HOST 指向了空池),请核对")
	return quotaWindow{anchor: row.AnchorAt, used: row.WindowUsedMicro}, true
}

// ─── 平时就在被验证:周期漂移对账 ──────────────────────────────────────────
//
// 🔴 本仓库有两次「只在灾难时跑的代码,长期是坏的」前科:flushTokenWatermark 的注释
// 宣称它防优雅重启丢水位,而 SIGTERM 路径从不调用它;AddUsageCostOnly 带着一整段
// 「已接线」的注释却是零调用点的孤儿函数。恢复路径同属这一类 —— 它平时不跑,
// 真出事那天才第一次被执行。所以必须有一条**平时就在比对两侧**的任务。

// driftCursorKey 游标:上一轮扫到的最后一个 user_id。存 Redis(丢了只是从头开始,无害)。
const driftCursorKey = "quota:drift:cursor"

// ReconcileQuotaWindowDrift 抽样比对 Redis anchor 与 DB 兜底副本,不一致即告警。
// 只读、不修 —— 修不修是人的决定;这条任务的职责是「让沉默的坏掉变成吵闹的坏掉」。
//
// 🔴 排序用 **user_id 游标轮转**,不是 `ORDER BY updated_at DESC`。后者当初看着自然,
// 实际同时坏在两头(2026-08-03 性能实测):
//
//	① 贵:updated_at 无索引,LIMIT 下推不了 → 满足条件的行**全部**取出再 filesort。
//	   生产布局(PK=(user_id,anchor_at),同一用户 57 周的行簇在一起 → 当周行散落全树)下实测:
//	   1 万在飞行 83ms(冷 602ms)、10 万在飞行 799ms~3.29s,后者要把 32,783 个物理页
//	   (≈512MB)推过 1GB 的 buffer pool —— 真正伤人的不是那几百毫秒,是它去踩热页。
//	② 采样方向反了:flush 每 60 秒改 used_synced_at → ON UPDATE CURRENT_TIMESTAMP 必触发,
//	   于是「updated_at 最新的 200 个」恒等于「最近 60 秒有过 LLM 调用的 200 人」——
//	   而这批人的 anchor 刚被 anchorRollLua 读写过,最不可能漂移。**花了全表扫的代价,
//	   系统性地漏掉陈旧长尾**,也就是这条任务本来要盯的那部分。
//
// 也**不要**为此加 KEY(updated_at) 或 KEY(state, updated_at):updated_at 每 60 秒被最热的
// 那条写顶一次,给它加二级索引 = 把索引维护挂到最热的写上,方向同样是反的。
// 游标走 PK 前缀正序扫,LIMIT 能真的提前中断,且轮转若干轮后覆盖全表。
func (s *Service) ReconcileQuotaWindowDrift(ctx context.Context, sample int) (checked, drift int, err error) {
	rdb := cache.GetRedisPersist()
	if rdb == nil || s.repo == nil {
		return 0, 0, nil
	}
	if sample <= 0 {
		sample = 200
	}
	cursor, _ := rdb.Get(ctx, driftCursorKey).Uint64()

	dbCtx, cancel := ctxutil.WithParent(ctx, ctxutil.QuickIO)
	defer cancel()
	var rows []QuotaWindowRow
	cutoff := time.Now().Unix() - s.windowSeconds()
	if e := s.repo.DB().WithContext(dbCtx).
		Select("user_id, anchor_at").
		Where("user_id > ? AND state = ? AND anchor_at > ?", cursor, quotaWindowOpen, cutoff).
		Order("user_id").Limit(sample).Find(&rows).Error; e != nil {
		return 0, 0, e
	}
	if len(rows) < sample {
		// 到表尾 → 下一轮从头开始(0)。写在这里而不是循环外,保证覆盖率不依赖调度节奏。
		_ = rdb.Set(ctx, driftCursorKey, 0, 30*24*time.Hour).Err()
	} else {
		_ = rdb.Set(ctx, driftCursorKey, uint64(rows[len(rows)-1].UserID), 30*24*time.Hour).Err()
	}
	if len(rows) == 0 {
		return 0, 0, nil
	}

	// 一次 pipeline 取回全部 anchor,而不是 N 次串行 GET(实测单次 RTT ≈ 41µs,
	// 200 次串行 ≈ 8ms;pipeline 后是 1 个 RTT)。
	cmds := make([]*redis.StringCmd, len(rows))
	pipe := rdb.Pipeline()
	for i, r := range rows {
		cmds[i] = pipe.Get(ctx, anchorKey(r.UserID))
	}
	// Exec 在任一命令返回 redis.Nil 时也会回错 —— 那是**预期结果**不是故障,逐条判即可。
	if _, e := pipe.Exec(ctx); e != nil && !errors.Is(e, redis.Nil) {
		return 0, 0, e
	}

	for i, r := range rows {
		checked++
		got, gerr := cmds[i].Int64()
		switch {
		case errors.Is(gerr, redis.Nil):
			drift++
			slog.Warn("billing: 窗口漂移 —— DB 认为在飞但 Redis 无锚(下次该用户请求会触发恢复)",
				"user_id", r.UserID, "db_anchor", r.AnchorAt)
		case gerr != nil:
			// Redis 异常不算漂移,跳过(避免把一次抖动报成一片数据不一致)
		case got != r.AnchorAt:
			drift++
			slog.Warn("billing: 窗口漂移 —— Redis 与 DB 的 anchor 不一致",
				"user_id", r.UserID, "redis_anchor", got, "db_anchor", r.AnchorAt)
		}
	}
	if drift > 0 {
		slog.Warn("billing: 窗口漂移对账完成", "checked", checked, "drift", drift)
	}
	return checked, drift, nil
}

// ReconcileQuotaWindowOrphans 反向对账:从 **Redis 的活锚**出发,查 DB 有没有对应的行。
//
// 🔴 为什么必须有这个反向:上面那条是 DB→Redis,它能发现的是「DB 说在飞、Redis 没了」。
// 而这套持久化真正要防的故障形状是「**副本压根没写进去**」—— 表现为 Redis 有活锚、DB 无行,
// 方向恰好相反,上面那条**结构上看不见**。少了它,「迁移没跑 / 表缺失 / 写权限不足 / 落库
// 一直在静默失败」会一路安静到 Redis 丢数据那天,而那正是这套代码唯一要顶用的时刻。
//
// 用 SCAN 而非 KEYS(KEYS 在 Redis 单线程上是 O(N) 阻塞,生产禁用);只扫一批,不求全。
func (s *Service) ReconcileQuotaWindowOrphans(ctx context.Context, sample int) (checked, missing int, err error) {
	rdb := cache.GetRedisPersist()
	if rdb == nil || s.repo == nil {
		return 0, 0, nil
	}
	if sample <= 0 {
		sample = 200
	}
	keys, _, serr := rdb.Scan(ctx, 0, "quota:anchor:*", int64(sample)).Result()
	if serr != nil {
		return 0, 0, serr
	}
	if len(keys) == 0 {
		return 0, 0, nil
	}
	ids := make([]uint, 0, len(keys))
	for _, k := range keys {
		var id uint
		if _, e := fmt.Sscanf(k, "quota:anchor:%d", &id); e == nil && id > 0 {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return 0, 0, nil
	}
	dbCtx, cancel := ctxutil.WithParent(ctx, ctxutil.QuickIO)
	defer cancel()
	var present []uint
	if e := s.repo.DB().WithContext(dbCtx).Model(&QuotaWindowRow{}).
		Where("user_id IN ?", ids).Distinct().Pluck("user_id", &present).Error; e != nil {
		return 0, 0, e
	}
	has := make(map[uint]struct{}, len(present))
	for _, id := range present {
		has[id] = struct{}{}
	}
	for _, id := range ids {
		checked++
		if _, ok := has[id]; !ok {
			missing++
		}
	}
	if missing > 0 {
		slog.Warn("billing: 窗口副本缺失 —— Redis 有活锚但 MySQL 无任何窗口行(兜底副本可能根本没在写)",
			"checked", checked, "missing", missing,
			"hint", "查 0103 迁移是否跑过、user_quota_windows 是否可写;此状态下 Redis 一旦丢数据将无法恢复")
	}
	return checked, missing, nil
}

// PurgeOldQuotaWindows 保留期清扫(cleanup 日任务)。窗口行是一行/用户/周,增长有界,
// 但没有上界就是没有上界 —— 400 天对齐 llmusage 的 365 天保留期再加余量。
//
// 🔴 分批删,不发单条无 LIMIT 的 DELETE。稳态每天只删一天量、怎么写都无所谓,
// 但首次跨过保留期边界、长时间停机后恢复、或**有人把 retainDays 调小**那天,
// 单语句会一次删掉几百万行:实测 156 万行 = 13.6s 单事务,期间一条无关的新行 INSERT
// 等了 519ms。cleanup 的兄弟日任务都走 batchDeleteByCreatedAt(LIMIT 1000 + 100ms 间隔),
// 那个 helper 存在的唯一理由就是防这个,这里当初绕开了它。
// (本表按 anchor_at 而非 created_at 分批,故不能直接复用那个 helper。)
const purgeBatchSize = 1000

func (s *Service) PurgeOldQuotaWindows(retainDays int) (int64, error) {
	if s.repo == nil {
		return 0, nil
	}
	if retainDays <= 0 {
		retainDays = 400
	}
	cutoff := time.Now().AddDate(0, 0, -retainDays).Unix()
	var total int64
	for {
		ctx, cancel := ctxutil.With(ctxutil.QuickIO)
		res := s.repo.DB().WithContext(ctx).
			Exec("DELETE FROM user_quota_windows WHERE anchor_at < ? ORDER BY anchor_at ASC LIMIT ?",
				cutoff, purgeBatchSize)
		cancel()
		if res.Error != nil {
			return total, res.Error
		}
		total += res.RowsAffected
		if res.RowsAffected < purgeBatchSize {
			return total, nil
		}
		time.Sleep(100 * time.Millisecond) // 给在线写让路,与 batchDeleteByCreatedAt 同节奏
	}
}
