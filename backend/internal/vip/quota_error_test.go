// ============================================================================
// QuotaError 结构化字段(冻结契约)纯函数单测:
//   - NewQuotaErrorWithDetails:字段可提取 + errors.Is 判定不破 + 文案透传;
//   - Payload 形状:reset_at RFC3339 / 无窗口空串,四字段齐全;
//   - RespondQuotaExceeded:HTTP 6010 信封 {code:6010, data:{quota:{...}}} + 429。
// ============================================================================

package vip

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestNewQuotaErrorWithDetails(t *testing.T) {
	resetAt := time.Date(2026, 8, 3, 14, 30, 0, 0, time.Local)
	d := QuotaDetails{
		ResetAt:               resetAt,
		WindowDays:            7,
		CreditBalancePositive: true,
		CreditAutopay:         false,
	}
	err := NewQuotaErrorWithDetails("本周期 AI 额度已用完。", d)

	// errors.Is 判定不破(全站 handler / spec 都靠它分类)。
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("errors.Is(err, ErrQuotaExceeded) 应成立")
	}
	// 文案透传(用户面直接展示)。
	if err.Error() != "本周期 AI 额度已用完。" {
		t.Fatalf("err.Error() = %q", err.Error())
	}
	// 结构化字段可提取。
	got, ok := QuotaDetailsFrom(err)
	if !ok {
		t.Fatal("QuotaDetailsFrom 应提取到结构化字段")
	}
	if !got.ResetAt.Equal(resetAt) || got.WindowDays != 7 ||
		!got.CreditBalancePositive || got.CreditAutopay {
		t.Fatalf("QuotaDetailsFrom 字段不符: %+v", got)
	}
	// 包一层 %w 后仍可提取(service 层可能再 wrap)。
	wrapped := fmt.Errorf("submit: %w", err)
	if _, ok := QuotaDetailsFrom(wrapped); !ok {
		t.Fatal("经 %w 包装后 QuotaDetailsFrom 应仍能提取")
	}
	if !errors.Is(wrapped, ErrQuotaExceeded) {
		t.Fatal("经 %w 包装后 errors.Is 应仍成立")
	}
}

func TestNewQuotaErrorWithoutDetails(t *testing.T) {
	err := NewQuotaError("额度用完了")
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("errors.Is(err, ErrQuotaExceeded) 应成立")
	}
	if _, ok := QuotaDetailsFrom(err); ok {
		t.Fatal("旧 NewQuotaError 位点不带结构化字段, ok 应为 false")
	}
	// duck-typed 接口在无 details 时返回 nil(agentbridge 侧据此不带 quota 对象)。
	var qe *quotaError
	if !errors.As(err, &qe) {
		t.Fatal("errors.As(*quotaError) 应成立")
	}
	if qe.QuotaFramePayload() != nil {
		t.Fatal("无 details 时 QuotaFramePayload 应返回 nil")
	}
}

func TestQuotaDetailsPayload(t *testing.T) {
	resetAt := time.Date(2026, 8, 3, 14, 30, 0, 0, time.Local)
	p := QuotaDetails{ResetAt: resetAt, WindowDays: 7, CreditBalancePositive: true, CreditAutopay: true}.Payload()
	if p["reset_at"] != resetAt.Format(time.RFC3339) {
		t.Fatalf("reset_at = %v, want RFC3339 %q", p["reset_at"], resetAt.Format(time.RFC3339))
	}
	if p["window_days"] != 7 || p["credit_balance_positive"] != true || p["credit_autopay"] != true {
		t.Fatalf("payload 字段不符: %+v", p)
	}

	// 无窗口(未开窗):reset_at 必须是空串(冻结契约),不是零值时间串。
	p0 := QuotaDetails{WindowDays: 7}.Payload()
	if p0["reset_at"] != "" {
		t.Fatalf("无窗口时 reset_at 应为空串, got %v", p0["reset_at"])
	}
}

func TestRespondQuotaExceeded(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("带结构化字段", func(t *testing.T) {
		resetAt := time.Date(2026, 8, 3, 14, 30, 0, 0, time.Local)
		err := NewQuotaErrorWithDetails("本周期 AI 额度已用完。",
			QuotaDetails{ResetAt: resetAt, WindowDays: 7, CreditBalancePositive: true, CreditAutopay: false})

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/x", nil)
		RespondQuotaExceeded(c, err)

		if w.Code != 429 {
			t.Fatalf("HTTP 状态 = %d, want 429", w.Code)
		}
		var body struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
			Data    struct {
				Quota struct {
					ResetAt               string `json:"reset_at"`
					WindowDays            int    `json:"window_days"`
					CreditBalancePositive bool   `json:"credit_balance_positive"`
					CreditAutopay         bool   `json:"credit_autopay"`
				} `json:"quota"`
			} `json:"data"`
		}
		if uerr := json.Unmarshal(w.Body.Bytes(), &body); uerr != nil {
			t.Fatalf("响应不是合法 JSON: %v", uerr)
		}
		if body.Code != 6010 {
			t.Fatalf("code = %d, want 6010", body.Code)
		}
		if body.Message != "本周期 AI 额度已用完。" {
			t.Fatalf("message = %q", body.Message)
		}
		q := body.Data.Quota
		if q.ResetAt != resetAt.Format(time.RFC3339) || q.WindowDays != 7 ||
			!q.CreditBalancePositive || q.CreditAutopay {
			t.Fatalf("data.quota 不符: %+v", q)
		}
	})

	t.Run("无结构化字段降级", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/x", nil)
		RespondQuotaExceeded(c, NewQuotaError("额度用完了"))

		if w.Code != 429 {
			t.Fatalf("HTTP 状态 = %d, want 429", w.Code)
		}
		var body struct {
			Code int            `json:"code"`
			Data map[string]any `json:"data"`
		}
		if uerr := json.Unmarshal(w.Body.Bytes(), &body); uerr != nil {
			t.Fatalf("响应不是合法 JSON: %v", uerr)
		}
		if body.Code != 6010 {
			t.Fatalf("code = %d, want 6010", body.Code)
		}
		if body.Data != nil {
			t.Fatalf("无结构化字段时不应带 data, got %+v", body.Data)
		}
	})
}
