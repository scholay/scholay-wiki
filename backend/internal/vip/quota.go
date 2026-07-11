// ============================================================================
// 统一每日 token 额度(取代旧的「每功能每日次数」)。
//
// **统计与限额分离**(本文件的核心设计):
//   - 真实消耗统计 used = quota:tokens:<uid>:<日>,单调累加(AddUsage),**永不被重置删减**;
//   - 额度窗口起点 base = quota:base:<uid>:<日>,重置/升级时抬到当前 used(缺省 0);
//   - 限额判定用「窗口内消耗」= used - base < ceiling(tier),而**不是直接拿统计当闸**。
// 这样「重置 / 升级满血」只动 base(限额侧),绝不擦除 used(统计侧)—— 重置后仍能看到
// 用户当天真实消耗了多少(旧实现重置=DEL 计数,会把当天统计一并清零,统计与限额纠缠)。
// 每用户一条每日额度 = FreeDailyTokens × 倍率(tier),所有 AI 功能共用。
//
// 满血的三条路径,都只动 base、不动 used:
//   - 手动重置:消耗经费(ResetQuota → base=used);
//   - 升级到付费档:免费(ResetBaselineOnUpgrade → base=used,套餐升级立即满血);
//   - 每日 00:00:自然滚动到新 key(used、base 皆 0)。
//
// 计数走 Redis(persist 池),TTL 25h,fail-open(Redis 挂→放行)。
// 北京时区直接 time.Now()(项目铁律:不做 UTC 转换)。
// ============================================================================

package vip

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"scholar-backend/internal/common/cache"
)

// resetLockShards 把「配额重置」按 user 分片串行化(进程内快路径)。
// 防 CheckDailyQuota 的 check-then-act 并发双扣:钱包行锁只防透支、不防「两个并发耗尽请求
// 各自决定重置各扣一次重置费」。256 片足够分散,偶发跨用户假争用可忽略。
var resetLockShards [256]sync.Mutex

