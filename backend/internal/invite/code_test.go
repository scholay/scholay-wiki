// ============================================================================
// 邀请码纯函数测试:格式 / 字符集 / 归一化。不碰 DB。
// ============================================================================

package invite

import (
	"strings"
	"testing"
)

// TestCodeAlphabetExcludesAmbiguous 字符集必须是大写去易混(0/O/1/I/L)。
// 这是产品口径:码要能口头转述/人工抄写,易混字符一个都不能混进来。
func TestCodeAlphabetExcludesAmbiguous(t *testing.T) {
	for _, ch := range "0O1IL" {
		if strings.ContainsRune(codeAlphabet, ch) {
			t.Errorf("codeAlphabet 不应包含易混字符 %q", ch)
		}
	}
	if codeAlphabet != strings.ToUpper(codeAlphabet) {
		t.Error("codeAlphabet 必须全大写")
	}
	// 26 字母 + 10 数字 - 5 易混 = 31
	if len(codeAlphabet) != 31 {
		t.Errorf("codeAlphabet 长度应为 31,实际 %d", len(codeAlphabet))
	}
}

// TestGenerateCodeFormat 生成的码:定长 8、只含字符集内字符、能通过自身格式校验。
func TestGenerateCodeFormat(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 500; i++ {
		code := generateCode()
		if len(code) != codeLen {
			t.Fatalf("码长应为 %d,实际 %q(len=%d)", codeLen, code, len(code))
		}
		for _, ch := range code {
			if !strings.ContainsRune(codeAlphabet, ch) {
				t.Fatalf("码 %q 含字符集外字符 %q", code, ch)
			}
		}
		if !isValidCodeFormat(code) {
			t.Fatalf("自产码 %q 未通过 isValidCodeFormat", code)
		}
		seen[code] = true
	}
	// 500 个码全撞车概率天文数字级 —— 若真发生说明随机源坏了。
	if len(seen) < 490 {
		t.Errorf("500 个随机码只有 %d 个不同,随机性可疑", len(seen))
	}
}

// TestNormalizeCode 大小写/空白归一。
func TestNormalizeCode(t *testing.T) {
	cases := map[string]string{
		"  abcd2345 ": "ABCD2345",
		"AbCd2345":    "ABCD2345",
		"":            "",
		"  ":          "",
	}
	for in, want := range cases {
		if got := normalizeCode(in); got != want {
			t.Errorf("normalizeCode(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestIsValidCodeFormat 边界:长度不对 / 易混字符 / 小写 / 空串一律拒绝。
func TestIsValidCodeFormat(t *testing.T) {
	invalid := []string{
		"",          // 空
		"ABC",       // 太短
		"ABCD23456", // 太长
		"ABCD234O",  // 含 O(易混,字符集外)
		"ABCD2340",  // 含 0
		"abcd2345",  // 小写(未归一化)
		"ABCD 234",  // 空格
	}
	for _, s := range invalid {
		if isValidCodeFormat(s) {
			t.Errorf("isValidCodeFormat(%q) 应为 false", s)
		}
	}
	if !isValidCodeFormat("ABCD2345") {
		t.Error(`isValidCodeFormat("ABCD2345") 应为 true`)
	}
	for _, legacy := range []string{"AB0OL2", "000000", "OIL123"} {
		if !isValidCodeFormat(legacy) {
			t.Errorf("6 位历史码 %q 应允许完整 [A-Z0-9]", legacy)
		}
	}
}

// TestMaskIdentity 守住「被邀请人身份必须后端脱敏」的口径:
// 邮箱保留前 1-2 位 + 域名;用户名保留首字符(按 rune,中文不切碎);都空回占位。
func TestMaskIdentity(t *testing.T) {
	cases := []struct {
		email, name, want string
	}{
		{"alice@gmail.com", "", "al***@gmail.com"},
		{"ab@ex.com", "", "a***@ex.com"},
		{"a@ex.com", "", "a***@ex.com"},
		{"", "张三丰", "张**"},
		{"", "bob", "b**"},
		{"", "", "用户***"},
		{"  ", "  ", "用户***"},
		{"noatsign", "李四", "李**"},        // 无 @ 的脏邮箱回落用户名
		{"张三@qq.com", "", "张***@qq.com"}, // 中文 local part 按 rune 截
	}
	for _, c := range cases {
		if got := maskIdentity(c.email, c.name); got != c.want {
			t.Errorf("maskIdentity(%q,%q)=%q want %q", c.email, c.name, got, c.want)
		}
	}
}
