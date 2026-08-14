package user

import (
	"context"
	"os"
	"strings"
	"testing"

	"scholar-backend/internal/common/middleware"
)

func TestOAuthStatePayloadCarriesNormalizedInviteCandidate(t *testing.T) {
	ctx := middleware.ContextWithInviteCode(context.Background(), " ab0ol2 ")
	payload := encodeOAuthStatePayload(ctx)
	restored, ok := restoreOAuthStatePayload(context.Background(), payload)
	if !ok {
		t.Fatal("generated state payload should restore")
	}
	if got := middleware.InviteCodeFromContext(restored); got != "AB0OL2" {
		t.Fatalf("restored invite code=%q want AB0OL2", got)
	}
}

// 安全回归(2026-08-12):Apple 回调**绝不**再把 48h JWT 放进 302 的 URL ——
// 它会落进 nginx access log 且可重放。改成一次性短 code(login_code)换 token。
// 源码级钉死:AppleCallback 的重定向只带 login_code,不带 token=;换 token 走
// AppleExchangeCode(POST /user/apple/exchange)。
func TestAppleCallbackDoesNotLeakJWTIntoURL(t *testing.T) {
	src, err := os.ReadFile("apple_oauth.go")
	if err != nil {
		t.Fatal(err)
	}
	code := string(src)
	// 登录成功分支必须走一次性 code(存 Redis)+ 只带 login_code 的重定向。
	if !strings.Contains(code, "SaveOAuthLoginCode") {
		t.Error("Apple 登录必须用一次性 login code(SaveOAuthLoginCode),不能把 JWT 放进 URL")
	}
	if !strings.Contains(code, "/apple/callback?login_code=") {
		t.Error("Apple 回调重定向必须只带 login_code")
	}
	if !strings.Contains(code, "func (h *Handler) AppleExchangeCode") {
		t.Error("必须提供 code→token 交换端点 AppleExchangeCode")
	}
	// 反向:登录结果 URL 不得再拼 token= 参数(合并流的 merge_token= 是另一回事,允许)。
	if strings.Contains(code, "/apple/callback?token=") {
		t.Error("Apple 回调 URL 不得再携带 JWT(token=)—— 会落进 nginx log 可重放")
	}
}

func TestOAuthStatePayloadLegacyInvalidAndNoCandidate(t *testing.T) {
	if got := encodeOAuthStatePayload(context.Background()); got != "1" {
		t.Fatalf("empty state payload=%q want legacy-compatible 1", got)
	}
	if _, ok := restoreOAuthStatePayload(context.Background(), "1"); !ok {
		t.Fatal("legacy in-flight state must remain valid")
	}
	if _, ok := restoreOAuthStatePayload(context.Background(), "not-json"); ok {
		t.Fatal("tampered state payload must be rejected")
	}
}
