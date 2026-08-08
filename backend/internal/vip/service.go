// ============================================================================
// vip.Service —— 会员等级判定 + 统一 token 额度闸门 + 经费钱包 + 兑换码/订阅。
//
// 等级判定(EffectiveTier)与兑换码留在本文件;每日 token 额度在 quota.go;
// 经费钱包在 wallet.go;单行计费配置在 config.go。Service 聚合 cfg/wallet 供各处用。
// ============================================================================

package vip

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Service struct {
	repo      *Repository
	cfg       *ConfigService
	wallet    *WalletService
	order     *OrderService
	msg       MessageSender       // 站内信(bootstrap 注入, 可 nil)
	emailCfg  EmailConfigProvider // 邮件配置(bootstrap 注入, 可 nil)
	payNotify func(*Order)        // 付费成功外部通知(飞书等;bootstrap 注入, 可 nil)

	// usedFlush 额度窗口 used 快照的节流刷盘器(quota_persist.go)。构造即可用(纯内存标脏),
	// 后台 ticker 由 StartQuotaPersistence 启动 —— 不在 NewService 里起 goroutine:
	// 单测会构造 Service,起了就得每个测试记得停,漏一个就是泄漏的 ticker。
	usedFlush *usedFlusher
}

// SetPaymentNotifier 注入「付费成功」外部通知钩子(如飞书客服消息)。
// 仅在订单经支付回调真正到账(notifyOrderFulfilled)时触发,创建订单不触发;
// 调用方钩子内自管异步/容错,这里仍以 safego 兜底,绝不阻塞/影响支付主流程。
func (s *Service) SetPaymentNotifier(fn func(*Order)) { s.payNotify = fn }

// NewService 构造会员/计费服务(含配置缓存 + 钱包 + 订单)。
func NewService(repo *Repository) *Service {
	s := &Service{
		repo:   repo,
		cfg:    NewConfigService(repo),
		wallet: NewWalletService(repo.DB()),
	}
	s.order = newOrderService(s)
	s.usedFlush = newUsedFlusher(s)
	return s
}

// StartQuotaPersistence 启动额度窗口 used 快照的后台刷盘;返回停止函数(bootstrap 在
// 关停序列里调用,退出前会同步 flush 最后一批)。
//
// 🔴 必须真的接线并真的在 SIGTERM 里调 stop。本仓库有过 flushTokenWatermark 的前科:
// 注释宣称它防优雅重启丢水位,而 SIGTERM 路径从头到尾没调用过它 —— 一个「写好了但没人叫」
// 的刷盘函数和不存在完全等价,却会让读代码的人以为这块已经有兜底。
func (s *Service) StartQuotaPersistence() (stop func()) {
	s.usedFlush.Start()
	return s.usedFlush.Stop
}

// Config / Wallet / Order 暴露给 handler / 支付回调。
func (s *Service) Config() *ConfigService { return s.cfg }
func (s *Service) Wallet() *WalletService { return s.wallet }
func (s *Service) Order() *OrderService   { return s.order }

// GrantInviteReward 发放「邀请好友注册奖励」给邀请人(0100;invite 模块经 bootstrap seam 调用)。
// 入账走 GrantPerm 唯一落点(写 credit_transactions:type=invite_reward / ref_type=invite /
// ref_id=被邀者 user_id)。成功后 best-effort 站内信(异步),通知失败不影响发放结果。
// 防双发不在这里:invite 侧以 rewarded_credits=0 条件更新抢标记后才会调进来。
func (s *Service) GrantInviteReward(inviterID uint, amount int, invitedUserID uint) error {
	if amount <= 0 {
		return nil // 活动未开/误配,不入账也不发通知
	}
	if err := s.wallet.GrantPerm(inviterID, amount, SourceInvite, fmt.Sprint(invitedUserID), TxInviteReward, "邀请好友注册奖励"); err != nil {
		return err
	}
	s.notifyInviteReward(inviterID, amount)
	return nil
}

// ListUserRedemptions 透传 repo:列某用户兑换记录(admin 用户详情用)。
func (s *Service) ListUserRedemptions(userID uint, limit, offset int) ([]UserRedemptionView, int64, error) {
	return s.repo.ListUserRedemptions(userID, limit, offset)
}

