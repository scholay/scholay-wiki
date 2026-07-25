package vip

import "errors"

// ErrQuotaExceeded —— 当日某功能次数已达上限。调用方用 errors.Is(err, vip.ErrQuotaExceeded) 判别,
// 再决定回前端的 code(6010 / quota_exceeded)+ 升级引导。
var ErrQuotaExceeded = errors.New("vip: daily quota exceeded")

// quotaError 让 err.Error() 是干净的中文友好文案(给用户看), 同时 errors.Is(ErrQuotaExceeded) 成立
// (Unwrap 到 sentinel)—— 不像 fmt.Errorf("...: %w") 会把 sentinel 文案拼进 message。
type quotaError struct{ msg string }

func (e *quotaError) Error() string { return e.msg }
func (e *quotaError) Unwrap() error { return ErrQuotaExceeded }

// NewQuotaError 构造一个「配额超限」错误, msg 是给用户看的友好文案。
func NewQuotaError(msg string) error { return &quotaError{msg: msg} }

// 兑换码相关业务错误(handler 翻成对应 HTTP 文案)。
var (
	ErrCodeNotFound = errors.New("vip: redemption code not found")
	ErrCodeRedeemed = errors.New("vip: redemption code already redeemed") // 旧单次模型遗留, 仍兼容
	ErrCodeExpired  = errors.New("vip: redemption code expired")
	// ErrCodeExhausted 兑换次数已达 max_uses 上限(无人可再兑)。
	ErrCodeExhausted = errors.New("vip: redemption code exhausted")
	// ErrCodeAlreadyRedeemed 当前用户已兑换过此码(每用户每码一次)。
	ErrCodeAlreadyRedeemed = errors.New("vip: redemption code already redeemed by this user")
	// ErrCodeRevoked 管理员已停用此码。
	ErrCodeRevoked = errors.New("vip: redemption code revoked")
	// ErrCodeNotTier 该码不是会员(tier)码,没有会员天数可改(经费码用 credit_validity_days)。
	ErrCodeNotTier = errors.New("vip: redemption code is not a tier code")
)

// ErrUserNotFound —— admin 直授/取消会员时目标用户不存在(UPDATE 影响 0 行)。
// 防止「写了 0 行却返回成功 + 伪造到期时间」掩盖路径里的错 id。
var ErrUserNotFound = errors.New("vip: user not found")

// ErrNoDowngrade —— 不支持降级:在期会员订阅/报价更低档时拒绝。
var ErrNoDowngrade = errors.New("vip: downgrade not supported")

// ErrPendingOrderExists —— 该用户已有一笔未支付的订阅订单。拒绝重复建单:防「先挂低档单 +
// 升档 + 再付旧单」借不降级钳制以低档价拿高档整周期(评审 pricing-math 叠加漏洞)。
var ErrPendingOrderExists = errors.New("vip: pending subscription order exists")
