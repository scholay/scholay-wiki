// ============================================================================
// 统一 token 额度 —— 7 天锚定周期(P4,取代旧「自然日窗口」;方案
// docs/research/model-catalog-2026-07/REPORT.md §6,owner 拍板:首次使用开锚)。
//
// 窗口语义:
//   - 用户第一次**实际消耗**(AddUsage)那一刻开锚:quota:anchor:<uid> = unix 秒;
//     此后 WindowDays(默认 7)天为一个周期,窗口内累计与 WindowCeiling(tier) 比较;
//   - 到期一次性满血:读路径发现 now ≥ anchor+窗口 → 按「零消耗满血」处理,**不写 anchor**;
//     只有下一次真实消耗才重新开锚(Lua CAS 原子换锚,多实例安全);
//   - 展示:无有效 anchor = 满血 + 「额度将在下次使用时开始计时」;窗口内 = 「将于 X 月 X 日
//     HH:MM 自动重置」(window_reset_at 精确到分钟,比旧「明日 00:00」承诺更诚实)。
//
// **统计与限额分离**:
//   - used = quota:tokens:<uid>:<anchor>,单调累加(AddUsage),永不被删减;换锚=换 key=天然归零。
//   - base = quota:base:<uid>:<anchor>:**已退役**。旧设计(重置/升级保留 anchor)靠抬 base 归零窗口消耗;
//     现三条满血路径都改「换锚」(手动重置 anchor=now / 升级 DEL anchor / 到期自然换锚),新 key 下 base
//     天然缺失=0,无需再写。loadWindow 仍读 base 仅为**兼容存量**:发版前用旧逻辑抬过 base 的在飞窗口
//     仍按 used-base 正确计算,老 key 随 TTL 自然沉降。限额判定 = used - base < WindowCeiling(tier)。
//   - consumed_today 展示走独立日统计 key quota:day:<uid>:<日>(AddUsage 顺手双写,25h TTL,不随换锚清零)。
//
// 满血三条路径(均「换锚」语义,窗口时钟随之重启,兑现规格):
//   - 手动重置(消耗经费):anchor=now → 7 天从当前时刻重新计(R5);
//   - 升级满血(免费):DEL anchor → 付款后首次使用重新开锚 = 完整新周期(R6);
//   - 窗口到期:读路径判满血,下次消耗自然换锚。
// 计数走 Redis(persist 池),窗口 key TTL ≥ 窗口+1 天;Redis 挂 → 进程内锚定兜底(有界 fail-open),
// 但**手动重置直接拒绝不扣费**(修旧「降级期扣钱不解锁」bug);升级满血落 DB「待满血」标记 + reconciler
// 补偿(修「续费遇 Redis 抖动付了钱不满血」bug,best-effort 不阻塞履约)。
// 北京时区直接 time.Now()(项目铁律:不做 UTC 转换)。
// ============================================================================

package vip

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"scholar-backend/internal/common/cache"
)

// quotaKeyTTLFloor 窗口 key(anchor/used/base)TTL 下限:默认窗口 7 天 + 1 天余量。
// 有效性判定看 anchor **值**(now < anchor+窗口),TTL 只管垃圾回收,宁长勿短。
const quotaKeyTTLFloor = 8 * 24 * time.Hour

// quotaKeyTTL 随配置伸缩:window_days 是 admin 可调旋钮(评审 2026-07-15:原 8 天常量在
// 窗口调到 >7 天时,anchor/used/base 会在窗口中途被 Redis 过期 → 额度静默满血、
// 手动重置抬起的基线蒸发)。取 max(下限, 窗口+1 天)。
func (s *Service) quotaKeyTTL() time.Duration {
	ttl := time.Duration(quotaKeyTTLFloor)
	if d := s.cfg.Get().WindowDuration() + 24*time.Hour; d > ttl {
		ttl = d
	}
	return ttl
}

// resetLockShards 把「配额重置」按 user 分片串行化(进程内快路径)。
// 防 CheckDailyQuota 的 check-then-act 并发双扣:钱包行锁只防透支、不防「两个并发耗尽请求
// 各自决定重置各扣一次重置费」。256 片足够分散,偶发跨用户假争用可忽略。
var resetLockShards [256]sync.Mutex