// PaymentMethods 返回当前可用的支付渠道(按 admin 配置表里有无 is_active 配置决定)。
// 充值前端据此决定显示哪些支付方式(再叠加 dev 的测试支付)。
//
// 🔴 微信侧额外要求 validation_status='valid':这个「能力位」直接决定前端要不要显示
// 「微信支付」按钮。只看 is_active 的话,管理员一保存并启用配置,全站用户立刻看到一个
// 按下去必然失败的入口 —— 而配置到底哪一步不对,用户和管理员都无从得知。
// 加上 valid 之后,支付入口只在「后台点过『测试配置』且通过」之后才出现。
// (0105 迁移给存量行的默认值是 untested,所以升级后需要管理员去点一次测试。)
func (s *Service) PaymentMethods() (alipay bool, wechat bool) {
	var a, w int64
	s.repo.DB().Table("alipay_configs").Where("is_active = ?", true).Count(&a)
	s.repo.DB().Table("wechat_pay_configs").
		Where("is_active = ? AND validation_status = ?", true, "valid").Count(&w)
	return a > 0, w > 0
}

// SubQuote 订阅报价(给前端弹窗显示动作 + 应付金额 + 经费)。
type SubQuote struct {
	Action      string `json:"action"` // new | renew | upgrade
	Tier        string `json:"tier"`
	Cycle       string `json:"cycle"`        // 实际计费周期:new/renew=请求周期;upgrade=用户当前订阅周期
	AmountCents int    `json:"amount_cents"` // 本次应付(分)
	// (Credits 已删除 —— 0090 起订阅不再赠送经费;前端购买弹窗的「赠送 N 经费」一并移除)
	Deferred      bool       `json:"deferred"`                // 续期=true(本单权益从当前到期日起算,而非立即)
	CurrentTier   string     `json:"current_tier"`            // 用户当前生效档
	CurrentCycle  string     `json:"current_cycle,omitempty"` // 用户当前订阅周期(付费在期时)
	RemainingDays int        `json:"remaining_days"`
	NewExpiresAt  *time.Time `json:"new_expires_at"` // 履约后会员到期日(弹窗「有效期至」)
}

// QuoteSubscription 给前端算「订阅/续期/升级」的动作与应付金额(不建单)。
// cycle = monthly|yearly(空按 monthly)。降级回 ErrNoDowngrade;年付未配置回 ErrInvalidOrder。
func (s *Service) QuoteSubscription(userID uint, target, cycle string) (*SubQuote, error) {
	now := time.Now()
	uv, _ := s.repo.GetUserVIP(userID)
	sp, err := computeSubscription(uv, target, cycle, s.cfg.Get(), now)
	if err != nil {
		return nil, err
	}
	ne := sp.NewExpires
	return &SubQuote{
		Action: sp.Action, Tier: sp.Tier, Cycle: sp.Cycle, AmountCents: sp.AmountCents,
		Deferred: sp.Deferred, CurrentTier: effectiveTier(uv, now), CurrentCycle: effectiveCycle(uv, now),
		RemainingDays: sp.RemainingDays, NewExpiresAt: &ne,
	}, nil
}

// EffectiveTier 返回**当前生效**等级:pro/max 且未过期 → 该档;否则 free(到期自动回落, 无定时任务)。
func (s *Service) EffectiveTier(userID uint) string {
	uv, err := s.repo.GetUserVIP(userID)
	if err != nil {
		slog.Warn("vip: get user vip failed, fallback free", "user_id", userID, "err", err)
		return TierFree
	}
	return effectiveTier(uv, time.Now())
}

func effectiveTier(uv UserVIP, now time.Time) string {
	if isPaidTier(uv.VIPTier) && (uv.VIPExpiresAt == nil || uv.VIPExpiresAt.After(now)) {
		return uv.VIPTier
	}
	return TierFree
}

