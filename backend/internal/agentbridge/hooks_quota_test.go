// ============================================================================
// NewQuotaErrorFrom / quotaFramePayload 纯函数单测(冻结契约 WS 侧):
//   - 保链:errors.Is(err, ErrQuotaExceeded) 成立,且 errors.As 能沿链找到 cause;
//   - duck-typed 提取:cause 实现 QuotaFramePayload → 帧上带 quota 对象;
//   - 纯文案(NewQuotaError)/ nil payload → 不带 quota(前端兼容缺失)。
// vip 侧真实实现见 internal/vip/errors.go 的 (*quotaError).QuotaFramePayload;
// 这里用 fake 避免 agentbridge 反向 import vip。
// ============================================================================

package agentbridge

import (
	"errors"
	"testing"
)

type fakeQuotaCause struct{ payload map[string]any }

func (e *fakeQuotaCause) Error() string                     { return "本周期 AI 额度已用完。" }
func (e *fakeQuotaCause) QuotaFramePayload() map[string]any { return e.payload }

func TestNewQuotaErrorFromPreservesChain(t *testing.T) {
	cause := &fakeQuotaCause{payload: map[string]any{
		"reset_at":                "2026-08-03T14:30:00+08:00",
		"window_days":             7,
		"credit_balance_positive": true,
		"credit_autopay":          false,
	}}
	err := NewQuotaErrorFrom(cause)

	// sentinel 分类不破(classifyPreUserMessageError → quota_exceeded / retryable=false)。
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("errors.Is(err, ErrQuotaExceeded) 应成立")
	}
	// 文案取 cause.Error()(preUserMessageUserText 原样透出)。
	if err.Error() != "本周期 AI 额度已用完。" {
		t.Fatalf("err.Error() = %q", err.Error())
	}
	// cause 保留在链上,quota 对象可提取。
	p, ok := quotaFramePayload(err)
	if !ok {
		t.Fatal("quotaFramePayload 应提取到 quota 对象")
	}
	if p["reset_at"] != "2026-08-03T14:30:00+08:00" || p["window_days"] != 7 ||
		p["credit_balance_positive"] != true || p["credit_autopay"] != false {
		t.Fatalf("quota 对象不符: %+v", p)
	}
}

func TestQuotaFramePayloadAbsent(t *testing.T) {
	// 纯文案构造(无 cause)→ 帧上不带 quota。
	if _, ok := quotaFramePayload(NewQuotaError("额度用完了")); ok {
		t.Fatal("NewQuotaError 纯文案不应带 quota 对象")
	}
	// cause 实现接口但 payload 为 nil(vip 侧无 details)→ 同样不带。
	if _, ok := quotaFramePayload(NewQuotaErrorFrom(&fakeQuotaCause{payload: nil})); ok {
		t.Fatal("payload=nil 不应带 quota 对象")
	}
	// 非 quota 错误。
	if _, ok := quotaFramePayload(errors.New("boom")); ok {
		t.Fatal("非 quota 错误不应带 quota 对象")
	}
	// NewQuotaError 仍是 quota 分类。
	if !errors.Is(NewQuotaError("x"), ErrQuotaExceeded) {
		t.Fatal("NewQuotaError 的 errors.Is 判定不应被多路 Unwrap 改坏")
	}
}
