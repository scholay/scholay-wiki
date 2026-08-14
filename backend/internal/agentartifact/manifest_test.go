// manifest.json 解析的单一真源测试(2026-08-07 A9 从 internal/claw 提升而来)。
//
// 提升的理由不是复用,是**防漂移**:此前这段逻辑只有 claw 有,
// statlab / scidraw / boltslides 三份镜像既不读 manifest、也不把 manifest.json
// 排除出产物列表 —— 而生产 97.7% 的产物在 stat_lab。

package agentartifact

import (
	"fmt"
	"strings"
	"testing"
)

func TestIsManifest(t *testing.T) {
	if !IsManifest("manifest.json") {
		t.Error("manifest.json 必须被识别为清单 —— 漏了它会作为一张卡片出现在用户的产物列表里")
	}
	for _, n := range []string{"review.md", "manifest.json.bak", "Manifest.json", ""} {
		if IsManifest(n) {
			t.Errorf("IsManifest(%q) = true, want false", n)
		}
	}
}

func TestParseManifest(t *testing.T) {
	t.Run("valid multi", func(t *testing.T) {
		m := ParseManifest([]byte(`{"artifacts":[
			{"file":"review.md","title":"锂电池综述","description":"近三年对比"},
			{"file":"data.csv","title":"清洗后数据"}
		]}`))
		if m == nil {
			t.Fatal("expected non-nil map")
		}
		if got := m["review.md"]; got.Title != "锂电池综述" || got.Description != "近三年对比" {
			t.Errorf("review.md meta wrong: %+v", got)
		}
		if got := m["data.csv"]; got.Title != "清洗后数据" || got.Description != "" {
			t.Errorf("data.csv meta wrong: %+v", got)
		}
	})

	t.Run("basename sanitized", func(t *testing.T) {
		m := ParseManifest([]byte(`{"artifacts":[{"file":"../secret/x.md","title":"X"}]}`))
		if _, ok := m["x.md"]; !ok {
			t.Errorf("manifest file should be reduced to basename x.md, got %+v", m)
		}
	})

	t.Run("empty-file entry skipped", func(t *testing.T) {
		m := ParseManifest([]byte(`{"artifacts":[{"file":"","title":"x"},{"file":"a.md"}]}`))
		if len(m) != 1 {
			t.Errorf("entry with empty file must be skipped, got %+v", m)
		}
	})

	t.Run("nil cases", func(t *testing.T) {
		for _, in := range []string{"", "   ", "not json", `{"artifacts":[]}`, `{}`, `{"artifacts":null}`} {
			if got := ParseManifest([]byte(in)); got != nil {
				t.Errorf("ParseManifest(%q) = %+v; want nil", in, got)
			}
		}
	})
}

func TestParseManifestExtra(t *testing.T) {
	// 重复 file: map 后写者胜 (last-wins)
	m := ParseManifest([]byte(`{"artifacts":[{"file":"a.md","title":"first"},{"file":"a.md","title":"second"}]}`))
	if m["a.md"].Title != "second" {
		t.Errorf("duplicate file should be last-wins, got %+v", m["a.md"])
	}
	// 子目录 file → basename
	m2 := ParseManifest([]byte(`{"artifacts":[{"file":"sub/dir/report.md","title":"T"}]}`))
	if _, ok := m2["report.md"]; !ok {
		t.Errorf("subdir file should reduce to basename, got %+v", m2)
	}
	// 大数组不截断
	var b strings.Builder
	b.WriteString(`{"artifacts":[`)
	for i := 0; i < 500; i++ {
		if i > 0 {
			b.WriteString(",")
		}
		fmt.Fprintf(&b, `{"file":"f%d.md","title":"t%d"}`, i, i)
	}
	b.WriteString(`]}`)
	if got := ParseManifest([]byte(b.String())); len(got) != 500 {
		t.Errorf("large manifest should keep all entries, got %d", len(got))
	}
}
