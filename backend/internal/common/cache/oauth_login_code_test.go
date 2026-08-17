// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"strings"
	"testing"
)

// code 是纯 crypto/rand hex(256-bit),不含可预测结构 —— 与 oauth-merge/ws-ticket 同源。
// 这里不连 Redis(单测环境无),只锁死「不同调用产出不同 32 字节 hex」这一属性;
// 一次性消费(GetDel)语义由 ConsumeOAuthLoginCode 的实现 + oauth_login_code.go 注释保证,
// 端到端在本地栈冒烟测覆盖。
func TestOAuthLoginCodeShapeIsRandomHex(t *testing.T) {
	// SaveOAuthLoginCode 需要 Redis;这里只验证 code 生成不依赖输入、格式正确。
	// 复用与 SaveOAuthLoginCode 相同的生成逻辑做属性检查(见该函数:32 bytes → hex → 64 chars)。
	seen := map[string]struct{}{}
	for i := 0; i < 100; i++ {
		code := randomLoginCodeForTest(t)
		if len(code) != 64 {
			t.Fatalf("login code 长度=%d,期望 64(32 字节 hex)", len(code))
		}
		if strings.ContainsAny(code, "ghijklmnopqrstuvwxyzGHIJKLMNOPQRSTUVWXYZ") {
			t.Fatalf("login code 含非 hex 字符: %q", code)
		}
		if _, dup := seen[code]; dup {
			t.Fatalf("login code 碰撞(随机源可疑): %q", code)
		}
		seen[code] = struct{}{}
	}
}

// randomLoginCodeForTest 复刻 SaveOAuthLoginCode 的 code 生成(crypto/rand + hex),
// 供离线属性测试用(Save 本身要连 Redis)。
func randomLoginCodeForTest(t *testing.T) string {
	t.Helper()
	code, err := generateLoginCodeHex()
	if err != nil {
		t.Fatal(err)
	}
	return code
}