// resetUnlockLua 释放锁:仅当值仍是自己持有时才 DEL(防误删他人/已超时重发的锁)。
const resetUnlockLua = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`

// anchorRollLua 「读锚 → 过期/缺失则换新锚」的原子脚本(AddUsage 唯一开窗点)。
// 两个并发消耗同时发现过期:Lua 串行执行,先到者 SET now,后到者读到新锚 —— 不会双开窗。
// 未过期分支也**续期 anchor TTL**(评审 R4:TTL 在开窗时按当时配置定值,admin 把 window_days
// 调大后,在飞 anchor 仍是旧短 TTL → 会在被延长的窗口到期前先被 Redis 蒸发 → 静默满血/限额绕过。
// 每次消耗把 TTL 续到当前 quotaKeyTTL,使 TTL 始终 ≥ 当前窗口+1 天)。
const anchorRollLua = `
local a = redis.call('GET', KEYS[1])
local now = tonumber(ARGV[1])
if a and now < tonumber(a) + tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
  return a
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return ARGV[1]`

// acquireResetLock 获取某用户的「配额重置」互斥锁。双层:进程内分片 mutex + 跨实例
// Redis SETNX(quota:reset:<uid>,5s TTL)。Redis 不可用 → 仅进程内锁(单实例等效)。
func (s *Service) acquireResetLock(ctx context.Context, userID uint) func() {
	m := &resetLockShards[userID%uint(len(resetLockShards))]
	m.Lock()

	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return m.Unlock // Redis 不可用 → 仅进程内锁
	}
	key := fmt.Sprintf("quota:reset:%d", userID)
	val := randHex()
	// 低频操作,自旋等待至多 ~3s 拿跨实例锁;等不到也放行(进程内锁已串行化本实例)。
	deadline := time.Now().Add(3 * time.Second)
	held := false
	for {
		ok, err := rdb.SetNX(ctx, key, val, 5*time.Second).Result()
		if err != nil {
			break // Redis 异常 → 退到仅进程内锁
		}
		if ok {
			held = true
			break
		}
		if time.Now().After(deadline) {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	return func() {
		if held {
			if err := rdb.Eval(ctx, resetUnlockLua, []string{key}, val).Err(); err != nil {
				slog.Warn("billing: reset redis lock release failed", "user_id", userID, "err", err)
			}
		}
		m.Unlock()
	}
}

func randHex() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano()) // 退化兜底,仅作锁值唯一性
	}
	return hex.EncodeToString(b)
}

// ─── key 命名 ─────────────────────────────────────────────────────────────

// anchorKey —— 当前窗口起点(unix 秒)。
func anchorKey(userID uint) string { return fmt.Sprintf("quota:anchor:%d", userID) }

// tokenUsedKey —— 窗口内真实累计消耗(key 含 anchor,换锚自然换 key = 满血)。
func tokenUsedKey(userID uint, anchor int64) string {
	return fmt.Sprintf("quota:tokens:%d:%d", userID, anchor)
}

// tokenBaseKey —— 窗口内额度基线。**base 已退役,只读不写**:三条满血路径均改「换锚」
// (见文件头注释),新 key 下 base 天然缺失=0;loadWindow 仍读它仅为兼容发版前用旧逻辑
// 抬过 base 的存量在飞窗口,老 key 随 TTL 自然沉降。
func tokenBaseKey(userID uint, anchor int64) string {
	return fmt.Sprintf("quota:base:%d:%d", userID, anchor)
}

// dayStatKey —— 当日消耗统计(纯展示:账户资产「今日消耗」;不参与限额判定)。
func dayStatKey(userID uint, now time.Time) string {
	return fmt.Sprintf("quota:day:%d:%s", userID, now.Format("20060102"))
}

// ─── 可观测:Redis 不可用告警(限流)──────────────────────────────────────

var (
	quotaDegradedMu sync.Mutex
	quotaDegradedAt time.Time
)

// warnQuotaDegraded 把「额度计数器所在 Redis 不可用」这一敞口可见化(限流,每分钟一条)。
func warnQuotaDegraded(reason string, attrs ...any) {
	now := time.Now()
	quotaDegradedMu.Lock()
	if now.Sub(quotaDegradedAt) < time.Minute {
		quotaDegradedMu.Unlock()
		return
	}
	quotaDegradedAt = now
	quotaDegradedMu.Unlock()
	slog.Warn("billing: 额度计数器 Redis 不可用,退回进程内兜底计数(有界 fail-open)— "+reason, attrs...)
}

// ── 有界 fail-open:Redis 挂了时的进程内锚定兜底计数器(评审 SS#3,P4 锚定化)─────────
// Redis 不可用时退回进程内「每用户一个锚 + 窗口累计」,仍按同一 tier 上限做闸门 —— 把敞口从
// 「无限免费」收敛到「每实例 · 每用户 · 每窗口上限」量级。局限(有意接受):进程重启清零、
// 多实例各算各的、Redis 恢复后不回填。MySQL 账本照记,可事后核账。
//
// 🔴 2026-08-02 计费审计 P0-1:此前它**只被写、从未被读**,整套兜底是死代码。
// 原因是读写两侧的降级判据不一致:写侧(addUsage)按「命令失败」降级,读侧(loadWindow)按
// `rdb == nil` 降级,而 cache.GetRedisPersist() 在进程存活期间**不可能返回 nil**
// (InitRedis 在 Ping 之前就给 rdb 赋值,Ping 失败时 main.go 直接 log.Fatalf 终止进程)。
// 于是 Redis 一抖动,loadWindow 走的是「err != nil → 当作没窗口 → 满血」那一支,
// 全站所有档位所有用户的额度闸门同时失效。读侧现已改成按命令失败降级,与写侧对齐。
type fallbackCounter struct {
	mu sync.Mutex
	m  map[uint]*fbWindow
}

type fbWindow struct {
	anchor int64 // unix 秒
	used   int64
}

var quotaFallback = &fallbackCounter{m: map[uint]*fbWindow{}}

// add 累加一次消耗。costMicro 单位与 Redis 主路径一致 = **微元真实成本**(不是 token)。
func (f *fallbackCounter) add(userID uint, costMicro int64, windowSec int64) {
	now := time.Now().Unix()
	f.mu.Lock()
	defer f.mu.Unlock()
	e := f.m[userID]
	if e == nil || now >= e.anchor+windowSec {
		e = &fbWindow{anchor: now}
		f.m[userID] = e
	}
	e.used += costMicro
}

func (f *fallbackCounter) get(userID uint, windowSec int64) int64 {
	now := time.Now().Unix()
	f.mu.Lock()
	defer f.mu.Unlock()
	if e := f.m[userID]; e != nil && now < e.anchor+windowSec {
		return e.used
	}
	return 0
}

// ─── 窗口状态读取 ─────────────────────────────────────────────────────────

// quotaWindow 当前窗口快照。anchor=0 表示无有效窗口(从未用 / 已到期)= 满血。
type quotaWindow struct {
	anchor int64 // unix 秒;0 = 无有效窗口
	used   int64 // 窗口内真实累计(统计口径,单调)
	base   int64 // 窗口内基线(重置/升级抬升)
	// degraded=true 表示 Redis 命令失败,used 取自进程内兜底计数器(非权威)。
	// 调用方据此拒绝「需要权威窗口」的写操作(手动重置 / 升级删锚),避免把降级读当成事实:
	// 降级读的 anchor 恒为 0,长得和「无窗口=满血」一模一样,直接采信会重演审计 P0-1。
	degraded bool
}

func (w quotaWindow) windowUsed() int64 {
	if d := w.used - w.base; d > 0 {
		return d
	}
	return 0
}

// resetAt 窗口自动重置时刻(anchor+窗口时长);无窗口返回零值。
func (w quotaWindow) resetAt(windowSec int64) time.Time {
	if w.anchor <= 0 {
		return time.Time{}
	}
	return time.Unix(w.anchor+windowSec, 0)
}

// windowSeconds 当前配置的窗口秒数。
func (s *Service) windowSeconds() int64 {
	return int64(s.cfg.Get().WindowDuration() / time.Second)
}

// loadWindow 读当前窗口(anchor + used/base)。**只读,绝不开窗**(开窗唯一点在 AddUsage)。
//
// 🔴 三种结果必须分开(2026-08-02 计费审计 P0-1)——旧实现把前两种合并成
// `if err != nil || a <= 0 || 到期 { return quotaWindow{} }` 一个条件,于是「Redis 读不出来」
// 与「这个用户从没用过」在闸门眼里完全同形,Redis 一抖动即全站免费,且读路径一条日志都不打:
//
//	① redis.Nil(key 不存在)/ anchor 已到期 → 无窗口 = 满血。这是正常业务语义。
//	② 命令失败(连接断 / 超时 / OOM)      → 降级:读进程内兜底计数器,degraded=true。
//	③ 正常                                 → 真实窗口。
//
// 注意 ① 里「已到期」不写 anchor(读路径永不开窗),下一次真实消耗由 AddUsage 的 Lua CAS 换锚。
//
// ⚠️ 主 Redis 是 allkeys-lru:anchor 被逐出会落进 ①(与"从没用过"不可区分)。这不是本函数能
// 分辨的,必须靠 REDIS_PERSIST_HOST 指向 noeviction 池来杜绝 —— 两份 compose 与 .env/.env.prod
// 已同步启用,别再把它改回空值。
//
// 🔴 「读路径永不开窗」这条不变式在 0103 之后有一个**明确的例外**:redis.Nil 分支会去 MySQL
// 兜底副本找回窗口并回灌 Redis(restoreWindowFromDB)。它写 anchor,但**不是开窗** ——
// 开窗是「创建一个用户此前没有的窗口」,恢复是「把一个已经存在、只是在 Redis 里丢了的窗口读回来」。
// 方向上也永远是保守的:恢复只可能让用户可用额度**变少**,不可能变多(没找到就照旧算满血),
// 所以它不会成为「读一下就白拿一个窗口」的漏洞。回灌用 SETNX,不与并发开窗争。
func (s *Service) loadWindow(ctx context.Context, userID uint) quotaWindow {
	windowSec := s.windowSeconds()
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		// 实际不可达(见 quotaFallback 上方注释),保留作纯防御。
		warnQuotaDegraded("window read: nil client")
		return quotaWindow{used: quotaFallback.get(userID, windowSec), degraded: true}
	}
	a, err := rdb.Get(ctx, anchorKey(userID)).Int64()
	switch {
	case err == nil:
		if a <= 0 || time.Now().Unix() >= a+windowSec {
			return quotaWindow{} // 已到期 → 满血(读路径不写 anchor)
		}
	case errors.Is(err, redis.Nil):
		// 🔴 恢复路径**只挂在这一个分支上**。
		// 「Redis 明确说没有这个 key」有两种成因:用户真没用过 AI(绝大多数),
		// 或者 Redis 侧丢了数据(换池 / 目录丢失 / FLUSHALL)。前者 DB 里也查不到活窗口,
		// 后者查得到 —— 只有 MySQL 兜底副本能把这两者分开。
		// 刻意**不挂在下面的 default(命令失败)分支**:那时全站会同时涌向 MySQL,
		// 等于把一次 Redis 抖动放大成一次 DB 故障;降级仍走进程内兜底计数器。
		// 恢复后不再读 base:quota:base:* 已退休(P5 成本制),恒 0。
		if w, ok := s.restoreWindowFromDB(ctx, rdb, userID); ok {
			return quotaWindow{anchor: w.anchor, used: w.used}
		}
		return quotaWindow{} // 从未用过 → 满血
	default:
		// Redis 不可用 —— 绝不能当"满血"放行。退回进程内兜底计数器(有界 fail-open)。
		warnQuotaDegraded("window anchor read failed", "user_id", userID, "err", err)
		return quotaWindow{used: quotaFallback.get(userID, windowSec), degraded: true}
	}
	vals, err := rdb.MGet(ctx, tokenUsedKey(userID, a), tokenBaseKey(userID, a)).Result()
	if err != nil {
		// anchor 读到了但 used 读不到:同样不能当 0(那等于满血)。用兜底累计顶上,
		// 并保留 anchor —— 窗口起止时刻的展示仍然是准确的。
		warnQuotaDegraded("window used read failed", "user_id", userID, "err", err)
		return quotaWindow{anchor: a, used: quotaFallback.get(userID, windowSec), degraded: true}
	}
	if len(vals) != 2 {
		return quotaWindow{anchor: a}
	}
	// MGET 缺失 key 是 nil 元素(不是 redis.Nil 错误),逐元素解析(评审修订)。
	return quotaWindow{anchor: a, used: mgetInt64(vals[0]), base: mgetInt64(vals[1])}
}

func mgetInt64(v any) int64 {
	str, ok := v.(string)
	if !ok {
		return 0
	}
	var n int64
	_, _ = fmt.Sscanf(str, "%d", &n)
	return n
}

// 兜底计数需要感知 fallback 窗口内的 used(Redis 挂时 loadWindow 已并入 used;此处无 base 概念,
// 降级期重置被 resetInternal 直接拒绝,不存在 base 语义缺口)。

// ─── 三个闸门(P4:签名与函数名保持不变,12 个执法点零改动;口径=7 天锚定窗口)───────

// CheckDailyQuota —— **周期 token 额度闸门**(统一池, 所有 AI 功能共用;函数名沿用旧称,
// 语义已是 7 天锚定窗口)。只读闸门, 不预扣;真实消耗由 AddUsage 后置累加。
// 上限 <0 = 不限;收费总开关关 = 不限;Redis 挂 = 有界 fail-open。
func (s *Service) CheckDailyQuota(ctx context.Context, userID uint) error {
	if userID == 0 {
		return nil // 未登录(这些功能均已强制登录)安全放行
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return nil
	}
	tier := s.EffectiveTier(userID)
	ceiling := cfg.WindowCeiling(tier)
	if ceiling < 0 {
		return nil // 不限额
	}
	w := s.loadWindow(ctx, userID)
	if w.windowUsed() < ceiling {
		return nil
	}
	return s.payAsYouGoOrQuotaError(userID, tier, cfg, w)
}

// ─── 单轮预算 = 窗口剩余额度(2026-07-31 线上审计 §五「单轮预算与计费窗口联动硬顶」)────
//
// 线上证据:free 用户单轮吃掉 116 万 token,窗口 ceiling 才 30 万微元,实际成本超支 4.9 倍
// (11 次 / 7 用户)。根因:入口 CheckDailyQuota 是**只读 gate**(只看「还有没有额度」),
// 放行后执行器的单轮预算与窗口剩余额度各算各的 —— 运行中没有任何硬闸。
//
// 修法:窗口剩余额度**就是**本轮的成本上限,两层共用同一个数(TurnCostCap 是唯一算法,
// RemainingBudget 从它派生),不再各算各的:
//   - TurnCostCap      = 本轮成本硬顶(微元)。hub 轮内累计成本越过它 → 停轮(code=budget)。
//   - RemainingBudget  = 收尾触发点 = 硬顶 × turnWindDownRatio,盖在 user_message 帧上下发。
//     留出 25% 尾巴给「去掉工具 + 收尾指令」那一次收尾 LLM call,使**收尾后的落点 ≈ 硬顶**
//     (旧口径收尾点就等于剩余额度,收尾那一刀必然落在窗口外)。
//
// 地板(turnBudgetFloorMicro):剩余额度极低甚至为负(并发轮 / payg)时不把轮预算压到 0 ——
// 那会让执行器 round-0 就 wind-down、用户拿到一句降级回答却仍被计费。给一次基本问答的量。

// turnWindDownRatio 收尾触发点占单轮硬顶的比例。0.75 = 留 1/4 尾巴给收尾那一次 LLM call
// (wind-down 只在轮间判定,判定后模型还要带全量 history 再发一次请求)。
const turnWindDownRatio = 0.75

// minTurnBudgetMicro 单轮预算的绝对地板(微元真实成本)= 10 算力点 ≈ ¥0.01。
// 兜住 admin 把 free 窗口调得极小的情形,保证地板永远够跑完一次基本问答。
const minTurnBudgetMicro = 10_000

// turnBudgetFloorMicro 单轮预算地板 = max(绝对地板, Free 整窗的 1/10)。
// 跟随 free 窗口伸缩(admin 调整额度经济时地板同比例走),超支上界因此有界:
// 剩余为 0 的用户最多再吃掉 free 窗口的 1/10。
func turnBudgetFloorMicro(cfg *BillingConfig) int64 {
	return max64(minTurnBudgetMicro, cfg.FreeWindowTokens/10)
}

// turnCapFromRemaining / windDownPoint 两个纯函数(便于单测):硬顶取地板,收尾点按比例回撤。
func turnCapFromRemaining(remaining, floor int64) int64 { return max64(remaining, floor) }

func windDownPoint(capMicro int64) int64 { return int64(float64(capMicro) * turnWindDownRatio) }

// TurnCostCap —— **本轮成本硬顶**(微元真实成本;2026-07 线上审计)。
// 语义:这一轮最多允许花掉多少真实成本 = 窗口剩余额度(payg 用户 + 钱包容量),不低于地板。
// 只读、不预扣(与 CheckDailyQuota 同一口径:真实扣减仍走后置 AddUsage)。
// unlimited=true(未登录 / 收费总开关关 / 该档不限额)时没有预算概念,调用方不要设闸。
//
// 🔴 消费方的**真实**形态(2026-08-02 计费审计 P1-1 纠偏,原注释描述的是一个从未实现的设计)。
//
// 原注释写的是「hub 在轮内实时累计本轮成本,越过 cap 即向 agent 发 stop_generation 并回
// code=budget 终帧」。事实是:TurnCostCap 全仓**只有 RemainingBudget 一个调用者**,而
// RemainingBudget 的产物只经 hub.stampTurnBudget → ws.stampBudget 盖进 user_message 帧的
// {budget:{softRemaining,hardRemaining}} 里 —— 那是**下发给执行器的建议值**,
// 真正的收尾判定在 agent 侧的 turnLoop(轮间比对 + MAX_TURN_TOKENS 硬闸)。
// 后端没有任何 stop_generation:agentbridge 里唯一那处是 turn-timeout,与预算无关。
//
// 为什么没做成服务端硬闸(给下一个想动它的人):轮内没有成本数据源。per-call 明细只在
// message_complete / error 终帧的 calls[] 里一次性带回,轮跑到一半时 backend 手上什么都没有。
// 要做真硬闸得先扩帧协议(让执行器每完成一次 LLM call 就上报一帧增量 usage),还要处理它与
// accrueTurnUsage 水位口径的去重 —— 这是个独立的改造,不是补几行判断。
// 在那之前,本函数的语义就是「建议值 + 地板」,别再照旧注释去找那个不存在的硬闸。
//
// 现实中的实际上界因此是:agent 侧 wind-down + MAX_TURN_TOKENS(500 万 raw token/轮)
// + 全容器 2 个并发槽(agent/src/server/admission.ts)。裸露的窗口是 round-0 那一次调用
// (预算与 MAX_TURN_TOKENS 都是轮间判定),上界 = 模型 MaxInput × 该模型 input 单价。
//
// payg 感知(0094/0095):开了「经费自动付费」且余额为正的用户,越过 ceiling 后的消耗从经费
// **实扣**(payAsYouGoOverflow → chargePayAsYouGo),闸门也放行 —— 此时硬顶 = 窗口余量(截零)
// + 钱包容量,而不是裸的窗口余量:否则 autopay 用户一越线就被按地板掐,付了钱只拿降级回答。
// 钱包读失败安全降级为不加(预算宁紧勿松,slog.Warn 可见化)。
func (s *Service) TurnCostCap(ctx context.Context, userID uint) (capMicro int64, unlimited bool) {
	if userID == 0 {
		return 0, true
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return 0, true
	}
	tier := s.EffectiveTier(userID)
	ceiling := cfg.WindowCeiling(tier)
	if ceiling < 0 {
		return 0, true
	}
	remaining := ceiling - s.loadWindow(ctx, userID).windowUsed()
	if bal, err := s.wallet.Balance(userID, cfg); err != nil {
		slog.Warn("billing: budget wallet read failed, skip payg capacity", "user_id", userID, "err", err)
	} else {
		_, remaining = paygAdjustedBudget(remaining, remaining, bal.PermMicro, bal.CreditAutopay, int64(cfg.creditToPoints()))
	}
	return turnCapFromRemaining(remaining, turnBudgetFloorMicro(cfg)), false
}

// RemainingWindowMicro —— 该用户此刻**还能花多少真实成本**(微元):窗口余量(可为负)
// 加上 autopay 开启时的钱包容量。与 TurnCostCap 的区别是**不套地板** —— 调用方需要区分
// 「几乎没额度了」和「还有一整个窗口」,而 TurnCostCap 的 max(remaining, floor) 把这个信息抹平了。
//
// 给「单次操作成本远高于一轮对话」的功能做起跑闸用(2026-08-02 计费审计 P1-3:审稿单场可达
// 窗口上限的几十倍,而它的起跑闸只是个「还剩 >0 就放行」的布尔判定,剩 1 微元也照跑)。
// unlimited=true(未登录 / 收费开关关 / 该档不限额)时没有预算概念,调用方不要设闸。
func (s *Service) RemainingWindowMicro(ctx context.Context, userID uint) (remaining int64, unlimited bool) {
	if userID == 0 {
		return 0, true
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return 0, true
	}
	ceiling := cfg.WindowCeiling(s.EffectiveTier(userID))
	if ceiling < 0 {
		return 0, true
	}
	remaining = ceiling - s.loadWindow(ctx, userID).windowUsed()
	if bal, err := s.wallet.Balance(userID, cfg); err != nil {
		slog.Warn("billing: remaining-window wallet read failed, skip payg capacity", "user_id", userID, "err", err)
	} else {
		_, remaining = paygAdjustedBudget(remaining, remaining, bal.PermMicro, bal.CreditAutopay, int64(cfg.creditToPoints()))
	}
	return remaining, false
}

// RemainingBudget —— 下发给执行器的单轮预算(SS#2),给 agentbridge 每条 user_message 盖章用。
// soft = hard = **收尾触发点** = TurnCostCap × turnWindDownRatio(微元真实成本;hub 盖章前按
// CostPerToken 换算成 token)。两个返回值同值,保留双值是帧契约(softRemaining/hardRemaining)
// 与执行器 wind-down 机制的形状不动。unlimited=true 时无预算概念。只读不预扣。
//
// 🔴 2026-07-31 审计后语义收紧两处:① 不再是「裸的窗口剩余」而是硬顶回撤 25%(收尾那一刀
// 要落在窗口内);② 不再可能为负 —— 地板保证至少能跑完一次基本问答(见 turnBudgetFloorMicro)。
func (s *Service) RemainingBudget(ctx context.Context, userID uint) (soft, hard int64, unlimited bool) {
	capMicro, unlimited := s.TurnCostCap(ctx, userID)
	if unlimited {
		return 0, 0, true
	}
	wd := windDownPoint(capMicro)
	return wd, wd, false
}

// paygAdjustedBudget 把钱包容量并入窗口预算(纯函数,便于单测)。
// autopay 关 / 余额非正 → 原样返回(闸门也不会放行,预算就是窗口口径);
// 否则 soft/hard 各 = max(原值, 0) + 钱包容量。容量 = permMicro × points / 1000
// —— MicroCreditForCost 的逆运算(micro-credit → 微元真实成本;1 经费 = points × 1000 微元
// = 1e6 micro-credit)。窗口余量先截零:在跑轮越线欠出的负值是「窗口欠账」,那部分消耗
// 已经发生、不会再从经费里补扣,叠进容量会双重放大预算。
func paygAdjustedBudget(soft, hard, permMicro int64, autopay bool, creditToPoints int64) (int64, int64) {
	if !autopay || permMicro <= 0 {
		return soft, hard
	}
	capacityMicro := permMicro * creditToPoints / 1000
	return max64(soft, 0) + capacityMicro, max64(hard, 0) + capacityMicro
}

// CheckDailyQuotaOverdraft —— 历史名(原 SS#2 有界透支版起点闸)。
// 🔴 透支带已于 2026-07-30 取消(owner 拍板「各套餐的透支都取消,没有透支这个说法」),
// 本函数与严格版完全等价,直接委托 CheckDailyQuota。保留方法名只为 5 个 WS feature spec
// (smart_search/claw/prism/boltslides/sci_draw)与 agentbridge 的 VIPChecker 接口调用点
// 不必联动;新代码请直接用 CheckDailyQuota。
func (s *Service) CheckDailyQuotaOverdraft(ctx context.Context, userID uint) error {
	return s.CheckDailyQuota(ctx, userID)
}

// payAsYouGoOrQuotaError —— 窗口额度已耗尽时的最后一道判定:
// 开了「经费自动付费」且**余额为正**就放行(本轮成本由 AddUsage 从经费扣),否则回额度错误。
//
// 为什么只要求「余额为正」而不是「余额够本轮」:本轮成本在开跑前不可知(取决于模型吐多少 token)。
// 起跑闸把关、单轮内不打断(闸门只在 user_message 起点执法),agent 靠预算章优雅收尾。
//
// ⚠️ 「欠出的部分 ≈ **一轮**的成本」这句话不严谨(2026-08-02 计费审计 P1-12 纠偏)。
// 闸门是纯只读、不预留额度,而忙态锁按 (feature, agent session) 寻址、**不是按 user** ——
// 同一用户在多个会话/多个 feature 同时发消息,K 条帧会各自独立过闸,每一条拿到的硬顶还都是
// 「窗口余量 + 整个钱包容量」(paygAdjustedBudget 不知道有别的轮在飞)。所以真实上界是
// **K 轮**而不是一轮。K 今天被 agent 容器的进程级准入压着(MAX_CONCURRENT_TURNS 默认 2,
// 全容器所有租户共用),再叠上执行器的 MAX_TURN_TOKENS=5M,量级仍然有界 —— 这也是这条
// 没有被当成 P0 修的原因。但那个上界来自**别处的一个常量**,不是这里的设计保证:
// 谁要调大 MAX_CONCURRENT_TURNS,必须先在这里补 per-user 在途轮计数或真正的额度预留。
func (s *Service) payAsYouGoOrQuotaError(userID uint, tier string, cfg *BillingConfig, w quotaWindow) error {
	bal, err := s.wallet.Balance(userID, cfg)
	if err == nil && bal.CreditAutopay && bal.PermMicro > 0 {
		return nil
	}
	if err != nil {
		slog.Warn("billing: payg balance read failed, falling back to quota error", "user_id", userID, "err", err)
	}
	// 结构化字段(冻结契约):bal 已在手、resetAt 顺手算 —— 零额外查询带出,
	// 给 HTTP 6010 data.quota / WS error 帧 quota 用(前端 QuotaNotifier 三路恢复引导)。
	details := QuotaDetails{ResetAt: w.resetAt(s.windowSeconds()), WindowDays: cfg.WindowDays}
	if details.WindowDays <= 0 {
		details.WindowDays = 7 // 与 WindowDuration 的兜底口径一致
	}
	if bal != nil {
		details.CreditBalancePositive = bal.PermMicro > 0
		details.CreditAutopay = bal.CreditAutopay
	}
	msg := quotaExceededMessage(tier, cfg, details.ResetAt)
	if bal != nil && bal.PermMicro > 0 && !bal.CreditAutopay {
		// 有钱但没开开关 —— 文案要指向「去开开关」,而不是笼统说额度没了。
		// 刻意不点名「账户资产」页:移动端没有该页,具体入口由前端按钮按端承载。
		msg += "开启「用经费继续」后可继续使用,仅扣除超出额度的部分。"
	}
	return NewQuotaErrorWithDetails(msg, details)
}

// AddUsage —— 把一次 LLM 调用的**真实成本(微元)**计入当前窗口(由 llmusage.Record 观察者调用)。
//
// ⚠️ 单位是微元不是 token(P5 成本制;÷1000 = 算力点 = ¥0.001)。形参此前叫 tokens,
// 是 P3 加权 token 时代的遗留 —— 观察者签名 llmusage.UsageObserver 传的一直是 costMicro
// (见 bootstrap 的接线),名字对不上会让人以为这里还能塞 token 数,那是 1000 倍量级的误接。
//
// **唯一的开窗点**:无有效 anchor 时 Lua CAS 原子换锚(首次消耗开表)。同时双写当日统计 key。
// userID==0 / costMicro<=0 / Redis 挂 → 兜底或跳过(best-effort, 绝不阻塞)。
func (s *Service) AddUsage(ctx context.Context, userID uint, costMicro int) {
	s.addUsage(ctx, userID, costMicro, true)
}

// AddUsageCostOnly —— **平台责任失败轮**的记账入口(2026-07-31 线上审计 §一 P1「付费后立刻踩坑」:
// 5 个付费转化中 3 个在支付前后 10 分钟内遭遇硬错误)。语义 = 「记成本、不扣额度」:
//   - ① 成本观测不丢:当日消耗统计 key 照常累加(与账本 llm_token_usage 同口径,后台看板不失明);
//   - ② 用户额度分毫不动:不进窗口 used、**不开窗**(平台故障不该给用户起 7 天窗口时钟)、
//     不触发按量付费从经费实扣(那是真钱);
//   - ③ 与 AddUsage / CheckDailyQuota 语义不冲突:窗口 used 少加多少,闸门就少判多少,
//     两者天然一致 —— 本函数只是「不写 used」,没有任何补偿/回退逻辑。
//
// 判定「是不是平台责任」不在 vip 侧(vip 只认 cost 与 userID),由调用方给出;接线契约见
// 本次修复说明(llmusage.Usage 加 NoQuota 位 → Record 分流到本入口)。
func (s *Service) AddUsageCostOnly(ctx context.Context, userID uint, costMicro int) {
	s.addUsage(ctx, userID, costMicro, false)
}

// addUsage AddUsage / AddUsageCostOnly 的共同实现。
// chargeQuota=false → 只落「当日消耗统计」这一笔观测,后面整条额度链路(开窗 / 窗口累加 /
// 按量付费扣经费 / 越线告警)全部不走。
func (s *Service) addUsage(ctx context.Context, userID uint, costMicro int, chargeQuota bool) {
	if userID == 0 || costMicro <= 0 {
		return
	}
	rdb := cache.GetRedisPersist()
	now := time.Now()
	// 当日消耗统计(纯展示,25h TTL,best-effort)——**在收费开关之前**落:Enabled=false 时账本仍记账
	// (llmusage.Record 不看 Enabled),展示口径须与之一致,否则账户页「月度热力图有数、今日消耗=0」自相矛盾。
	if rdb != nil {
		if dn, derr := rdb.IncrBy(ctx, dayStatKey(userID, now), int64(costMicro)).Result(); derr == nil && dn == int64(costMicro) {
			_ = rdb.Expire(ctx, dayStatKey(userID, now), 25*time.Hour).Err()
		}
	}
	// 平台责任失败轮到此为止:成本已进观测,额度链路一步不走(2026-07 线上审计)。
	if !chargeQuota {
		return
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return
	}
	windowSec := int64(cfg.WindowDuration() / time.Second)
	if rdb == nil {
		// 有界 fail-open:进程内锚定兜底,使闸门仍能收敛敞口。
		quotaFallback.add(userID, int64(costMicro), windowSec)
		warnQuotaDegraded("usage incr", "user_id", userID)
		return
	}
	anchorStr, err := rdb.Eval(ctx, anchorRollLua, []string{anchorKey(userID)},
		now.Unix(), windowSec, int64(s.quotaKeyTTL()/time.Second)).Text()
	if err != nil {
		quotaFallback.add(userID, int64(costMicro), windowSec)
		warnQuotaDegraded("anchor roll failed", "user_id", userID, "err", err)
		return
	}
	var anchor int64
	_, _ = fmt.Sscanf(anchorStr, "%d", &anchor)
	if anchor <= 0 {
		return
	}
	// 开窗落库(0103):Lua 在「换新锚」分支返回的就是 ARGV[1]=now,故 anchor==now 即本次开窗。
	// 同一秒内并发消耗可能都判为开窗 → persistWindowOpen 走 ON DUPLICATE,幂等。
	// 这里同步写:一个用户 7 天一次,单条 INSERT,远不到需要异步的量级;而异步会引入
	// 「开窗写还没落地就被 used 刷盘的 INSERT 抢先」的顺序问题(虽然那也能自愈,但没必要引入)。
	if anchor == now.Unix() {
		s.persistWindowOpen(userID, anchor, "usage", cfg)
	}
	key := tokenUsedKey(userID, anchor)
	n, err := rdb.IncrBy(ctx, key, int64(costMicro)).Result()
	if err != nil {
		quotaFallback.add(userID, int64(costMicro), windowSec)
		warnQuotaDegraded("usage incr failed", "user_id", userID, "err", err)
		return
	}
	// used 快照标脏(纯内存,微秒级)。取 IncrBy 的返回值 = Redis 侧绝对值,零额外读。
	// 落盘由后台 flusher 节流批量做 —— **不在这里写 DB**:本函数的频率是 LLM 调用频率
	// (agent 一轮工具循环几十次),而它所在的链路(llmusage.Record → observer)的既定纪律
	// 是「必须轻量、不可阻塞」。
	// 顺带的自愈:若上面的开窗写失败了,flusher 的 INSERT 半边带 state='open',60 秒内补上。
	s.usedFlush.mark(userID, anchor, n)
	// used key TTL 每次续期(评审 R4:仅首次设 TTL,会在 admin 把 window_days 调大后被旧短 TTL 在
	// 新窗口到期前先蒸发 → 静默满血/限额绕过;每次续到当前 quotaKeyTTL,使 TTL 恒 ≥ 当前窗口+1 天)。
	if e := rdb.Expire(ctx, key, s.quotaKeyTTL()).Err(); e != nil {
		slog.Debug("billing: token usage expire renew failed (fail-open)", "user_id", userID, "err", e)
	}
	// R8 可观测:入口只读 gate、无单轮帽 → 一次操作可在后置扣减时冲过窗口上限。这里在「本次累加
	// 恰好把用户从上限内推到上限外」时记一笔。窗口口径(n-base)判越线,与闸门一致。
	if ceiling := cfg.WindowCeiling(s.EffectiveTier(userID)); ceiling > 0 {
		base := int64(0)
		if b, berr := rdb.Get(ctx, tokenBaseKey(userID, anchor)).Int64(); berr == nil {
			base = b
		}
		prevWin := max64(0, (n-int64(costMicro))-base)
		curWin := max64(0, n-base)

		// 按量付费(0094):本次成本中越过窗口上限的那一部分从经费扣(见 payAsYouGoOverflow)。
		if overflow := payAsYouGoOverflow(prevWin, curWin, ceiling); overflow > 0 {
			s.chargePayAsYouGo(userID, overflow, cfg)
		}

		if prevWin < ceiling && curWin >= ceiling {
			overshoot := curWin - ceiling
			if overshoot > ceiling/4 {
				slog.Warn("billing: 单次操作显著越过窗口额度(入口只读 gate 的后置超支)",
					"user_id", userID, "ceiling", ceiling, "window_used", curWin, "overshoot", overshoot)
			} else {
				slog.Debug("billing: 窗口额度越线",
					"user_id", userID, "ceiling", ceiling, "window_used", curWin, "overshoot", overshoot)
			}
		}
	}
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// ─── 重置 / 升级满血 ─────────────────────────────────────────────────────

// ResetResult 重置后的额度 + 钱包余额(回前端刷新 UI)。
// Used/Ceiling 单位=微元真实成本(同 TokenStatus)。**下发用户前必须 StripAmounts()**。
type ResetResult struct {
	Used    int64        `json:"used"`
	Ceiling int64        `json:"ceiling"`
	Balance *BalanceView `json:"balance"`
}

// StripAmounts 抹掉额度绝对值 —— 与 Overview.StripQuotaAmounts 同一条不变量:
// 用户端只看百分比,不下发 used/ceiling 的微元真值(算力点绝对量对用户不可见)。
//
// 这里曾是该不变量唯一的漏网出口:BillingOverview / TestPay 都 strip 了,只有重置这条没 strip,
// 把当前档位的**真实周期上限**原样回给了用户端。经费余额(Balance)照常保留 —— 经费用户可见。
//
// 在 handler 而非 Service 里调:Service 的返回值是真值,被 admin 路径、集成测试与内部逻辑依赖
// (integration_test.go 断言重置后 res.Used==0),strip 属于「出口整形」而非业务事实。
func (r *ResetResult) StripAmounts() *ResetResult {
	if r == nil {
		return r
	}
	r.Used = 0
	if r.Ceiling >= 0 {
		r.Ceiling = 0 // <0 保持 -1:前端仍用 ceiling<0 判定「不限」
	}
	return r
}

// ErrQuotaServiceDown 额度计数器不可用时的重置拒绝(**不扣费**)。
// 旧实现降级期照扣经费但解锁不了(base 写被 rdb!=nil 包住跳过)→ 用户反复扣费;
// 日窗口下明早自愈,7 天周期会卡整窗,必须显式拒绝(评审 window7 修订)。
var ErrQuotaServiceDown = errors.New("暂时无法恢复额度,请稍后重试。恢复次数未扣除,额度未发生变化。")

// ResetQuota —— 手动重置:消耗经费 → 窗口内额度满血(base=used)。经费不足回 ErrInsufficientCredit。
func (s *Service) ResetQuota(ctx context.Context, userID uint) (*ResetResult, error) {
	cfg := s.cfg.Get()
	if err := s.resetInternal(ctx, userID, cfg); err != nil {
		return nil, err
	}
	bal, err := s.wallet.Balance(userID, cfg)
	if err != nil {
		return nil, err
	}
	return &ResetResult{
		Used:    s.loadWindow(ctx, userID).windowUsed(), // 重置后应为 0
		Ceiling: cfg.WindowCeiling(s.EffectiveTier(userID)),
		Balance: bal,
	}, nil
}

// resetInternal 消耗经费 → 换锚到 now(满血 + 7 天从当前重开)。经费不足 → ErrInsufficientCredit(不动计数)。
//
// 并发与失败安全(per-user 锁内):
//   1. Redis 不可用 → 直接 ErrQuotaServiceDown,不扣费(见常量注释);
//   2. 锁内重读窗口:已被并发重置 / 窗口已到期换锚 → 直接成功,绝不重复扣费;
//   3. 先校验余额,再【先换锚(Redis)、后扣费】:Redis 写失败直接返回错误、不扣费。
func (s *Service) resetInternal(ctx context.Context, userID uint, cfg *BillingConfig) error {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		warnQuotaDegraded("reset rejected", "user_id", userID)
		return ErrQuotaServiceDown
	}

	unlock := s.acquireResetLock(ctx, userID)
	defer unlock()

	// 「本次重置是否还有必要」:当前生效 tier 的上限下,窗口已耗 < 上限 = 不需要
	// (已被并发重置 / 窗口到期自然满血 / 刚升级抬高了上限)。复用为闭包,扣费前再判一次堵竞态。
	resetNotNeeded := func() (quotaWindow, bool) {
		w := s.loadWindow(ctx, userID)
		// 降级读的 anchor 恒为 0、used 来自进程内兜底 —— 拿它判「需不需要重置」会得到
		// 「不需要」这个假成功:用户点了重置、接口回 200、额度纹丝不动(2026-08-02 审计 P0-1)。
		// 降级期一律走下面的 ErrQuotaServiceDown 拒绝路径(不扣次数),与 rdb==nil 口径一致。
		if w.degraded {
			return w, false
		}
		ceiling := cfg.WindowCeiling(s.EffectiveTier(userID))
		// 不限额档(ceiling<0)重置零收益:窗口对它没有任何约束,换锚不改变任何行为,
		// 却要扣 1 次不可再生的重置次数 —— 直接按「无需重置」成功返回,不扣次数。
		if ceiling < 0 {
			return w, true
		}
		return w, w.windowUsed() < ceiling
	}

	// 1) 锁内首判:不需要就直接成功,绝不扣费。
	w, notNeeded := resetNotNeeded()
	if w.degraded {
		return ErrQuotaServiceDown // 降级期无法判定也无法兑现,显式拒绝且不扣次数
	}
	if notNeeded {
		return nil
	}

	// 2) 次数预检(锁内、本用户已串行化):没有可用次数直接返回,不动计数。
	//    0090 起重置**只认重置次数**,不再扣经费(owner 拍板);永久经费与重置彻底解耦,
	//    没有「次数不够回落扣经费」这条路 —— 有意为之,不要"顺手"加回来。
	passes, err := s.wallet.ResetPasses(userID)
	if err != nil {
		return err
	}
	if passes.Total <= 0 {
		return ErrNoResetPass
	}

	// 2.5) 竞态护栏:读 tier(首判)与读余额期间「升级到 Pro」事务可能恰好提交 —— 上限抬高后
	//      本次重置已无必要。扣费前用最新状态再判一次,杜绝「刚充值升级却被白扣重置费」的 TOCTOU。
	if w2, notNeeded2 := resetNotNeeded(); w2.degraded {
		return ErrQuotaServiceDown
	} else if notNeeded2 {
		return nil
	} else {
		w = w2
	}
	if w.anchor <= 0 {
		return nil // 窗口恰好到期(读后临界)→ 已满血,不扣费
	}

	// 3) 换锚到 now(R5 规格:7 天周期从当前时间重新计算)。新 anchor 对应的 used/base key 天然缺失
	//    → windowUsed=0 = 满血;window_reset_at 随之变成 now+窗口。旧 anchor 三 key 靠 TTL 回收。
	//    used 真实消耗仍完整落在 llm_token_usage 账本 + consumed_today 日 key(均不随换锚清零)。
	//    失败即返回错误、不扣费,杜绝「扣了钱但没换锚 → 每条消息再扣一次」的循环扣费。
	now := time.Now().Unix()
	if err := rdb.Set(ctx, anchorKey(userID), now, s.quotaKeyTTL()).Err(); err != nil {
		slog.Warn("billing: reset re-anchor failed, not charging", "user_id", userID, "err", err)
		return err
	}
	// 同秒换锚(now == 旧 anchor,仅极端/测试可现;真实世界耗尽需秒级以上)会与旧窗共用 used key →
	// 显式清零新锚下 used/base,保证满血确定不受旧窗残值影响。
	_ = rdb.Del(ctx, tokenUsedKey(userID, now), tokenBaseKey(userID, now)).Err()
	// 新窗落库(0103)。这里**不需要**给旧窗打 tombstone:主键是 (user_id, anchor_at),
	// 恢复读的是 anchor 最大的那一行 —— 新窗 now > 旧 anchor,天然赢。
	// (升级/降级两条路径必须打 tombstone,是因为它们**不产生新行**,只是把 anchor 删掉。)
	s.persistWindowOpen(userID, now, "reset", cfg)

	// 4) 基线已抬,扣 1 次重置次数(预检已确认有,ConsumeResetPass 行锁兜底)。
	if err := s.wallet.ConsumeResetPass(userID); err != nil {
		// 基线已抬(用户已得重置)但扣次数失败 —— 预检后到此被扣光,已被本锁串行化基本排除。
		// 给一次免费重置远胜把用户卡死或重复扣次,这里只告警不回滚。
		slog.Error("billing: reset pass consume failed after baseline set (free reset granted)", "user_id", userID, "err", err)
	}
	return nil
}

// payAsYouGoOverflow 算出本次消耗中**越过窗口上限的那一截**(纯函数,便于单测)。
//
// 为什么要拆而不是「跨线了就整笔转经费」:跨线的那一次调用往往一半在额度内、一半在额度外,
// 整笔扣会让用户为**已经买过的额度**再付一次钱 —— 而且这笔重复收费恰好发生在
// 「刚用完套餐」的时刻,是最容易被投诉的位置。
//
//	prevWin >= ceiling       → 本次全额超出
//	prevWin < ceiling <= cur → 只有 curWin-ceiling 那一截超出
//	curWin  < ceiling        → 不超出
func payAsYouGoOverflow(prevWin, curWin, ceiling int64) int64 {
	if ceiling <= 0 || curWin <= ceiling {
		return 0
	}
	return curWin - max64(prevWin, ceiling)
}

// chargePayAsYouGo 把超出窗口额度的那部分成本从经费扣(0094 按量付费)。
//
// 只在用户**显式开启** credit_autopay 时扣 —— 不知情扣费正是 auto_reset 被整个下线的原因。
// 没开开关的用户,超出部分不扣经费:他们本来就被闸门拦在门外了,能跑到这里的只有
// 「起跑时还在限内、单轮内越线」的那一轮(闸门只在 user_message 起点执法,单轮不打断),
// 平台吃下这一轮的越线量,好过在用户没同意的情况下动他的钱包。
//
// best-effort:本函数在 llmusage 的异步 observer 链上,失败只告警不重试 ——
// 重试会有重复扣费风险,而单次漏扣的金额上界是一轮的成本。
func (s *Service) chargePayAsYouGo(userID uint, overflowMicro int64, cfg *BillingConfig) {
	bal, err := s.wallet.Balance(userID, cfg)
	if err != nil {
		slog.Warn("billing: payg balance read failed, skip charge", "user_id", userID, "err", err)
		return
	}
	if !bal.CreditAutopay {
		return
	}
	if err := s.wallet.ConsumeForQuota(userID, overflowMicro, cfg); err != nil {
		slog.Error("billing: payg charge failed", "user_id", userID, "overflow_micro", overflowMicro, "err", err)
		return
	}
	slog.Info("billing: payg charged", "user_id", userID,
		"overflow_micro", overflowMicro, "micro_credit", cfg.MicroCreditForCost(overflowMicro))
}

// ResetBaselineOnUpgrade —— 升级/续费到付费档后**免费满血 + 7 天周期从付款后首次使用重开**(R6 规格)。
// 语义:DEL 当前窗口锚点 → 读路径立刻判「无窗口=满血」;付款后下一次真实消耗经 AddUsage 重新开锚,
// 得到从「首次使用」起算的完整新周期。不动真实消耗统计(账本 + consumed_today 独立保留)。
//
// **持久化补偿**(评审 R6-medium:同档续费 ceiling 不变,一旦删锚遇 Redis 抖动失败,已耗尽用户付了钱
// 却不满血,要卡到旧窗口自然到期):先在 DB 落「待满血」标记(user_wallets.refill_pending_at),删锚成功
// 即清标记;失败(Redis 抖动/不可用/进程崩溃)则留给 ReconcilePendingRefills(cleanup 周期)在 Redis
// 恢复后补删锚。全程 best-effort,不阻塞履约(post-commit 调用)。
func (s *Service) ResetBaselineOnUpgrade(ctx context.Context, userID uint) {
	if userID == 0 {
		return
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		// Redis 不可用:无法判断/删除窗口锚点(loadWindow 会回落 anchor=0 掩盖真实窗口)。保守落
		// 「待兑现」标记,交 reconciler 在 Redis 恢复后补删锚(DEL 幂等:恢复后确无窗口则 no-op)。
		if err := s.wallet.MarkRefillPending(userID, time.Now()); err != nil {
			slog.Warn("billing: mark refill pending failed (redis down at upgrade)", "user_id", userID, "err", err)
		}
		return
	}
	w := s.loadWindow(ctx, userID)
	if w.degraded {
		// 降级读的 anchor 恒为 0,与「本来就没窗口」不可区分 —— 直接 return 会让付了钱的用户
		// 卡在旧窗口里到自然到期(R6 想修的正是这个)。落标记交 reconciler 补,与 rdb==nil 同口径。
		if err := s.wallet.MarkRefillPending(userID, time.Now()); err != nil {
			slog.Warn("billing: mark refill pending failed (quota redis degraded at upgrade)", "user_id", userID, "err", err)
		}
		return
	}
	if w.anchor <= 0 {
		return // 无活跃窗口:已满血,付款后首次使用自然开锚 = 已符合 R6,无需动作
	}
	// 先持久化「待满血」意图(survive Redis 抖动 / 进程崩溃),再尝试立即应用。标记失败不阻断立即路径。
	if err := s.wallet.MarkRefillPending(userID, time.Now()); err != nil {
		slog.Warn("billing: mark refill pending failed", "user_id", userID, "err", err)
	}
	if s.applyUpgradeRefill(ctx, userID) {
		if err := s.wallet.ClearRefillPending(userID); err != nil {
			slog.Warn("billing: clear refill pending failed (reconciler will retry no-op)", "user_id", userID, "err", err)
		}
		slog.Info("billing: 升级满血 — 窗口已重置(换锚)", "user_id", userID)
	}
	// 未成功 → 标记保留,ReconcilePendingRefills 后续补偿。
}

// applyUpgradeRefill 删窗口锚点(满血 + 下次使用重开窗)。Redis 不可用/写失败 → false(交 reconciler)。
// DEL 幂等:锚点已被 AddUsage 换新/已到期删除也返回成功。
//
// 🔴 用 GETDEL 而非 DEL,是为了拿到被删的 anchor 去给 MySQL 副本打 tombstone(0103)。
// 没有 tombstone 的后果不是「少一条审计」,而是**把用户付钱买到的满血从背后撤销**:
// 恢复路径会从 DB 读回升级前那个已耗尽的窗口,而且看起来完全合法(anchor 有效、used 有据),
// 上面这一整套 refill_pending + reconciler 补偿保证的兑现就这么没了。
// GETDEL 是原子的(Redis 6.2+),不存在「读到 anchor 后被 AddUsage 换锚、结果删了新窗口」的空档 ——
// 这正是降级路径要靠 anchorDelIfLua 才能达到的性质,这里由单条命令天然具备。
func (s *Service) applyUpgradeRefill(ctx context.Context, userID uint) bool {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return false
	}
	old, err := rdb.GetDel(ctx, anchorKey(userID)).Int64()
	switch {
	case err == nil:
		s.persistWindowVoided(userID, old, "upgrade")
	case errors.Is(err, redis.Nil):
		// 本就无窗口(已满血 / 已到期被蒸发)—— 幂等成功,无窗口可作废。
	default:
		slog.Warn("billing: upgrade refill del anchor failed (pending marker kept)", "user_id", userID, "err", err)
		return false
	}
	return true
}

// ─── 降级/到期后的窗口对齐(2026-08-02 计费审计 P1-2)────────────────────────────
//
// 问题:窗口的 used 是**跨档继承**的,而闸门用的是**当前档**的 ceiling。会员到期或被 admin 撤销时
// 没有任何一条路径去动锚点(全仓 ResetBaselineOnUpgrade 的 3 个调用点全是升级方向,cleanup 里
// 也没有任何任务读 vip_expires_at)。于是 Pro 期用掉 400 万微元的用户一旦回落 free(ceiling 30 万):
//   - windowUsed(4,000,000) >= ceiling(300,000) → 免费额度恒为 0,被锁到 anchor+7d;
//   - 开了 credit_autopay 的更糟:payAsYouGoOverflow 在 prevWin>=ceiling 时返回**整笔** costMicro,
//     每一次调用 100% 从经费实扣,而 ConsumeForQuota 连余额校验都没有、可扣成负。
// 触发门槛极低:窗口内用超 ¥0.3 真实成本即可,对活跃付费用户几乎是常态。
//
// 修法 = 降级那一刻把高档期开的窗口作废(换锚语义,与「升级满血」对称)。

// anchorDelIfLua 「值仍等于期望值才删」的原子脚本 —— 防 Get 与 Del 之间 AddUsage 恰好换了新锚,
// 把用户降级后新开的那个窗口误删(误删=白送一个窗口,周期任务重复跑会变成无限免费)。
const anchorDelIfLua = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`

