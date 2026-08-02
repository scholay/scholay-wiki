package vip

import (
	"errors"
	"time"
)

// ErrQuotaExceeded —— 当日某功能次数已达上限。调用方用 errors.Is(err, vip.ErrQuotaExceeded) 判别,
// 再决定回前端的 code(6010 / quota_exceeded)+ 升级引导。
var ErrQuotaExceeded = errors.New("vip: daily quota exceeded")

// QuotaDetails —— 额度耗尽时随错误携带的结构化字段(冻结契约,前后端共同遵守):
// HTTP 6010 信封的 data.quota 与 WS error 帧的 quota 同形,前端 QuotaNotifier 据此
// 渲染「等待自动重置 / 重置次数 / 升级 / 用经费继续」的引导。
// reset_passes 刻意不进载荷(热路径不查 DB 的既有拍板),弹窗仍从 /user/billing/overview 拿。
type QuotaDetails struct {
	ResetAt               time.Time // 窗口自动重置时刻;零值 = 无窗口(未开窗)
	WindowDays            int       // 周期长度(天)
	CreditBalancePositive bool      // 经费余额 > 0(payAsYouGoOrQuotaError 已读到的 Balance 顺手带出)
	CreditAutopay         bool      // 「用经费继续」开关状态
}

// Payload 输出冻结契约的 JSON 形状:
// {reset_at:"<RFC3339,无窗口时空串>", window_days:<int>, credit_balance_positive:<bool>, credit_autopay:<bool>}
func (d QuotaDetails) Payload() map[string]any {
	resetAt := ""
	if !d.ResetAt.IsZero() {
		resetAt = d.ResetAt.Format(time.RFC3339)
	}
	return map[string]any{
		"reset_at":                resetAt,
		"window_days":             d.WindowDays,
		"credit_balance_positive": d.CreditBalancePositive,
		"credit_autopay":          d.CreditAutopay,
	}
}

// quotaError 让 err.Error() 是干净的中文友好文案(给用户看), 同时 errors.Is(ErrQuotaExceeded) 成立
// (Unwrap 到 sentinel)—— 不像 fmt.Errorf("...: %w") 会把 sentinel 文案拼进 message。
// details 可选:payAsYouGoOrQuotaError 经 NewQuotaErrorWithDetails 填结构化字段;
// 旧 NewQuotaError 位点不带(nil),出口侧按「无 quota 对象」降级,前端兼容缺失。
type quotaError struct {
	msg     string
	details *QuotaDetails
}

func (e *quotaError) Error() string { return e.msg }
func (e *quotaError) Unwrap() error { return ErrQuotaExceeded }

// QuotaFramePayload 供 agentbridge 侧 duck-typed 提取(interface{ QuotaFramePayload() map[string]any }),
// 避免 agentbridge 反向 import vip。无结构化字段时返回 nil(调用方跳过、帧上不带 quota)。
func (e *quotaError) QuotaFramePayload() map[string]any {
	if e.details == nil {
		return nil
	}
	return e.details.Payload()
}

// NewQuotaError 构造一个「配额超限」错误, msg 是给用户看的友好文案。
func NewQuotaError(msg string) error { return &quotaError{msg: msg} }

// NewQuotaErrorWithDetails 同 NewQuotaError,并携带结构化配额字段(冻结契约载荷来源)。
func NewQuotaErrorWithDetails(msg string, d QuotaDetails) error {
	return &quotaError{msg: msg, details: &d}
}

// QuotaDetailsFrom 从 error 链提取结构化配额字段。ok=false = 该错误不带结构化字段
// (非 quota 错误,或旧 NewQuotaError 位点构造)。
func QuotaDetailsFrom(err error) (QuotaDetails, bool) {
	var qe *quotaError
	if errors.As(err, &qe) && qe.details != nil {
		return *qe.details, true
	}
	return QuotaDetails{}, false
}

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