// resetUnlockLua 释放锁:仅当值仍是自己持有时才 DEL(防误删他人/已超时重发的锁)。
const resetUnlockLua = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`

// acquireResetLock 获取某用户的「配额重置」互斥锁。双层:
//   - 进程内分片 mutex:同实例内串行(快、零依赖,Redis 抖动时仍然安全)。
//   - 跨实例 Redis SETNX(quota:reset:<uid>:<day>,5s TTL):多副本部署下串行化同一用户的重置,
//     补上 C3「reset lock 计划用 Redis 但未实现 → 单实例押注」的缺口。Redis 不可用 → 仅靠进程内锁
//     (单实例下等效;多实例下退化到旧行为,fail-open 不阻断功能)。
//
// 返回 unlock:释放 Redis 锁(CAS 防误删)后再解进程锁。重置体执行 <100ms,远短于 5s TTL,
// 正常不会锁过期;TTL 仅防持锁实例崩溃后死锁。
func (s *Service) acquireResetLock(ctx context.Context, userID uint) func() {
	m := &resetLockShards[userID%uint(len(resetLockShards))]
	m.Lock()

	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return m.Unlock // Redis 不可用 → 仅进程内锁
	}
	key := fmt.Sprintf("quota:reset:%d:%s", userID, time.Now().Format("20060102"))
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

// tokenDayKey —— 当日 token 计数 key(含日期,跨 0 点自然换 key = 自动满血)。
func tokenDayKey(userID uint, now time.Time) string {
	return fmt.Sprintf("quota:tokens:%d:%s", userID, now.Format("20060102"))
}

// 「额度计数器 Redis 不可用」告警限流:每分钟至多一条 WARN。
var (
	quotaDegradedMu sync.Mutex
	quotaDegradedAt time.Time
)

// warnQuotaDegraded 把「每日额度计数器所在 Redis 不可用」这一敞口可见化(限流,每分钟一条)。
// 此刻 CheckDailyQuota/AddUsage 双双 fail-open = 配额暂时不强制(全功能实质放行),账本(MySQL)
// 仍记可事后核账。限流避免 Redis 抖动期逐请求刷屏(沿用「per-call 失败不刷屏」的初衷),
// 但保证这个「无限免费窗口」不再是 DEBUG 级的完全静默 —— 见 docs/research/ai-token-surface R3。
func warnQuotaDegraded(reason string, attrs ...any) {
	now := time.Now()
	quotaDegradedMu.Lock()
	if now.Sub(quotaDegradedAt) < time.Minute {
		quotaDegradedMu.Unlock()
		return
	}
	quotaDegradedAt = now
	quotaDegradedMu.Unlock()
	slog.Warn("billing: 每日额度计数器 Redis 不可用,退回进程内兜底计数(有界 fail-open)— "+reason, attrs...)
}

// ── 有界 fail-open:Redis 挂了时的进程内兜底日额度计数器(评审 SS#3)─────────────────
// 原设计 Redis 挂 → 完全不计不闸 = 停摆期「无限免费 AI」(claw 是 pro+Bash,敞口最大)。改为:
// Redis 不可用时退回**进程内**当日累计,仍按同一 tier 上限做闸门 —— 把敞口从「无限」收敛到
// 「每实例 · 每用户 · 当日上限」量级。局限(有意接受、非替代 Redis):进程重启即清零、多实例各算各的、
// Redis 恢复后不回填这段窗口。MySQL 账本照记,可事后核账。仅在 rdb==nil 时启用,Redis 正常时零参与。
type fallbackCounter struct {
	mu   sync.Mutex
	day  string         // "20060102";跨天自动清零
	used map[uint]int64 // userID → 当日进程内累计 token
}

var quotaFallback = &fallbackCounter{used: map[uint]int64{}}

func (f *fallbackCounter) rollover(now time.Time) {
	if d := now.Format("20060102"); f.day != d {
		f.day = d
		f.used = map[uint]int64{}
	}
}

func (f *fallbackCounter) get(userID uint) int64 {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rollover(time.Now())
	return f.used[userID]
}

func (f *fallbackCounter) add(userID uint, tokens int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rollover(time.Now())
	f.used[userID] += tokens
}

// tokenBaseKey —— 当日额度「窗口起点」key。重置/升级时置为当时的 used,使窗口内消耗归零
// 而不删除 used 统计。缺省(不存在)= 0。
func tokenBaseKey(userID uint, now time.Time) string {
	return fmt.Sprintf("quota:base:%d:%s", userID, now.Format("20060102"))
}

// tokenUsed 读当日**真实累计消耗**(统计口径,单调,永不被重置删减)。Redis 挂 / key 不存在 → 0。
func (s *Service) tokenUsed(ctx context.Context, userID uint) int64 {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		warnQuotaDegraded("counter read")
		return quotaFallback.get(userID) // 有界 fail-open:退回进程内当日累计(而非 0),让闸门仍有效
	}
	v, err := rdb.Get(ctx, tokenDayKey(userID, time.Now())).Int64()
	if err != nil {
		return 0 // key 不存在(redis.Nil)或读失败 → 视为 0
	}
	return v
}

// tokenBaseline 读当前额度窗口起点(上次重置/升级时的 used 快照)。缺省 0。
func (s *Service) tokenBaseline(ctx context.Context, userID uint) int64 {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return 0
	}
	v, err := rdb.Get(ctx, tokenBaseKey(userID, time.Now())).Int64()
	if err != nil {
		return 0
	}
	return v
}

// tokenWindowUsed 当前额度窗口内已消耗 = 真实累计 - 窗口起点(clamp ≥0)。**配额判定用它**,
// 不直接拿 used 统计当闸 —— 这样重置/升级抬 base 后窗口归零,但 used 统计完好。
func (s *Service) tokenWindowUsed(ctx context.Context, userID uint) int64 {
	if w := s.tokenUsed(ctx, userID) - s.tokenBaseline(ctx, userID); w > 0 {
		return w
	}
	return 0
}

// CheckDailyQuota —— **每日 token 额度闸门**(统一池, 所有 AI 功能共用, 不分功能)。
// 只读闸门, 不预扣;真实消耗由 AddUsage 后置累加。
//
// 流程:取用户生效等级 → 算上限 → 当日已耗 < 上限则放行;超限时若开了「自动重置」且经费够,
// 自动消耗经费重置后放行,否则回 ErrQuotaExceeded(友好文案)。
// 上限 <0 = 不限;收费总开关关 = 不限;Redis 挂 = fail-open(放行)。
func (s *Service) CheckDailyQuota(ctx context.Context, userID uint) error {
	if userID == 0 {
		return nil // 未登录(这些功能均已强制登录)安全放行
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return nil
	}
	tier := s.EffectiveTier(userID)
	ceiling := cfg.DailyCeiling(tier)
	if ceiling < 0 {
		return nil // 不限额
	}
	if s.tokenWindowUsed(ctx, userID) < ceiling {
		return nil
	}
	// 超限:**不再自动扣经费重置**(该逻辑已下线——避免静默扣费让用户感觉经费莫名减少)。
	// 直接返回友好文案,由前端弹窗让用户**显式**点「消耗 N 经费重置」,或升级套餐 / 等明日 0 点恢复。
	return NewQuotaError(quotaExceededMessage(tier, cfg))
}

// RemainingBudget —— 有界透支预算(SS#2),给 agentbridge 每条 user_message 盖章用。
// soft = 到「日上限」还剩;hard = 到「上限 + 透支带」还剩(均可为负 = 已在透支带内)。
// unlimited=true(收费关 / 上限<0 / 未登录)时无预算概念 → 调用方不盖章 → 执行器无预算 → 无收尾。
// 只读(与 CheckDailyQuota 同口径 tokenWindowUsed),不预扣;计费仍走 AddUsage 后置精确累加。
func (s *Service) RemainingBudget(ctx context.Context, userID uint) (soft, hard int64, unlimited bool) {
	if userID == 0 {
		return 0, 0, true
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return 0, 0, true
	}
	tier := s.EffectiveTier(userID)
	ceiling := cfg.DailyCeiling(tier)
	if ceiling < 0 {
		return 0, 0, true
	}
	used := s.tokenWindowUsed(ctx, userID)
	return ceiling - used, ceiling + cfg.OverdraftTokens(tier) - used, false
}

// CheckDailyQuotaOverdraft —— 有界透支版起点闸(SS#2,给 smart_search/claw/prism 用)。
// 与 CheckDailyQuota 唯一区别:上限放宽到 ceiling + 透支带 —— 跨过 ceiling 那一轮**总能起跑**(不卡死),
// 只有把透支带也用完,下一轮起点才回 ErrQuotaExceeded(同一套友好文案 / 重置 UX)。
// peerreview(任务型)保持用严格的 CheckDailyQuota,起点从严。
func (s *Service) CheckDailyQuotaOverdraft(ctx context.Context, userID uint) error {
	if userID == 0 {
		return nil
	}
	cfg := s.cfg.Get()
	if !cfg.Enabled {
		return nil
	}
	tier := s.EffectiveTier(userID)
	ceiling := cfg.DailyCeiling(tier)
	if ceiling < 0 {
		return nil
	}
	if s.tokenWindowUsed(ctx, userID) < ceiling+cfg.OverdraftTokens(tier) {
		return nil
	}
	return NewQuotaError(quotaExceededMessage(tier, cfg))
}

// AddUsage —— 把一次 LLM 调用的真实 token 计入当日额度(由 llmusage.Record 观察者调用)。
// 唯一的额度「扣减」点。userID==0 / tokens<=0 / Redis 挂 → 跳过(best-effort, 绝不阻塞)。
func (s *Service) AddUsage(ctx context.Context, userID uint, tokens int) {
	if userID == 0 || tokens <= 0 {
		return
	}
	if !s.cfg.Get().Enabled {
		return
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		// 有界 fail-open:Redis 挂了期间也累加进程内兜底计数,使 tokenUsed 读得到、闸门仍能收敛敞口。
		quotaFallback.add(userID, int64(tokens))
		warnQuotaDegraded("usage incr", "user_id", userID)
		return
	}
	key := tokenDayKey(userID, time.Now())
	n, err := rdb.IncrBy(ctx, key, int64(tokens)).Result()
	if err != nil {
		// fail-open 是既定契约(Redis 挂 → 放行,不阻塞用户),但敞口要可见 → 限流 WARN
		// (每分钟至多一条,避免逐请求刷屏)。账本仍记 MySQL,可事后核账。
		warnQuotaDegraded("usage incr failed", "user_id", userID, "err", err)
		return
	}
	if n == int64(tokens) { // 当日首次累加 → 设 25h 过期(防时钟漂移)
		if e := rdb.Expire(ctx, key, 25*time.Hour).Err(); e != nil {
			slog.Debug("billing: token usage expire set failed (fail-open)", "user_id", userID, "err", e)
		}
	}
	// R8 可观测:额度只在操作入口做只读 gate、无单轮帽 → 一次操作(尤其 peerreview 4 轮 / agent 大扇出)
	// 可在后置扣减时冲过当日上限。这里在「本次累加恰好把用户从上限内推到上限外」时记一笔(每用户每天
	// 至多一次),量化超支幅度。不在此阻断 —— 操作已发生、扣减后置;是否上硬约束(带 UX 取舍)按这些
	// 数据再单独决策。显著超支(单次越线 >25% 当日预算)升 WARN,普通越线 DEBUG(release 不输出)。
	if cfg := s.cfg.Get(); cfg.Enabled {
		if ceiling := cfg.DailyCeiling(s.EffectiveTier(userID)); ceiling > 0 {
			// 用窗口口径(used-base)判越线,与 CheckDailyQuota 一致;否则重置后 used 仍 > ceiling 会误报。
			base := s.tokenBaseline(ctx, userID)
			prevWin := (n - int64(tokens)) - base
			curWin := n - base
			if prevWin < ceiling && curWin >= ceiling {
				overshoot := curWin - ceiling
				if overshoot > ceiling/4 {
					slog.Warn("billing: 单次操作显著越过当日额度(入口只读 gate 的后置超支)",
						"user_id", userID, "ceiling", ceiling, "window_used", curWin, "overshoot", overshoot)
				} else {
					slog.Debug("billing: 当日额度越线",
						"user_id", userID, "ceiling", ceiling, "window_used", curWin, "overshoot", overshoot)
				}
			}
		}
	}
}

// ResetResult 重置后的额度 + 钱包余额(回前端刷新 UI)。
type ResetResult struct {
	Used    int64        `json:"used"`
	Ceiling int64        `json:"ceiling"`
	Balance *BalanceView `json:"balance"`
}

// ResetQuota —— 手动重置:消耗经费 → 清当日 token 计数(额度满血)。
// 经费不足回 ErrInsufficientCredit。
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
		Used:    s.tokenWindowUsed(ctx, userID), // 窗口口径(重置后应为 0),与额度条一致
		Ceiling: cfg.DailyCeiling(s.EffectiveTier(userID)),
		Balance: bal,
	}, nil
}

// resetInternal 消耗经费 → 清当日 token 计数(额度满血)。经费不足 → ErrInsufficientCredit(不清计数)。
//
// 并发与失败安全(per-user 锁内):
//   1. 锁内重读计数:已被并发重置 / 跨 0 点自然滚动清空 → 直接成功,绝不重复扣费(防双扣)。
//   2. 先校验余额,再【先清计数(Redis 写)、后扣费】:Redis 写失败(宕机/MISCONF)直接返回错误、
//      不扣费 —— 杜绝旧实现「扣了钱但 DEL 失败仅 Warn 返 nil → 计数没清 → 每条消息再扣一次」的循环扣费。
func (s *Service) resetInternal(ctx context.Context, userID uint, cfg *BillingConfig) error {
	unlock := s.acquireResetLock(ctx, userID)
	defer unlock()

	// 「本次重置是否还有必要」:当前生效 tier 的上限下,当日已耗 < 上限 = 不需要重置
	// (已被并发重置 / 跨 0 点自然滚动清空 / **刚升级抬高了上限**)。复用为闭包,扣费前再判一次堵竞态。
	resetNotNeeded := func() bool {
		ceiling := cfg.DailyCeiling(s.EffectiveTier(userID))
		return ceiling >= 0 && s.tokenWindowUsed(ctx, userID) < ceiling
	}

	// 1) 锁内首判:不需要就直接成功,绝不扣费。
	if resetNotNeeded() {
		return nil
	}

	cost := cfg.ResetCostCredits
	// 2) 余额预检(锁内、本用户已串行化):不足直接返回,不清计数、不扣费。
	if cost > 0 {
		bal, err := s.wallet.Balance(userID)
		if err != nil {
			return err
		}
		if bal.Total < cost {
			return ErrInsufficientCredit
		}
	}

	// 2.5) 竞态护栏(关键):读 tier(首判)与读余额是两条独立查询,期间「升级到 Pro」事务可能
	//      恰好提交 —— tier→Pro 上限从 Free 抬到 5×, 当日用量已被新上限覆盖, 本次重置已无必要。
	//      扣费前用**最新 tier** 再判一次, 杜绝「用户刚充值升级、却被白扣一次重置费」的 TOCTOU。
	//      (线上已发现:充 Pro 送 600 经费,落账却是 540 = 升级瞬间误触一次重置。)
	if resetNotNeeded() {
		return nil
	}

	// 3) 先抬窗口起点 base=当前 used(Redis 写)→ 窗口内消耗归零 = 满血,但 used 统计完整保留。
	//    失败即返回错误、不扣费,杜绝「扣了钱但额度没满血 → 每条消息再扣一次」的循环扣费。
	rdb := cache.GetRedisPersist()
	if rdb != nil {
		used := s.tokenUsed(ctx, userID)
		if err := rdb.Set(ctx, tokenBaseKey(userID, time.Now()), used, 25*time.Hour).Err(); err != nil {
			slog.Warn("billing: reset set baseline failed, not charging", "user_id", userID, "err", err)
			return err
		}
	}

	// 4) 计数已清,扣费(余额已校验足够,Consume 行锁兜底)。
	if cost > 0 {
		if err := s.wallet.Consume(userID, cost, TxResetConsume, "reset", time.Now().Format("20060102"), "重置每日额度"); err != nil {
			// 计数已清(用户已得重置)但扣费失败 —— 校验后到此被掏空,已被本锁串行化基本排除。
			// 给一次免费重置远胜把用户卡死或重复扣费,这里只告警不回滚。
			slog.Error("billing: reset consume failed after counter cleared (free reset granted)", "user_id", userID, "err", err)
		}
	}
	return nil
}

// ResetBaselineOnUpgrade —— 升级/续费到付费档后**免费满血**:把额度窗口起点 base 抬到当前 used,
// 用户立刻获得新档全额当日预算,且不动真实消耗统计(used)。不收经费。best-effort:Redis 挂 / 写失败
// 仅告警 —— 失败时新档更高的 ceiling 本身也给出更多余量兜底,不影响付费履约。
//
// 由 GrantToUser(管理员授予)/ Redeem(兑换码授予会员)/ 订阅订单履约后(activateSubscription)调用;
// 撤销/降级(RevokeUser)**不调** —— 降级不该平白给一份新预算。今日还没消耗(used<=0)直接跳过。
func (s *Service) ResetBaselineOnUpgrade(ctx context.Context, userID uint) {
	if userID == 0 {
		return
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return
	}
	used := s.tokenUsed(ctx, userID)
	if used <= 0 {
		return // 今天还没消耗, 窗口本就满血, 无需抬基线
	}
	if err := rdb.Set(ctx, tokenBaseKey(userID, time.Now()), used, 25*time.Hour).Err(); err != nil {
		slog.Warn("billing: upgrade baseline reset failed (falls back to higher ceiling)", "user_id", userID, "err", err)
		return
	}
	slog.Info("billing: 升级满血 — 额度窗口已重置", "user_id", userID, "baseline", used)
}

// quotaExceededMessage 超限友好文案(含重置花费 + 升级/充值引导)。
func quotaExceededMessage(tier string, cfg *BillingConfig) string {
	if tier == TierFree {
		return fmt.Sprintf("今日 AI 额度已用完。升级会员可获更高额度,或消耗 %d 经费立即重置额度。", cfg.ResetCostCredits)
	}
	return fmt.Sprintf("今日 AI 额度已用完。可消耗 %d 经费立即重置额度,或明日 00:00 自动恢复。", cfg.ResetCostCredits)
}

// ─── 会员/额度总览(给前端「账户资产 · 总览」+ 旧「我的会员」)────────────────────

// TokenStatus 当日额度状态。
// Used/Percent 是**额度窗口口径**(used-base,即额度条该显示的"本窗口已用"),重置/升级后归零;
// ConsumedToday 是**真实累计统计**(当天实际烧了多少 token,含重置前),给"今日消耗"展示用。
type TokenStatus struct {
	Used          int64 `json:"used"`           // 窗口内已用(额度条用)
	Ceiling       int64 `json:"ceiling"`        // -1 = 不限
	Percent       int   `json:"percent"`        // 窗口已用百分比(0..100;不限时 0)
	Unlimited     bool  `json:"unlimited"`
	ConsumedToday int64 `json:"consumed_today"` // 当天真实累计消耗(统计口径,重置不清零)
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

// GetOverview 组装总览。
func (s *Service) GetOverview(ctx context.Context, userID uint) (*Overview, error) {
	uv, err := s.repo.GetUserVIP(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	tier := effectiveTier(uv, now)
	cfg := s.cfg.Get()
	ceiling := cfg.DailyCeiling(tier)
	consumed := s.tokenUsed(ctx, userID)        // 真实累计(统计)
	windowUsed := s.tokenWindowUsed(ctx, userID) // 窗口内已用(限额条)
	ts := TokenStatus{Used: windowUsed, Ceiling: ceiling, Unlimited: ceiling < 0, ConsumedToday: consumed}
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