// realignWindowAfterDowngrade 作废「在降级时刻之前开的」窗口。返回是否真的删了。
//
// 幂等的关键是 `a >= downgradedAt` 这一条:降级之后新开的窗口是用户以新档位自己开的,再删就等于
// 每跑一次周期任务白送一个整窗 —— 那会把一个补偿任务变成无限免费通道。别去掉这个判断。
func (s *Service) realignWindowAfterDowngrade(ctx context.Context, userID uint, downgradedAt time.Time) bool {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return false
	}
	raw, err := rdb.Get(ctx, anchorKey(userID)).Result()
	if err != nil {
		return false // redis.Nil = 本就无窗口(已满血);其他错误留给下一轮重试
	}
	var a int64
	if _, perr := fmt.Sscanf(raw, "%d", &a); perr != nil || a <= 0 || a >= downgradedAt.Unix() {
		return false
	}
	n, err := rdb.Eval(ctx, anchorDelIfLua, []string{anchorKey(userID)}, raw).Int64()
	if err != nil {
		slog.Warn("billing: 降级窗口对齐删锚失败(下轮重试)", "user_id", userID, "err", err)
		return false
	}
	if n == 0 {
		return false // 期间被 AddUsage 换了新锚 → 那是降级后的窗口,放过
	}
	// tombstone:与升级满血同理 —— 没有它,恢复路径会把这个刚被作废的高档窗口读回来,
	// 用户降级后反而继续背着高档期的 used(正是本函数存在的那个 bug 本身)。
	s.persistWindowVoided(userID, a, "downgrade")
	slog.Info("billing: 会员降级/到期 — 作废高档期开的额度窗口(下次使用重新开锚)",
		"user_id", userID, "old_anchor", a, "downgraded_at", downgradedAt.Format(time.RFC3339))
	return true
}

