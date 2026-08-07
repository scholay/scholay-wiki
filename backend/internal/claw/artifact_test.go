// ============================================================================
// Scholay 智能助手 (Claw) — 成果交付 单元测试
//
// 覆盖两块纯逻辑(不依赖 agent/DB,确定性可重复):
//   1. artifactRelPath —— 安全命门: 只放行 out/<basename>, 拦截 ../ 穿越 / 绝对路径 /
//      读 cwd 根 / 读别的目录 / 嵌套子目录。回归一旦失守 = 任意文件读取漏洞。
//   (manifest 解析的测试已随实现提升到 internal/agentartifact —— 四个 feature 共用一份,
//    见 agentartifact/manifest_test.go。留在这里等于给每个镜像各写一遍。)
// ============================================================================

package claw

import "testing"

func TestArtifactRelPath(t *testing.T) {
	cases := []struct {
		name     string
		in       string
		wantRel  string
		wantName string
	}{
		// 合法
		{"valid md", "out/review.md", "out/review.md", "review.md"},
		{"valid csv", "out/data.csv", "out/data.csv", "data.csv"},
		{"chinese with space", "out/锂电池 综述.md", "out/锂电池 综述.md", "锂电池 综述.md"},
		{"leading/trailing space trimmed", "  out/x.md  ", "out/x.md", "x.md"},
		// 非法 —— 安全相关, 必须全部拒绝 (返回空)
		{"empty", "", "", ""},
		{"root file (not in out/)", "review.md", "", ""},
		{"other dir", "tmp/x.md", "", ""},
		{"nested subdir", "out/sub/x.md", "", ""},
		{"traversal via out", "out/../etc/passwd", "", ""},
		{"traversal deep", "../../etc/passwd", "", ""},
		{"traversal mixed", "out/../../secret.key", "", ""},
		{"absolute path", "/etc/passwd", "", ""},
		{"out dir itself", "out", "", ""},
		{"out slash", "out/", "", ""},
		{"out dot", "out/.", "", ""},
		{"out dotdot", "out/..", "", ""},
		{"just dotdot", "..", "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rel, name := artifactRelPath(c.in)
			if rel != c.wantRel || name != c.wantName {
				t.Errorf("artifactRelPath(%q) = (%q, %q); want (%q, %q)", c.in, rel, name, c.wantRel, c.wantName)
			}
		})
	}
}

func TestArtifactRelPathExtra(t *testing.T) {
	cases := []struct{ in, wantRel, wantName string }{
		{"out//x.md", "out/x.md", "x.md"},         // 双斜杠经 path.Clean 归一
		{"OUT/x.md", "", ""},                      // 目录名大小写敏感, OUT != out
		{"out/.hidden", "out/.hidden", ".hidden"}, // dotfile 在 relPath 层放行 (过滤在 list 层)
		{"out/x.md.", "out/x.md.", "x.md."},       // 结尾点是合法 basename
		{"out/CON", "out/CON", "CON"},             // 本平台 CON 只是普通 basename
		{"out/数据📊.csv", "out/数据📊.csv", "数据📊.csv"}, // emoji + unicode
		{"out/a/b/c.md", "", ""},                  // 嵌套子目录不允许
		{"out/../../secret.key", "", ""},          // 穿越
	}
	for _, c := range cases {
		rel, name := artifactRelPath(c.in)
		if rel != c.wantRel || name != c.wantName {
			t.Errorf("artifactRelPath(%q) = (%q, %q); want (%q, %q)", c.in, rel, name, c.wantRel, c.wantName)
		}
	}
}

func TestShouldListArtifact(t *testing.T) {
	cases := []struct {
		name  string
		isDir bool
		want  bool
	}{
		{"review.md", false, true},
		{"data.csv", false, true},
		{"manifest.json", false, false},    // 清单本身不列
		{"manifest.json.bak", false, true}, // 仅精确匹配 manifest.json
		{".hidden", false, false},
		{"..weird", false, false}, // .开头
		{"sub", true, false},      // 目录
		{"", false, false},        // 空名
	}
	for _, c := range cases {
		if got := shouldListArtifact(c.name, c.isDir); got != c.want {
			t.Errorf("shouldListArtifact(%q, dir=%v) = %v; want %v", c.name, c.isDir, got, c.want)
		}
	}
}
