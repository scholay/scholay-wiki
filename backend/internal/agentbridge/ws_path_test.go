// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import "testing"

// TestPathWithinWorkAlias —— 2026-07 审查([0]/[17]/[20])要求把 /work 别名的性质显式化:
// 它是「/work 整片按前缀重写到本会话 workDir」的等价映射,**不是**对 /work/** 的无条件放行。
// 执行器侧同语义的入站翻译在 agent/src/sandbox/confine.ts(见 confine.test.ts),两侧必须同改。
func TestPathWithinWorkAlias(t *testing.T) {
	const root = "/home/bun/sessions/sess-a"
	cases := []struct {
		name string
		p    string
		want bool
	}{
		{"沙箱别名根", "/work", true},
		{"沙箱别名子路径", "/work/out/report.md", true},
		// 关键性质:/work/<别人的 sessionId>/x 之所以为 true,是因为它被**重写进本会话目录**
		// (→ /home/bun/sessions/sess-a/home/bun/sessions/sess-b/x),不是放行了别人的目录。
		{"别名整片映射进本会话目录(非放行别人目录)", "/work/home/bun/sessions/sess-b/x", true},
		{"别名不能借 .. 逃逸", "/work/../etc/passwd", false},
		{"别名子路径 .. 逃逸", "/work/out/../../../etc/passwd", false},
		{"前缀相近的另一目录不误命中", "/workspace/x", false},
		{"真实会话目录", root + "/out/a.md", true},
		{"其它会话真实目录", "/home/bun/sessions/sess-b/x", false},
		{"任意系统路径", "/etc/passwd", false},
		{"相对路径", "out/a.md", true},
		{"相对路径逃逸", "../sess-b/x", false},
	}
	for _, c := range cases {
		if got := pathWithin(c.p, root); got != c.want {
			t.Errorf("%s: pathWithin(%q, %q) = %v, want %v", c.name, c.p, root, got, c.want)
		}
	}

	// workDir 自身落在 /work 子树时不做翻译(否则双重前缀);与 confine.ts 的同款守卫对齐。
	if pathWithin("/work/sess-b/x", "/work/sess-a") {
		t.Error("workDir 在 /work 子树内时不应再做别名翻译")
	}
	if !pathWithin("/work/sess-a/x", "/work/sess-a") {
		t.Error("workDir 在 /work 子树内时,真实前缀路径仍应放行")
	}

	// 没有 workdir 信息时保守拒绝(别名不得让空 workDir 变成放行)。
	if pathWithin("/work/out/a.md", "") {
		t.Error("workDir 为空时应一律拒绝")
	}
}