// RealignExpiredMembershipWindows 周期任务:把「刚到期的会员」在高档期开的窗口作废。
// lookback 要明显大于调度间隔(重叠扫描无害:realignWindowAfterDowngrade 自带幂等判据)。
func (s *Service) RealignExpiredMembershipWindows(ctx context.Context, lookback time.Duration) (int, error) {
	now := time.Now()
	var rows []struct {
		ID        uint      `gorm:"column:id"`
		ExpiresAt time.Time `gorm:"column:vip_expires_at"`
	}
	if err := s.repo.DB().Table("users").
		Select("id, vip_expires_at").
		Where("vip_expires_at IS NOT NULL AND vip_expires_at <= ? AND vip_expires_at > ?", now, now.Add(-lookback)).
		Scan(&rows).Error; err != nil {
		return 0, err
	}
	n := 0
	for _, r := range rows {
		if s.realignWindowAfterDowngrade(ctx, r.ID, r.ExpiresAt) {
			n++
		}
	}
	return n, nil
}

// RealignWindowOnRevoke admin 撤销会员时的即时对齐(撤销比自然到期更需要:它是人为的、立刻生效的降级)。
func (s *Service) RealignWindowOnRevoke(ctx context.Context, userID uint) {
	s.realignWindowAfterDowngrade(ctx, userID, time.Now())
}

