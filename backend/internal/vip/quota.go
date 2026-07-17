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

// tokenBaseKey —— 窗口内额度基线(重置/升级时抬到当时 used)。
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
// 多实例各算各的、Redis 恢复后不回填。MySQL 账本照记,可事后核账。仅在 rdb==nil 时启用。
type fallbackCounter struct {
	mu sync.Mutex
	m  map[uint]*fbWindow
}

type fbWindow struct {
	anchor int64 // unix 秒
	used   int64
}

var quotaFallback = &fallbackCounter{m: map[uint]*fbWindow{}}

func (f *fallbackCounter) add(userID uint, tokens int64, windowSec int64) {
	now := time.Now().Unix()
	f.mu.Lock()
	defer f.mu.Unlock()
	e := f.m[userID]
	if e == nil || now >= e.anchor+windowSec {
		e = &fbWindow{anchor: now}
		f.m[userID] = e
	}
	e.used += tokens
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
// Redis 挂 → 进程内兜底(used=兜底累计,base=0);key 缺失/过期 → 无窗口(满血)。
func (s *Service) loadWindow(ctx context.Context, userID uint) quotaWindow {
	windowSec := s.windowSeconds()
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		warnQuotaDegraded("window read")
		return quotaWindow{anchor: 0, used: quotaFallback.get(userID, windowSec)}
	}
	a, err := rdb.Get(ctx, anchorKey(userID)).Int64()
	if err != nil || a <= 0 || time.Now().Unix() >= a+windowSec {
		return quotaWindow{} // 从未用 / 已到期 → 满血(读路径不写 anchor)
	}
	vals, err := rdb.MGet(ctx, tokenUsedKey(userID, a), tokenBaseKey(userID, a)).Result()
	if err != nil || len(vals) != 2 {
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
	return NewQuotaError(quotaExceededMessage(tier, cfg, w.resetAt(s.windowSeconds())))
}

// RemainingBudget —— 有界透支预算(SS#2),给 agentbridge 每条 user_message 盖章用。
// soft = 到窗口上限还剩;hard = 到「上限 + 透支带」还剩(均可为负 = 已在透支带内)。
// unlimited=true(收费关 / 上限<0 / 未登录)时无预算概念。只读不预扣。
func (s *Service) RemainingBudget(ctx context.Context, userID uint) (soft, hard int64, unlimited bool) {
	if userID == 0 {
		return 0, 0, true
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return 0, 0, true
	}
	tier := s.EffectiveTier(userID)
	ceiling := cfg.WindowCeiling(tier)
	if ceiling < 0 {
		return 0, 0, true
	}
	used := s.loadWindow(ctx, userID).windowUsed()
	return ceiling - used, ceiling + cfg.OverdraftTokens(tier) - used, false
}

// CheckDailyQuotaOverdraft —— 有界透支版起点闸(SS#2,smart_search/claw/prism 用)。
// 与 CheckDailyQuota 唯一区别:上限放宽到 ceiling + 透支带 —— 跨线那一轮总能起跑。
// peerreview(任务型)保持用严格版。
func (s *Service) CheckDailyQuotaOverdraft(ctx context.Context, userID uint) error {
	if userID == 0 {
		return nil
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return nil
	}
	tier := s.EffectiveTier(userID)
	ceiling := cfg.WindowCeiling(tier)
	if ceiling < 0 {
		return nil
	}
	w := s.loadWindow(ctx, userID)
	if w.windowUsed() < ceiling+cfg.OverdraftTokens(tier) {
		return nil
	}
	return NewQuotaError(quotaExceededMessage(tier, cfg, w.resetAt(s.windowSeconds())))
}

// AddUsage —— 把一次 LLM 调用的真实 token 计入当前窗口(由 llmusage.Record 观察者调用)。
// **唯一的开窗点**:无有效 anchor 时 Lua CAS 原子换锚(首次消耗开表)。同时双写当日统计 key。
// userID==0 / tokens<=0 / Redis 挂 → 兜底或跳过(best-effort, 绝不阻塞)。
func (s *Service) AddUsage(ctx context.Context, userID uint, tokens int) {
	if userID == 0 || tokens <= 0 {
		return
	}
	rdb := cache.GetRedisPersist()
	now := time.Now()
	// 当日消耗统计(纯展示,25h TTL,best-effort)——**在收费开关之前**落:Enabled=false 时账本仍记账
	// (llmusage.Record 不看 Enabled),展示口径须与之一致,否则账户页「月度热力图有数、今日消耗=0」自相矛盾。
	if rdb != nil {
		if dn, derr := rdb.IncrBy(ctx, dayStatKey(userID, now), int64(tokens)).Result(); derr == nil && dn == int64(tokens) {
			_ = rdb.Expire(ctx, dayStatKey(userID, now), 25*time.Hour).Err()
		}
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return
	}
	windowSec := int64(cfg.WindowDuration() / time.Second)
	if rdb == nil {
		// 有界 fail-open:进程内锚定兜底,使闸门仍能收敛敞口。
		quotaFallback.add(userID, int64(tokens), windowSec)
		warnQuotaDegraded("usage incr", "user_id", userID)
		return
	}
	anchorStr, err := rdb.Eval(ctx, anchorRollLua, []string{anchorKey(userID)},
		now.Unix(), windowSec, int64(s.quotaKeyTTL()/time.Second)).Text()
	if err != nil {
		quotaFallback.add(userID, int64(tokens), windowSec)
		warnQuotaDegraded("anchor roll failed", "user_id", userID, "err", err)
		return
	}
	var anchor int64
	_, _ = fmt.Sscanf(anchorStr, "%d", &anchor)
	if anchor <= 0 {
		return
	}
	key := tokenUsedKey(userID, anchor)
	n, err := rdb.IncrBy(ctx, key, int64(tokens)).Result()
	if err != nil {
		quotaFallback.add(userID, int64(tokens), windowSec)
		warnQuotaDegraded("usage incr failed", "user_id", userID, "err", err)
		return
	}
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
		prevWin := max64(0, (n-int64(tokens))-base)
		curWin := max64(0, n-base)
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
type ResetResult struct {
	Used    int64        `json:"used"`
	Ceiling int64        `json:"ceiling"`
	Balance *BalanceView `json:"balance"`
}

// ErrQuotaServiceDown 额度计数器不可用时的重置拒绝(**不扣费**)。
// 旧实现降级期照扣经费但解锁不了(base 写被 rdb!=nil 包住跳过)→ 用户反复扣费;
// 日窗口下明早自愈,7 天周期会卡整窗,必须显式拒绝(评审 window7 修订)。
var ErrQuotaServiceDown = errors.New("额度服务暂时不可用,请稍后再试(未扣除经费)")

// ResetQuota —— 手动重置:消耗经费 → 窗口内额度满血(base=used)。经费不足回 ErrInsufficientCredit。
func (s *Service) ResetQuota(ctx context.Context, userID uint) (*ResetResult, error) {
	cfg := s.cfg.Get()
	if err := s.resetInternal(ctx, userID, cfg); err != nil {
		return nil, err
	}
	bal, err := s.wallet.Balance(userID)
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
		ceiling := cfg.WindowCeiling(s.EffectiveTier(userID))
		return w, ceiling >= 0 && w.windowUsed() < ceiling
	}

	// 1) 锁内首判:不需要就直接成功,绝不扣费。
	w, notNeeded := resetNotNeeded()
	if notNeeded {
		return nil
	}

	cost := cfg.ResetCostCredits
	// 2) 余额预检(锁内、本用户已串行化):不足直接返回,不动计数、不扣费。
	if cost > 0 {
		bal, err := s.wallet.Balance(userID)
		if err != nil {
			return err
		}
		if bal.Total < cost {
			return ErrInsufficientCredit
		}
	}

	// 2.5) 竞态护栏:读 tier(首判)与读余额期间「升级到 Pro」事务可能恰好提交 —— 上限抬高后
	//      本次重置已无必要。扣费前用最新状态再判一次,杜绝「刚充值升级却被白扣重置费」的 TOCTOU。
	if w2, notNeeded2 := resetNotNeeded(); notNeeded2 {
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

	// 4) 基线已抬,扣费(余额已校验足够,Consume 行锁兜底)。
	if cost > 0 {
		if err := s.wallet.Consume(userID, cost, TxResetConsume, "reset",
			fmt.Sprintf("w%d", w.anchor), "重置本周期额度"); err != nil {
			// 基线已抬(用户已得重置)但扣费失败 —— 校验后到此被掏空,已被本锁串行化基本排除。
			// 给一次免费重置远胜把用户卡死或重复扣费,这里只告警不回滚。
			slog.Error("billing: reset consume failed after baseline set (free reset granted)", "user_id", userID, "err", err)
		}
	}
	return nil
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
func (s *Service) applyUpgradeRefill(ctx context.Context, userID uint) bool {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return false
	}
	if err := rdb.Del(ctx, anchorKey(userID)).Err(); err != nil {
		slog.Warn("billing: upgrade refill del anchor failed (pending marker kept)", "user_id", userID, "err", err)
		return false
	}
	return true
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

// quotaExceededMessage 超限友好文案(含自动重置时刻 + 重置花费 + 升级引导)。
func quotaExceededMessage(tier string, cfg *BillingConfig, resetAt time.Time) string {
	when := ""
	if !resetAt.IsZero() {
		when = fmt.Sprintf("%d月%d日 %02d:%02d", resetAt.Month(), resetAt.Day(), resetAt.Hour(), resetAt.Minute())
	}
	if tier == TierFree {
		if when != "" {
			return fmt.Sprintf("本周期 AI 额度已用完,将于 %s 自动重置。升级会员可获更高额度,或消耗 %d 经费立即重置。", when, cfg.ResetCostCredits)
		}
		return fmt.Sprintf("本周期 AI 额度已用完。升级会员可获更高额度,或消耗 %d 经费立即重置。", cfg.ResetCostCredits)
	}
	if when != "" {
		return fmt.Sprintf("本周期 AI 额度已用完,将于 %s 自动重置;也可消耗 %d 经费立即重置。", when, cfg.ResetCostCredits)
	}
	return fmt.Sprintf("本周期 AI 额度已用完。可消耗 %d 经费立即重置。", cfg.ResetCostCredits)
}

// ─── 会员/额度总览(给前端「账户资产 · 总览」+ 旧「我的会员」)────────────────────

// TokenStatus 当前周期额度状态。
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

// Overview 账户资产总览:等级 + 到期 + 额度 + 经费 + 重置参数。
type Overview struct {
	Tier      string       `json:"tier"`
	ExpiresAt *time.Time   `json:"expires_at"`
	Token     TokenStatus  `json:"token"`
	Credit    *BalanceView `json:"credit"`
	AutoReset bool         `json:"auto_reset"`
	ResetCost int          `json:"reset_cost"`
}

// DayUsage 当月某日的 token 用量(热力图用)。
type DayUsage struct {
	Date   string `json:"date"`   // YYYY-MM-DD
	Tokens int64  `json:"tokens"`
}

// DailyUsageThisMonth 从 llm_token_usage 聚合「当月每日 token 用量」(给前端按日绿格热力图)。
func (s *Service) DailyUsageThisMonth(userID uint) ([]DayUsage, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var rows []DayUsage
	err := s.repo.DB().Table("llm_token_usage").
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COALESCE(SUM(total_tokens),0) AS tokens").
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
	bal, err := s.wallet.Balance(userID)
	if err != nil {
		return nil, err
	}
	ov := &Overview{
		Tier: tier, Token: ts, Credit: bal,
		AutoReset: bal.AutoReset, ResetCost: cfg.ResetCostCredits, // auto_reset 已随 Balance 的钱包行读出, 省一次查询
	}
	if isPaidTier(tier) {
		ov.ExpiresAt = uv.VIPExpiresAt
	}
	return ov, nil
}
