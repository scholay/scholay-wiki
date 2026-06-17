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
	"log/slog"
	"strings"
	"time"

	"gorm.io/gorm"
)

type Service struct {
	repo     *Repository
	cfg      *ConfigService
	wallet   *WalletService
	order    *OrderService
	msg      MessageSender       // 站内信(bootstrap 注入, 可 nil)
	emailCfg EmailConfigProvider // 邮件配置(bootstrap 注入, 可 nil)
	payNotify func(*Order)       // 付费成功外部通知(飞书等;bootstrap 注入, 可 nil)
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
	return s
}

// Config / Wallet / Order 暴露给 handler / 支付回调。
func (s *Service) Config() *ConfigService { return s.cfg }
func (s *Service) Wallet() *WalletService { return s.wallet }
func (s *Service) Order() *OrderService   { return s.order }

// PaymentMethods 返回当前可用的支付渠道(按 admin 配置表里有无 is_active 配置决定)。
// 充值前端据此决定显示哪些支付方式(再叠加 dev 的测试支付)。
func (s *Service) PaymentMethods() (alipay bool, wechat bool) {
	var a, w int64
	s.repo.DB().Table("alipay_configs").Where("is_active = ?", true).Count(&a)
	s.repo.DB().Table("wechat_pay_configs").Where("is_active = ?", true).Count(&w)
	return a > 0, w > 0
}

// SubQuote 订阅报价(给前端弹窗显示动作 + 应付金额 + 经费)。
type SubQuote struct {
	Action        string `json:"action"`       // new | renew | upgrade
	Tier          string `json:"tier"`
	AmountCents   int    `json:"amount_cents"` // 本次应付(分)
	Credits       int    `json:"credits"`      // 本单赠送经费
	Deferred      bool   `json:"deferred"`     // 经费延后生效(续期=true)
	CurrentTier   string `json:"current_tier"` // 用户当前生效档
	RemainingDays int    `json:"remaining_days"`
}