// ReconcilePendingRefills 由 cleanup 周期调用:对有「待满血」标记的用户补删锚(Redis 恢复后),
// 成功即清标记。返回本轮成功补偿条数。Redis 仍不可用时全部保留标记、下轮再试。
func (s *Service) ReconcilePendingRefills(ctx context.Context) (int, error) {
	ids, err := s.wallet.ListRefillPending()
	if err != nil {
		return 0, err
	}
	n := 0
	for _, uid := range ids {
		if !s.applyUpgradeRefill(ctx, uid) {
			continue // Redis 仍不可用 → 保留标记下轮再试
		}
		if err := s.wallet.ClearRefillPending(uid); err != nil {
			slog.Warn("billing: reconcile clear refill pending failed", "user_id", uid, "err", err)
			continue
		}
		n++
	}
	return n, nil
}

// quotaExceededMessage 超限友好文案(状态 + 恢复时刻,尽量短)。
//
// 🔴 2026-08-13 文案收口 —— 这条会原样透传成前端 toast / 额度条,是全站最高频的额度文案。
// ① 不提「重置次数」。旧文案对所有人都写「用 1 次重置次数马上恢复」,但本函数在超限热路径上
// (WS/HTTP 两条通路),取次数要打一次 DB,所以刻意不查 —— 于是次数为 0 的用户(绝大多数,
// 唯一来源是那次历史换算)被告知了一条他根本没有的出路。现在后端只说状态和时刻,
// 「立即恢复」入口由前端读 overview.reset_passes 后决定出不出(与对话位额度条上区同一判定)。
// ② 不解释周期机制。「每个周期能做的事更多」这类内部口径不进用户文案 —— 规则在变,写进去就会过期。
// ③ 恢复时刻照常给。绝对时刻是事实不是机制,有了它「等待」才是一条真实选项。
// ④ 语域书面克制,不用感叹号与口语。
// 前端对应文案与铁律见 frontend-user/src/shared/components/quota-toast.tsx 头部。
func quotaExceededMessage(tier string, _ *BillingConfig, resetAt time.Time) string {
	msg := "AI 额度已用完"
	if !resetAt.IsZero() {
		msg += fmt.Sprintf(",%d月%d日 %02d:%02d 恢复满额", resetAt.Month(), resetAt.Day(), resetAt.Hour(), resetAt.Minute())
	}
	msg += "。"
	if tier == TierFree {
		msg += "升级会员可获得更多额度。"
	}
	return msg
}