// effectiveCycle 当前生效计费周期:付费档在期时 monthly|yearly(「年费会员」标识),否则空串。
// 真源 = users.vip_cycle(最近一次付费订阅的周期,0079)。
func effectiveCycle(uv UserVIP, now time.Time) string {
	if !isPaidTier(effectiveTier(uv, now)) {
		return ""
	}
	return normCycle(uv.VIPCycle)
}

// maxGrantAmount 各单位的上界 —— 防手滑(把 365 填进「年」= 365 年)。
// 天 3650(≈10 年,与兑换码 SetCodeGrantDays 的既有夹取同口径)/ 月 120(10 年)/ 年 10。
func maxGrantAmount(unit string) int {
	switch NormGrantUnit(unit) {
	case GrantUnitMonth:
		return 120
	case GrantUnitYear:
		return 10
	default:
		return 3650
	}
}

// applyMembershipGrant —— 单调地把「授予 grantTier 续 amount 个 unit」叠加到当前会员状态上(纯函数)。
// 规则:① 绝不降级(取当前生效等级与 grantTier 中更高的);② 绝不截断(在期则从现到期日顺延)。
// 返回(新等级, 新到期)。被 兑换码 / admin 直授 复用。
//
// unit ∈ {day, month, year}(0110 起)。月/年走 AddPeriodN 的**真自然月/年**(carbon NoOverflow),
// 与购买/续费的 AddPeriod 同一口径 —— 「发 1 个月」和「买 1 个月」必须给出同一个到期日,
// 否则同一个用户从两条路拿到的时长不一致,是最难解释的一类客诉。
func applyMembershipGrant(cur UserVIP, grantTier string, amount int, unit string, now time.Time) (string, time.Time) {
	curTier := effectiveTier(cur, now)
	base := now
	if isPaidTier(curTier) && cur.VIPExpiresAt != nil && cur.VIPExpiresAt.After(now) {
		base = *cur.VIPExpiresAt
	}
	newTier := grantTier
	if tierRank(curTier) > tierRank(grantTier) {
		newTier = curTier // 不降级
	}
	return newTier, AddPeriodN(base, unit, amount)
}

// grantMembershipInTx —— 「授予 grantTier 续 days 天」的**唯一串行化落点**(兑换码 / admin 直授共用)。
//
// 🔴 2026-08-02 计费审计 P0-8:此前兑换码与 admin 直授都是「无锁读 uv → 内存算新到期 → 整值覆盖写」,
// 只有订阅履约(activateSubscriptionInTx)对 users 行加了 FOR UPDATE。三条路两两并发都会丢授予:
//   - 两张 30 天码几乎同时兑:各锁自己的 code 行,对 users 行是 REPEATABLE READ 快照 → 都读到 E、
//     都写 E+30d → 用户少拿 30 天,而两条兑换流水已落库、两张码 used_count 都 +1(不可回兑);
//   - 续费回调正在 fulfill(持 users 行 FOR UPDATE 写 E+1 月)时用户兑码 → 兑码用旧快照覆盖
//     → **那笔 ¥59 的续费月份被吃掉:订单 paid、钱收了、权益没给**。
//
// 现在三条路共用同一把 users 行锁,MySQL 会把它们排成队。
//
// cycleOverride 非空即写;为空时只在「用户当前不是在期付费会员」才回落 monthly ——
// 防陈旧 vip_cycle 泄漏(过期年费用户重新开通后仍顶着「年费会员」徽标),在期叠加则不动现值。
// 返回值 prevTier 是**授予前**的生效等级(调用方据此判断「这次授予是否真的抬升了档位」——
// 兑换码的满血判定要用它,见 Service.Redeem 的红字)。
func grantMembershipInTx(tx *gorm.DB, userID uint, grantTier string, amount int, unit string, cycleOverride string, now time.Time) (newTier string, newExpires time.Time, prevTier string, err error) {
	// 秒对齐 —— 与订阅履约(activateSubscriptionInTx)口径一致。
	// vip_expires_at 是 DATETIME(无亚秒),MySQL 对带小数秒的值是**四舍五入**进位;
	// 授予链路此前传的是裸 time.Now(),纳秒原样进去会被上取整最多 +1 秒,
	// 与订阅链路对同一列产生两套口径(审计 2026-08-04 指出)。
	now = now.Truncate(time.Second)
	var uv UserVIP
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Table("users").Select("vip_tier, vip_expires_at, vip_cycle").Where("id = ?", userID).
		Scan(&uv).Error; err != nil {
		return "", time.Time{}, "", err
	}
	prevTier = effectiveTier(uv, now)
	newTier, newExpires = applyMembershipGrant(uv, grantTier, amount, unit, now)
	updates := map[string]any{"vip_tier": newTier, "vip_expires_at": newExpires}
	switch {
	case cycleOverride != "":
		updates["vip_cycle"] = normCycle(cycleOverride)
	case !isPaidTier(prevTier):
		updates["vip_cycle"] = CycleMonthly
	}
	res := tx.Table("users").Where("id = ?", userID).Updates(updates)
	if res.Error != nil {
		return "", time.Time{}, "", res.Error
	}
	if res.RowsAffected == 0 {
		// RowsAffected 只数「值有变化」的行,授予到同样的值是合法 no-op,不能据此判不存在。
		var n int64
		if err := tx.Table("users").Where("id = ?", userID).Count(&n).Error; err != nil {
			return "", time.Time{}, "", err
		}
		if n == 0 {
			return "", time.Time{}, "", ErrUserNotFound
		}
	}
	// 到期日被延长 → 该用户手里任何按「旧余期」定价的在途升级单立刻失去定价基准,必须作废。
	// 不作废的话,那张单仍可在网关侧被支付并复活履约(见 activateSubscriptionInTx 的 P0-2 红字)。
	if err := voidPendingUpgradeOrders(tx, userID, "membership grant extended expiry"); err != nil {
		return "", time.Time{}, "", err
	}
	return newTier, newExpires, prevTier, nil
}