// QuoteSubscription 给前端算「订阅/续期/升级」的动作与应付金额(不建单)。降级回 ErrNoDowngrade。
func (s *Service) QuoteSubscription(userID uint, target string) (*SubQuote, error) {
	now := time.Now()
	uv, _ := s.repo.GetUserVIP(userID)
	sp, err := computeSubscription(uv, target, s.cfg.Get(), now)
	if err != nil {
		return nil, err
	}
	return &SubQuote{
		Action: sp.Action, Tier: sp.Tier, AmountCents: sp.AmountCents, Credits: sp.Credits,
		Deferred: sp.Deferred, CurrentTier: effectiveTier(uv, now), RemainingDays: sp.RemainingDays,
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

// applyMembershipGrant —— 单调地把「授予 grantTier 续 days 天」叠加到当前会员状态上(纯函数)。
// 规则:① 绝不降级(取当前生效等级与 grantTier 中更高的);② 绝不截断(在期则从现到期日顺延)。
// 返回(新等级, 新到期)。被 兑换码 / admin 直授 / 订阅开通 复用。
func applyMembershipGrant(cur UserVIP, grantTier string, days int, now time.Time) (string, time.Time) {
	curTier := effectiveTier(cur, now)
	base := now
	if isPaidTier(curTier) && cur.VIPExpiresAt != nil && cur.VIPExpiresAt.After(now) {
		base = *cur.VIPExpiresAt
	}
	newTier := grantTier
	if tierRank(curTier) > tierRank(grantTier) {
		newTier = curTier // 不降级
	}
	return newTier, base.AddDate(0, 0, days)
}

// ─── 兑换 / 发码 ─────────────────────────────────────────────────────────

// RedeemResult 兑换成功返回(tier 码:返回等级 + 到期;credit 码:返回到账经费)。
type RedeemResult struct {
	Kind      string     `json:"kind"`                 // tier | credit
	Tier      string     `json:"tier,omitempty"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	Credits   int        `json:"credits,omitempty"`
	CreditKind string    `json:"credit_kind,omitempty"` // temp | perm
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
	s.notifyRedeem(userID, res)
	return res, nil
}

// CodePreview 兑换前预览(给确认弹窗):码有效时返回将授予的内容;无效则方法返回 error
// (handler 翻成「无效/过期/已用完/已兑换过」等失败态)。
type CodePreview struct {
	GrantKind    string     `json:"grant_kind"` // tier | credit
	GrantTier    string     `json:"grant_tier,omitempty"`
	GrantDays    int        `json:"grant_days,omitempty"`
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
		GrantKind: rc.GrantKind, GrantTier: rc.GrantTier, GrantDays: rc.GrantDays,
		GrantCredits: rc.GrantCredits, CreditKind: rc.CreditKind,
		Note: rc.Note, ValidUntil: rc.ValidUntil, UsesLeft: maxUses - rc.UsedCount,
	}, nil
}

// GenerateCodes 管理员批量生成兑换码(tier 码:发会员;credit 码:发经费), 返回生成的码字符串。
func (s *Service) GenerateCodes(in GenerateCodesInput, createdBy *uint) ([]string, error) {
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
	if grantDays <= 0 {
		grantDays = 30
	}
	creditKind := in.CreditKind
	if creditKind != CreditKindPerm {
		creditKind = CreditKindTemp
	}
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
			Code: c, GrantKind: kind, GrantTier: tier, GrantDays: grantDays,
			GrantCredits: in.GrantCredits, CreditKind: creditKind, CreditValidityDays: creditValidity,
			MaxUses: maxUses, ValidUntil: &vu, Note: in.Note, CreatedBy: createdBy,
		})
	}
	if err := s.repo.CreateCodes(codes); err != nil {
		return nil, err
	}
	slog.Info("vip: generated redemption codes", "count", len(out), "kind", kind, "tier", tier)
	return out, nil
}

// GenerateCodesInput admin 发码入参。
type GenerateCodesInput struct {
	Count              int
	GrantKind          string // tier | credit
	Tier               string // tier 码:pro|max
	GrantDays          int
	GrantCredits       int    // credit 码:经费数
	CreditKind         string // credit 码:temp|perm
	CreditValidityDays int    // credit 码 temp 时有效天数
	MaxUses            int    // 可兑换总次数(默认 1, 最多 100)
	ValidDays          int    // 码有效期窗口天数(默认 7, 最长 30);valid_until = now + ValidDays
	Note               string
}

// GrantToUser 管理员**直接**授予/续期会员(不走兑换码)。单调:不降级 + 在期顺延。返回新到期。
func (s *Service) GrantToUser(userID uint, tier string, days int) (time.Time, error) {
	if tier != TierPro && tier != TierMax {
		tier = TierPro
	}
	if days <= 0 {
		days = 30
	}
	uv, _ := s.repo.GetUserVIP(userID)
	newTier, exp := applyMembershipGrant(uv, tier, days, time.Now())
	if err := s.repo.SetUserVIP(userID, newTier, &exp); err != nil {
		return time.Time{}, err
	}
	slog.Info("vip: admin granted membership", "user_id", userID, "tier", newTier, "days", days)
	return exp, nil
}

// RevokeUser 管理员取消某用户会员(危险动作):会员立即过期(回 free + 清到期)
// + 清零订阅赠送的临时经费(随会员的那部分),其他来源临时经费 + 永久经费不动。整体一个事务。
func (s *Service) RevokeUser(userID uint) error {
	err := s.repo.DB().Transaction(func(tx *gorm.DB) error {
		// 1. 会员过期:tier=free, 清到期。rows=0 时显式查存在性(free→free 是合法 no-op)。
		res := tx.Table("users").Where("id = ?", userID).
			Updates(map[string]any{"vip_tier": TierFree, "vip_expires_at": nil})
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
		// 2. 清零订阅赠送的临时经费(其他经费保留)。
		return revokeSubscriptionCreditsInTx(tx, userID)
	})
	if err == nil {
		slog.Info("vip: admin revoked membership + zeroed subscription credits", "user_id", userID)
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