// ─── 会员/额度总览(给前端「账户资产 · 总览」+ 旧「我的会员」)────────────────────

// TokenStatus 当前周期额度状态。
//
// 🔴 **单位 = 微元真实成本,不是 token**(结构体名与 users.ts 的 UserTokenStatus 都是 P3 遗留)。
// 展示时 ÷1000 = 算力点(1 点 = ¥0.001);后台 UserDetailDrawer 的额度条与「算力用量」看板同口径。
// 直接把 Used/Ceiling 当算力点渲染 = 1000 倍误差,且不会报错 —— 新增消费方务必先除。
// 用户端**只能看 Percent**:绝对值由 StripQuotaAmounts 抹掉,别绕过它下发 Used/Ceiling。
//
// Used/Percent 是**窗口口径**(used-base,额度条),重置/升级后归零;ConsumedToday 是当日统计。
// WindowStartedAt/WindowResetAt:当前窗口起止(null = 未开窗 = 满血,「下次使用开始计时」)。
type TokenStatus struct {
	Used            int64      `json:"used"`
	Ceiling         int64      `json:"ceiling"` // -1 = 不限
	Percent         int        `json:"percent"` // 0..100(不限时 0)
	Unlimited       bool       `json:"unlimited"`
	ConsumedToday   int64      `json:"consumed_today"`    // 当日真实消耗(统计,重置不清零)
	WindowDays      int        `json:"window_days"`       // 周期长度(天)
	WindowStartedAt *time.Time `json:"window_started_at"` // null = 未开窗
	WindowResetAt   *time.Time `json:"window_reset_at"`   // null = 未开窗
}