// ─── 兑换 / 发码 ─────────────────────────────────────────────────────────

// RedeemResult 兑换成功返回(tier 码:返回等级 + 到期;credit 码:返回到账经费)。
type RedeemResult struct {
	Kind       string     `json:"kind"` // tier | credit
	Tier       string     `json:"tier,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	Credits    int        `json:"credits,omitempty"`
	CreditKind string     `json:"credit_kind,omitempty"` // temp | perm
	// refillEligible 本次兑换是否有资格触发「额度窗口满血」。不外发(小写),由 repo 在事务内算出:
	// 需要同时满足「档位真的抬升了」与「授予时长 ≥ 一个计费周期」。见 Redeem 的红字。
	refillEligible bool
}

// Redeem 用户兑换:归一化码 → 事务里校验 + 授予(会员 or 经费)。成功后发站内信 + 邮件通知。
func (s *Service) Redeem(ctx context.Context, userID uint, rawCode string) (*RedeemResult, error) {
	code := normalizeCode(rawCode)
	if code == "" {
		return nil, ErrCodeNotFound
	}
	res, err := s.repo.Redeem(userID, code, time.Now())
	if err != nil {
		return nil, err
	}
	// 🔴 兑换码满血的两道闸(2026-08-02 计费审计 P1-7)。
	//
	// 旧写法只判「这是不是一张会员码」就无条件 ResetBaselineOnUpgrade,而后者 = DEL 窗口锚点
	// = 送一个**完整周期的额度 + 重新起算的 7 天时钟**。对照同包里正规的手动重置 resetInternal:
	// 它先判「窗口是否真的耗尽」再必须扣 1 次不可再生的 CreditResetPass,两道闸兑换码一道不过。
	// 后果是一张码的平台成本与它授予的会员天数**完全解耦**:出厂配置下一张「Pro 1 天」码的成本
	// 不是按天摊销的 ¥0.86,而是一整个 ¥6 窗口;发几张不同的短天数码即可线性叠加。
	//
	// 现在要求同时满足(判据在事务内算,见 repository.Redeem):
	//   ① 档位**真的抬升**了 —— Max 用户兑一张最便宜的 Pro 码不再触发按 max 档算的满血;
	//      同档续期也不再送整窗(它的 ceiling 没变,凭什么清零已用量)。
	//   ② 授予时长 ≥ 一个计费周期 —— 不够一个窗口的码不配重置整个窗口。
	// 不满足也不影响用户体验:档位抬升本身就把 ceiling 抬高了(Pro = 20× Free),
	// 剩余额度自然变多,真正需要"清零已用量"的只有「已用量 ≥ 新档 ceiling」这种极少数情形。
	if res != nil && res.Kind == "tier" && res.refillEligible {
		s.ResetBaselineOnUpgrade(ctx, userID)
	}
	s.notifyRedeem(userID, res)
	return res, nil
}

// CodePreview 兑换前预览(给确认弹窗):码有效时返回将授予的内容;无效则方法返回 error
// (handler 翻成「无效/过期/已用完/已兑换过」等失败态)。
type CodePreview struct {
	GrantKind string `json:"grant_kind"` // tier | credit
	GrantTier string `json:"grant_tier,omitempty"`
	GrantDays int    `json:"grant_days,omitempty"`
	// GrantUnit day|month|year —— 用户端兑换确认弹窗据此渲染「N 天 / N 个月 / N 年」。
	// 🔴 漏了它就会把「1 个月」的码显示成「1 天」,那是用户点确认前看到的唯一时长承诺。
	GrantUnit    string     `json:"grant_unit,omitempty"`
	GrantCredits int        `json:"grant_credits,omitempty"`
	CreditKind   string     `json:"credit_kind,omitempty"`
	Note         string     `json:"note,omitempty"`
	ValidUntil   *time.Time `json:"valid_until,omitempty"`
	UsesLeft     int        `json:"uses_left"` // 剩余可兑次数
}

// PreviewCode 只读校验兑换码(不兑换), 供确认弹窗展示「对应活动 / 兑换内容」。
// 校验顺序与 Redeem 一致:不存在 → 过期 → 用完 → 本人已兑换。
func (s *Service) PreviewCode(ctx context.Context, userID uint, rawCode string) (*CodePreview, error) {
	code := normalizeCode(rawCode)
	if code == "" {
		return nil, ErrCodeNotFound
	}
	rc, err := s.repo.GetCodeByCode(code)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	if rc.RevokedAt != nil {
		return nil, ErrCodeRevoked
	}
	if rc.ValidUntil != nil && rc.ValidUntil.Before(now) {
		return nil, ErrCodeExpired
	}
	maxUses := rc.MaxUses
	if maxUses < 1 {
		maxUses = 1
	}
	if rc.UsedCount >= maxUses {
		return nil, ErrCodeExhausted
	}
	if done, err := s.repo.HasUserRedeemed(rc.ID, userID); err != nil {
		return nil, err
	} else if done {
		return nil, ErrCodeAlreadyRedeemed
	}
	return &CodePreview{
		GrantKind: rc.GrantKind, GrantTier: rc.GrantTier,
		GrantDays: rc.GrantDays, GrantUnit: NormGrantUnit(rc.GrantUnit),
		GrantCredits: rc.GrantCredits, CreditKind: rc.CreditKind,
		Note: rc.Note, ValidUntil: rc.ValidUntil, UsesLeft: maxUses - rc.UsedCount,
	}, nil
}

// GeneratedCodeBatch 是一次发码的结果。BatchID 会持久化到本次所有码，
// 因此页面刷新后仍可重新打开、复制或导出这一批。
type GeneratedCodeBatch struct {
	BatchID string   `json:"batch_id"`
	Codes   []string `json:"codes"`
	Count   int      `json:"count"`
}

// GenerateCodes 保留原有内部契约，供已有调用点/集成测试继续只取码列表。
// HTTP 生成接口调 GenerateCodeBatch，额外返回可持久访问的 batch_id。
func (s *Service) GenerateCodes(in GenerateCodesInput, createdBy *uint) ([]string, error) {
	batch, err := s.GenerateCodeBatch(in, createdBy)
	if err != nil {
		return nil, err
	}
	return batch.Codes, nil
}

// GenerateCodeBatch 管理员批量生成兑换码(tier 码:发会员;credit 码:发经费)。
// 一次调用只 mint 一个 UUID，并写入全部码行。CreateCodes 仍是单条多行 INSERT，
// 不会出现「批次存在、码只落了一部分」的中间态。
func (s *Service) GenerateCodeBatch(in GenerateCodesInput, createdBy *uint) (*GeneratedCodeBatch, error) {
	batchID := uuid.NewString()
	count := in.Count
	if count < 1 {
		count = 1
	}
	if count > 1000 {
		count = 1000
	}
	kind := in.GrantKind
	if kind != GrantKindCredit {
		kind = GrantKindTier
	}
	tier := in.Tier
	if kind == GrantKindTier {
		// tier 码默认 pro;只允许 pro/max(不发 free 码)。
		if tier != TierMax {
			tier = TierPro
		}
	}
	grantDays := in.GrantDays
	// 单位归一化 + 按单位兜底/夹取。
	// 🔴 兜底必须按单位分叉:传了 unit=month 但数量 <=0 时回落 30 会变成「30 个月」(≈2.5 年)。
	// 顺带补上界:生成路径此前只有下界,而事后「改时长」是夹到 3650 的 —— 同一字段两套口径。
	grantUnit := NormGrantUnit(in.GrantUnit)
	if grantDays <= 0 {
		if grantUnit == GrantUnitDay {
			grantDays = 30
		} else {
			grantDays = 1
		}
	}
	if max := maxGrantAmount(grantUnit); grantDays > max {
		grantDays = max
	}
	// 0090:临时经费退休 —— 新建的经费码一律永久,忽略入参 kind(后台表单已移除该选项)。
	creditKind := CreditKindPerm
	_ = in.CreditKind
	creditValidity := in.CreditValidityDays
	if creditValidity <= 0 {
		creditValidity = 30
	}
	// 兑换次数上限:默认 1, 最多 100。
	maxUses := in.MaxUses
	if maxUses < 1 {
		maxUses = 1
	}
	if maxUses > 100 {
		maxUses = 100
	}
	// 码有效期窗口:默认 7 天, 最长 30 天。valid_until = now + validDays(发码时一次性算定)。
	validDays := in.ValidDays
	if validDays < 1 {
		validDays = 7
	}
	if validDays > 30 {
		validDays = 30
	}
	validUntil := time.Now().AddDate(0, 0, validDays)
	codes := make([]RedemptionCode, 0, count)
	out := make([]string, 0, count)
	seen := make(map[string]struct{}, count)
	for len(out) < count {
		c, err := randomGiftCode()
		if err != nil {
			return nil, err
		}
		if _, dup := seen[c]; dup {
			continue
		}
		if exists, err := s.repo.CodeExists(c); err != nil {
			return nil, err
		} else if exists {
			continue
		}
		seen[c] = struct{}{}
		out = append(out, c)
		vu := validUntil
		codes = append(codes, RedemptionCode{
			BatchID: batchID, Code: c, GrantKind: kind, GrantTier: tier, GrantDays: grantDays, GrantUnit: grantUnit,
			GrantCredits: in.GrantCredits, CreditKind: creditKind, CreditValidityDays: creditValidity,
			MaxUses: maxUses, ValidUntil: &vu, Note: in.Note, CreatedBy: createdBy,
		})
	}
	if err := s.repo.CreateCodes(codes); err != nil {
		return nil, err
	}
	slog.Info("vip: generated redemption codes", "batch_id", batchID, "count", len(out), "kind", kind, "tier", tier)
	return &GeneratedCodeBatch{BatchID: batchID, Codes: out, Count: len(out)}, nil
}

// GenerateCodesInput admin 发码入参。
type GenerateCodesInput struct {
	Count              int
	GrantKind          string // tier | credit
	Tier               string // tier 码:pro|max
	GrantDays          int
	GrantUnit          string // day|month|year;空=day
	GrantCredits       int    // credit 码:经费数
	CreditKind         string // credit 码:temp|perm
	CreditValidityDays int    // credit 码 temp 时有效天数
	MaxUses            int    // 可兑换总次数(默认 1, 最多 100)
	ValidDays          int    // 码有效期窗口天数(默认 7, 最长 30);valid_until = now + ValidDays
	Note               string
}

// GrantToUser 管理员**直接**授予/续期会员(不走兑换码)。单调:不降级 + 在期顺延。返回新到期。
// cycle = 计费周期标识(monthly|yearly);空串 = 不改动(默认,防随手补天数冲掉年费标识)。
// GrantToUser admin 直授/续期会员。amount + unit(day|month|year)。
func (s *Service) GrantToUser(userID uint, tier string, amount int, unit string, cycle string) (time.Time, error) {
	if tier != TierPro && tier != TierMax {
		tier = TierPro
	}
	unit = NormGrantUnit(unit)
	// 兜底按**单位**分叉:传了 unit=month 但 amount<=0 时,回落成 30 天是错的(那是天单位的默认),
	// 应该回落成 1 个月。上界也按单位夹,防止手滑把 365 填进「年」变成 365 年。
	if amount <= 0 {
		switch unit {
		case GrantUnitMonth, GrantUnitYear:
			amount = 1
		default:
			amount = 30
		}
	}
	if max := maxGrantAmount(unit); amount > max {
		amount = max
	}
	// 走 grantMembershipInTx 这个唯一串行化落点(持 users 行 FOR UPDATE + 作废在途升级单)。
	// 此前是「无锁 GetUserVIP → 内存算 → SetUserVIP 整值覆盖」,与兑换码/续费履约并发会丢授予
	// (审计 P0-8)。周期标识的「防陈旧泄漏」规则也一并挪进去了:cycle 非空即写,为空时仅在
	// 「当前不是在期付费会员」才回落 monthly —— 与原来逐字等价。
	var newTier string
	var exp time.Time
	if err := s.repo.DB().Transaction(func(tx *gorm.DB) error {
		var err error
		newTier, exp, _, err = grantMembershipInTx(tx, userID, tier, amount, unit, cycle, time.Now())
		return err
	}); err != nil {
		return time.Time{}, err
	}
	// 授予/续期到付费档 → 免费满血(只抬额度窗口起点,不动 used 统计)。
	s.ResetBaselineOnUpgrade(context.Background(), userID)
	// 审计日志必须带单位 —— 只记 "days=1" 无法区分 1 天与 1 个月,而 admin 直授不落任何业务表,
	// 这条日志是唯一的事后追溯凭据。
	slog.Info("vip: admin granted membership", "user_id", userID, "tier", newTier,
		"amount", amount, "unit", unit, "cycle", cycle, "expires_at", exp)
	return exp, nil
}

// RevokeUser 管理员取消某用户会员(危险动作):会员立即过期(回 free + 清到期)
// + 清零订阅赠送的临时经费(随会员的那部分),其他来源临时经费 + 永久经费不动。整体一个事务。
func (s *Service) RevokeUser(userID uint) error {
	err := s.repo.DB().Transaction(func(tx *gorm.DB) error {
		// 1. 会员过期:tier=free, 清到期 + 周期标识回落月度。rows=0 时显式查存在性(free→free 是合法 no-op)。
		res := tx.Table("users").Where("id = ?", userID).
			Updates(map[string]any{"vip_tier": TierFree, "vip_expires_at": nil, "vip_cycle": CycleMonthly})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			var n int64
			if err := tx.Table("users").Where("id = ?", userID).Count(&n).Error; err != nil {
				return err
			}
			if n == 0 {
				return ErrUserNotFound
			}
		}
		// 2. (0090:订阅不再赠送经费 → 取消会员没有赠送物可回收。存量临时批次已换成
		//    重置次数,而次数是独立的补偿资源、不是会员权益,不连坐回收。)
		return nil
	})
	if err == nil {
		// 降级窗口对齐(审计 P1-2):撤销把用户打回 free,但窗口 used 是跨档继承的 ——
		// 不作废高档期开的那个窗口,用户的免费额度会恒为 0(甚至开了 autopay 就每次调用
		// 100% 从经费实扣)。与「升级满血」对称,post-commit best-effort。
		s.RealignWindowOnRevoke(context.Background(), userID)
		slog.Info("vip: admin revoked membership", "user_id", userID)
	}
	return err
}

// SetCodeStatus 管理员停用 / 恢复兑换码(停用后不可再兑, 已兑换的用户不受影响)。
func (s *Service) SetCodeStatus(id uint64, revoked bool) error {
	if err := s.repo.SetCodeRevoked(id, revoked, time.Now()); err != nil {
		return err
	}
	slog.Info("vip: set redemption code status", "code_id", id, "revoked", revoked)
	return nil
}

// maxCodeMaxUses 加次数操作的 max_uses 封顶。发码时默认上限是 100,admin 后期加次数放宽到 10 万
// (大批量分发场景),仍设硬顶防误填天文数字。
const maxCodeMaxUses = 100000

// ExtendCode 管理员给已生成的兑换码续期:有效期顺延 days 天(已过期的从现在起算)。返回最新行。
func (s *Service) ExtendCode(id uint64, days int) (*RedemptionCode, error) {
	if days < 1 {
		days = 1
	}
	if days > 3650 { // 单次续期最长 10 年,防误填
		days = 3650
	}
	if err := s.repo.ExtendValidUntil(id, days); err != nil {
		return nil, err
	}
	slog.Info("vip: extended redemption code validity", "code_id", id, "days", days)
	return s.repo.GetCodeByID(id)
}

// IncreaseCodeUses 管理员给已生成的兑换码加可兑换次数:max_uses += add(封顶 maxCodeMaxUses)。返回最新行。
func (s *Service) IncreaseCodeUses(id uint64, add int) (*RedemptionCode, error) {
	if add < 1 {
		add = 1
	}
	if add > maxCodeMaxUses { // 单次增量也设上限
		add = maxCodeMaxUses
	}
	if err := s.repo.AddMaxUses(id, add, maxCodeMaxUses); err != nil {
		return nil, err
	}
	slog.Info("vip: increased redemption code max_uses", "code_id", id, "add", add)
	return s.repo.GetCodeByID(id)
}

// SetCodeGrantDays 管理员修改会员码授予的会员天数(grant_days)。只对**之后的兑换**生效:
// 兑换时实时读本行 grant_days,已兑换用户的会员到期已落定、不受影响。仅限 tier 码。
// days 夹到 [1, 3650](与续期同口径,防误填天文数字)。返回最新行。
func (s *Service) SetCodeGrantDays(id uint64, amount int, unit string) (*RedemptionCode, error) {
	unit = NormGrantUnit(unit)
	if amount < 1 {
		amount = 1
	}
	if max := maxGrantAmount(unit); amount > max {
		amount = max
	}
	// 🔴 数量与单位必须**一次写两列**。
	// 只写数量的话:一张 grant_unit='month' 的码,管理员在「改时长」里填 7 想改成 7 天,
	// 结果 grant_days=7 而 unit 仍是 month → 实际发 7 个月。这是最容易发生的静默放大。
	if err := s.repo.SetGrantDays(id, amount, unit); err != nil {
		return nil, err
	}
	slog.Info("vip: set redemption code grant duration", "code_id", id, "amount", amount, "unit", unit)
	return s.repo.GetCodeByID(id)
}

// ListCodes 管理员分页查看兑换码。
func (s *Service) ListCodes(f CodeFilter, page, pageSize int) ([]RedemptionCode, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 30
	}
	return s.repo.ListCodes(f, pageSize, (page-1)*pageSize)
}

// ─── 工具 ────────────────────────────────────────────────────────────────

// codeAlphabet 去掉了易混字符(0/O/1/I/L), 方便人工抄写。
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func randomCode(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, n)
	for i := range buf {
		out[i] = codeAlphabet[int(buf[i])%len(codeAlphabet)]
	}
	return string(out), nil
}

// randomGiftCode 生成 XXXX-XXXX-XXXX-XXXX 格式兑换码(4 组 4 位 + 短横, 去歧义字母表)。
// 前端用 4 段输入框录入、按横线拼接;存库即带横线(varchar 32 容得下 19 字符)。
func randomGiftCode() (string, error) {
	raw, err := randomCode(16)
	if err != nil {
		return "", err
	}
	return raw[0:4] + "-" + raw[4:8] + "-" + raw[8:12] + "-" + raw[12:16], nil
}

func normalizeCode(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}