// Overview 账户资产总览:等级 + 周期 + 到期 + 额度 + 经费 + 重置次数。
type Overview struct {
	Tier string `json:"tier"`
	// Cycle 付费档在期时的计费周期(monthly|yearly;yearly=「年费会员」标识,前后台徽标据此),
	// 免费/过期为空省略。真源 users.vip_cycle(最近一次付费订阅的周期,0079)。
	Cycle     string       `json:"cycle,omitempty"`
	ExpiresAt *time.Time   `json:"expires_at"`
	Token     TokenStatus  `json:"token"`
	Credit    *BalanceView `json:"credit"`
	AutoReset bool         `json:"auto_reset"`
	// ResetPasses 可用重置次数(已生效未过期批次之和)。0090 起取代 ResetCost:
	// 重置扣的是次数不是经费,前端的「重置」入口必须按**这个数**判可用性 ——
	// 按经费余额判会得到两种都错的结果:有次数没经费的用户点不到按钮,
	// 有经费没次数的用户点了吃 400。
	ResetPasses int `json:"reset_passes"`
	// ResetPassNextExpiry 最近一批次数的到期时刻(null = 无可用次数)。给「N 次将于 X 到期」提示用。
	ResetPassNextExpiry *time.Time `json:"reset_pass_next_expiry"`
	// ResetPassLots 分批余量 + 到期日(按失效日升序)。给「各券何时过期」明细用。
	ResetPassLots []ResetPassLotView `json:"reset_pass_lots,omitempty"`
}

// StripQuotaAmounts 抹掉额度绝对值 —— P5 成本制:用户端只看百分比,不下发 used/ceiling/consumed
// 的微元真值(算力点绝对量对用户不可见)。保留 Percent / Unlimited / 窗口起止(重置提示)与
// Credit(经费用户可见)。**仅用户端调用**;管理端(AdminUserVIPStatus)需看真值,不 strip。
func (ov *Overview) StripQuotaAmounts() *Overview {
	if ov == nil {
		return ov
	}
	unlimited := ov.Token.Unlimited
	ov.Token.Used = 0
	ov.Token.ConsumedToday = 0
	if unlimited {
		ov.Token.Ceiling = -1 // 前端仍用 ceiling<0 / unlimited 判定不限
	} else {
		ov.Token.Ceiling = 0
	}
	return ov
}

// DayUsage 当月某日的用量(热力图用)。P5 成本制:cost = 当日精算成本(微元),
// 前端只做相对强度分档(cost/日均参考线),不显示绝对数。
type DayUsage struct {
	Date string `json:"date"` // YYYY-MM-DD
	Cost int64  `json:"cost"` // 当日精算成本(微元;1000 微元 = 1 算力点)
}

// DailyUsageThisMonth 从 llm_token_usage 聚合「当月每日精算成本」(给前端按日绿格热力图,相对强度)。
func (s *Service) DailyUsageThisMonth(userID uint) ([]DayUsage, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var rows []DayUsage
	err := s.repo.DB().Table("llm_token_usage").
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COALESCE(SUM(cost_micro_yuan),0) AS cost").
		Where("user_id = ? AND created_at >= ?", userID, monthStart).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d')").
		Scan(&rows).Error
	return rows, err
}

// consumedToday 读当日消耗统计 key(展示用;Redis 挂 / 无 → 0)。
func (s *Service) consumedToday(ctx context.Context, userID uint) int64 {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return 0
	}
	v, err := rdb.Get(ctx, dayStatKey(userID, time.Now())).Int64()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			slog.Debug("billing: day stat read failed", "user_id", userID, "err", err)
		}
		return 0
	}
	return v
}

// GetOverview 组装总览。
func (s *Service) GetOverview(ctx context.Context, userID uint) (*Overview, error) {
	uv, err := s.repo.GetUserVIP(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	tier := effectiveTier(uv, now)
	cfg := s.cfg.Get()
	ceiling := cfg.WindowCeiling(tier)
	w := s.loadWindow(ctx, userID)
	windowUsed := w.windowUsed()
	ts := TokenStatus{
		Used:          windowUsed,
		Ceiling:       ceiling,
		Unlimited:     ceiling < 0,
		ConsumedToday: s.consumedToday(ctx, userID),
		WindowDays:    cfg.WindowDays,
	}
	if ts.WindowDays <= 0 {
		ts.WindowDays = 7
	}
	if w.anchor > 0 {
		started := time.Unix(w.anchor, 0)
		resetAt := w.resetAt(s.windowSeconds())
		ts.WindowStartedAt, ts.WindowResetAt = &started, &resetAt
	}
	if ceiling > 0 {
		p := int(windowUsed * 100 / ceiling)
		if p > 100 {
			p = 100
		}
		ts.Percent = p
	}
	bal, err := s.wallet.Balance(userID, cfg)
	if err != nil {
		return nil, err
	}
	passes, err := s.wallet.ResetPasses(userID)
	if err != nil {
		return nil, err
	}
	ov := &Overview{
		Tier: tier, Cycle: effectiveCycle(uv, now), Token: ts, Credit: bal,
		AutoReset: bal.AutoReset, // auto_reset 已随 Balance 的钱包行读出, 省一次查询
		ResetPasses: passes.Total,
	}
	if len(passes.Lots) > 0 {
		e := passes.Lots[0].ExpiresAt // Lots 按 expires_at 升序 → [0] 即最近到期
		ov.ResetPassNextExpiry = &e
		ov.ResetPassLots = passes.Lots
	}
	if isPaidTier(tier) {
		ov.ExpiresAt = uv.VIPExpiresAt
	}
	return ov, nil
}
