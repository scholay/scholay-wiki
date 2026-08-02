package prism

import (
	"strings"
	"testing"
)

// TestBibEscape 锁定 2026-07 线上审计 #1:bibEscape 从「只删花括号」升级为真 BibTeX 转义
// (线上 project 261:期刊名 "Soil & Tillage Research" 裸 & → "Misplaced alignment tab" 连炸编译)。
func TestBibEscape(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Soil & Tillage Research", `Soil \& Tillage Research`},
		{"100% #1 of $x$ and a_b", `100\% \#1 of \$x\$ and a\_b`},
		// 已转义的不双重转义
		{`A \& B`, `A \& B`},
		{`pre \_escaped \% ok`, `pre \_escaped \% ok`},
		// 成对花括号保留(BibTeX 大小写保护语义)
		{"{DNA} repair in {E. coli}", "{DNA} repair in {E. coli}"},
		// 不配平的花括号剔除(防毒化 .bib 结构)
		{"broken {brace", "broken brace"},
		{"}reversed{", "reversed"},
		// 混合:保留成对花括号的同时转义特殊字符
		{"{TiO2} & H2O", `{TiO2} \& H2O`},
		{"", ""},
	}
	for _, c := range cases {
		if got := bibEscape(c.in); got != c.want {
			t.Errorf("bibEscape(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestSanitizeBibEntry 锁定 agent 手写条目的字段值级清洗:值内裸 & 转义、键行/字段名不动、
// $...$ 数学段原样、已转义不双重转义、幂等。
func TestSanitizeBibEntry(t *testing.T) {
	in := strings.Join([]string{
		"@article{smith_2020,",
		"  title   = {Graphs & $O(n_2)$ bounds},",
		"  journal = {Soil & Tillage Research},",
		"}",
	}, "\n")
	out := sanitizeBibEntry(in)
	if !strings.Contains(out, "smith_2020,") || strings.Contains(out, `smith\_2020`) {
		t.Errorf("键行不应被转义: %q", out)
	}
	if !strings.Contains(out, `Soil \& Tillage Research`) {
		t.Errorf("值内裸 & 应转义: %q", out)
	}
	if !strings.Contains(out, `Graphs \& $O(n_2)$`) {
		t.Errorf("数学段 $O(n_2)$ 内不应转义、段外 & 应转义: %q", out)
	}
	// 幂等:清洗过的再过一遍不变(mergeBibInto 入库 + renderBib 出口都过,绝不能叠加转义)。
	if again := sanitizeBibEntry(out); again != out {
		t.Errorf("sanitizeBibEntry 不幂等:\n1st=%q\n2nd=%q", out, again)
	}
}

// TestSanitizeBibEntry_LoneDollarNoLeak 锁定 2026-07 审查 [11]/[23]:落单的 $(货币/半边公式)
// 不得让数学段泄漏到后续字段 —— 旧实现是整条 entry 的单向 toggle,标题里一个 $ 就让后面所有
// 字段的裸 & / % 不再转义,线上炸编译形态原样复发。
func TestSanitizeBibEntry_LoneDollarNoLeak(t *testing.T) {
	in := strings.Join([]string{
		"@article{k,",
		"  title   = {Cost is $5 per unit},",
		"  journal = {Soil & Tillage Research},",
		"  note    = {A % B},",
		"}",
	}, "\n")
	out := sanitizeBibEntry(in)
	if !strings.Contains(out, `Soil \& Tillage Research`) {
		t.Errorf("落单 $ 之后的字段裸 & 仍必须转义: %q", out)
	}
	if !strings.Contains(out, `A \% B`) {
		t.Errorf("落单 $ 之后的字段裸 %% 仍必须转义: %q", out)
	}
	// 同一字段内也不该失效:落单 $ 按字面处理,其后的 & 照常转义。
	if got := sanitizeBibEntry("@article{k,\n  title = {Cost is $5 & up},\n}"); !strings.Contains(got, `$5 \& up`) {
		t.Errorf("同字段内落单 $ 之后的 & 应转义: %q", got)
	}
	// 配对的 $...$ 仍是数学段:段内不转义。
	if got := sanitizeBibEntry("@article{k,\n  title = {Bound $O(n_2)$ & more},\n}"); !strings.Contains(got, `$O(n_2)$ \& more`) {
		t.Errorf("配对数学段内不转义、段外 & 转义: %q", got)
	}
	if again := sanitizeBibEntry(out); again != out {
		t.Errorf("sanitizeBibEntry 不幂等:\n1st=%q\n2nd=%q", out, again)
	}
}

// TestSanitizeBibEntry_URLFields 锁定 2026-07 审查 [12]:url/doi 等 URL 型字段里的 _ & #
// 是合法字符,转义会写坏链接(且会被 mergeBibInto 回写固化进 struct 真源)。
func TestSanitizeBibEntry_URLFields(t *testing.T) {
	in := strings.Join([]string{
		"@article{k,",
		"  title   = {A & B},",
		"  url     = {https://ex.com/a_b?x=1&y=2#frag},",
		"  doi     = {10.1002/hyp_1234},",
		"  journal = {Soil & Tillage},",
		"}",
	}, "\n")
	out := sanitizeBibEntry(in)
	if !strings.Contains(out, "https://ex.com/a_b?x=1&y=2#frag") {
		t.Errorf("url 字段不应被转义: %q", out)
	}
	if !strings.Contains(out, "10.1002/hyp_1234") {
		t.Errorf("doi 字段不应被转义: %q", out)
	}
	// 非 URL 字段照旧清洗(url 之后的字段不受连坐)。
	if !strings.Contains(out, `A \& B`) || !strings.Contains(out, `Soil \& Tillage`) {
		t.Errorf("普通字段仍应转义裸 &: %q", out)
	}
	// % 仍转义:TeX 里裸 % 会注释掉整行,毒化 .bbl。
	if got := sanitizeBibEntry("@article{k,\n  url = {https://ex.com/a%20b},\n}"); !strings.Contains(got, `a\%20b`) {
		t.Errorf("URL 字段里的 %% 仍应转义: %q", got)
	}
	if again := sanitizeBibEntry(out); again != out {
		t.Errorf("sanitizeBibEntry 不幂等:\n1st=%q\n2nd=%q", out, again)
	}
	// 回写链路(renderBib 铺进 cwd → agent 读回 → mergeBibInto → SaveStructVersion)
	// 不得把 URL 改坏后固化进 struct 真源。
	d := &DocStruct{}
	mergeBibInto(d, renderBib(map[string]string{"k": out}))
	if !strings.Contains(d.Bibliography["k"], "https://ex.com/a_b?x=1&y=2#frag") {
		t.Errorf("回写链路不应改坏 url: %q", d.Bibliography["k"])
	}
	// 库路径:bibEscapeURL 同口径(doi 不再被转义成 10.1002/hyp\_1234)。
	if got := bibEscapeURL("10.1002/hyp_1234&x"); got != "10.1002/hyp_1234&x" {
		t.Errorf("bibEscapeURL 不应转义 _ 与 &: %q", got)
	}
	if got := bibEscapeURL("a%b$c"); got != `a\%b\$c` {
		t.Errorf("bibEscapeURL 仍应转义 %% 与 $: %q", got)
	}
}

// TestNormBibBody_IdempotentCompare 锁定 2026-07 审查 [15]:ApplyStructCite 的「同一篇」比对
// 必须能跨 bibEscape 换代 —— 旧存量花括号被剥、特殊字符未转义,新条目两者相反。
func TestNormBibBody_IdempotentCompare(t *testing.T) {
	// 旧实现产物:花括号被无条件剥掉 + 裸 &
	old := "@article{smith2020,\n  title   = {DNA repair in E. coli},\n  journal = {Soil & Tillage},\n}"
	// 新实现产物:成对花括号保留 + 转义
	cur := `@article{smith2020a,` + "\n" + `  title   = {{DNA} repair in {E. coli}},` + "\n" + `  journal = {Soil \& Tillage},` + "\n}"
	if normBibBody(old) != normBibBody(cur) {
		t.Errorf("换代前后应判为同一篇:\nold=%q\ncur=%q", normBibBody(old), normBibBody(cur))
	}
	// 不同论文仍必须判不同(归一化不能过度抹平)。
	other := "@article{smith2020,\n  title   = {{RNA} repair in {E. coli}},\n  journal = {Soil \\& Tillage},\n}"
	if normBibBody(old) == normBibBody(other) {
		t.Errorf("不同标题不应判为同一篇: %q", normBibBody(other))
	}
}

// TestParseBib_TruncatedHeadRestart 锁定 2026-07 线上审计 #2(线上 project 267):
// 某条只写头 "@article{key," 未闭合 → 旧实现花括号配平一路吞掉下一条,一个 value 装两个
// @article 头毒死整份 bib。修后:行首 @ 判上一条截断,丢弃残条并从新 @ 重启解析。
func TestParseBib_TruncatedHeadRestart(t *testing.T) {
	bib := strings.Join([]string{
		"@article{broken,",
		"@article{good,",
		"  title = {X},",
		"}",
	}, "\n")
	m := parseBib(bib)
	if _, ok := m["broken"]; ok {
		t.Errorf("残条 broken 应被丢弃: %v", m)
	}
	e, ok := m["good"]
	if !ok {
		t.Fatalf("截断后的下一条 good 应正常解析: %v", m)
	}
	if strings.Count(e, "@article{") != 1 {
		t.Errorf("value 里只允许一个 @ 头(旧 bug 会装两个): %q", e)
	}

	// 残条在中间:前后完整条目都不受连坐。
	m2 := parseBib("@article{a, title={A}}\n@article{broken,\n@article{b, title={B}}\n")
	if len(m2) != 2 || m2["a"] == "" || m2["b"] == "" {
		t.Errorf("残条不应连坐前后条目, got %v", m2)
	}
	// 残条在结尾(EOF 截断):安全丢弃、不 panic。
	if m3 := parseBib("@article{tail,\n  title = {T},\n"); len(m3) != 0 {
		t.Errorf("EOF 截断残条应丢弃, got %v", m3)
	}
	// 值内行中 @(邮箱)不误判为新条目头。
	m4 := parseBib("@article{mail,\n  note = {contact x@y.com},\n}\n")
	if e4 := m4["mail"]; !strings.Contains(e4, "x@y.com") {
		t.Errorf("行中 @ 不应触发截断重启, got %v", m4)
	}
}

// TestParseBib_LineStartAtInValue 锁定 2026-07 审查 [10]/[24]:字段值里换行后**行首**的 @
// (多行 note 里的邮箱 / 折行后的 handle)不长得像条目头,不得判上一条截断 ——
// 否则整条合法条目被静默吞掉,且 mergeBibInto 整份替换后引用永久消失。
func TestParseBib_LineStartAtInValue(t *testing.T) {
	m := parseBib(strings.Join([]string{
		"@article{smith2020,",
		"  note  = {contact",
		"@example.com for data},",
		"  title = {Real Paper},",
		"}",
		"",
		"@article{next2021,",
		"  title = {Next},",
		"}",
	}, "\n"))
	if len(m) != 2 || m["smith2020"] == "" || m["next2021"] == "" {
		t.Fatalf("值内行首 @ 不应吞掉合法条目, got %v", m)
	}
	if !strings.Contains(m["smith2020"], "Real Paper") {
		t.Errorf("条目应完整保留: %q", m["smith2020"])
	}
	// 缩进后的行首 @ 同理。
	m2 := parseBib("@article{a,\n  abstract = {We study\n  @home effects},\n}\n@article{b, title={B}}\n")
	if len(m2) != 2 || m2["a"] == "" {
		t.Errorf("缩进行首 @ 不应触发截断, got %v", m2)
	}
	// 真·截断(下一行是条目头)仍照旧丢弃残条。
	if m3 := parseBib("@article{trunc,\n  note = {x\n@article{good, title={G}}\n"); m3["trunc"] != "" || m3["good"] == "" {
		t.Errorf("真截断仍应丢残条、保下一条, got %v", m3)
	}
}

// TestValidBibEntry 锁定入库/出口两侧共用的条目形态校验(单 @ 头 + ^@type{key, 头部)。
func TestValidBibEntry(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"@article{k, title={T}}", true},
		{"@misc{a-b.c:2020, note={x}}", true},
		{"@article{k,\n@article{j, title={T}}", false}, // 双头(线上毒条形态)
		{"junk", false},
		{"@article{k}", false}, // 无字段(缺逗号)
		{"@article{bad key, t={T}}", true},
		{"@article{,}", false},
	}
	for _, c := range cases {
		if got := validBibEntry(c.in); got != c.want {
			t.Errorf("validBibEntry(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

// TestMergeBibInto_DropsPoisonKeepsRest 锁定入库校验:畸形条目丢弃(宁缺一条不毒整份),
// 合格条目过清洗后入库;全部畸形/为空时不清空既有真源。
func TestMergeBibInto_DropsPoisonKeepsRest(t *testing.T) {
	d := &DocStruct{Bibliography: map[string]string{"old": "@article{old, title={O}}"}}
	mergeBibInto(d, strings.Join([]string{
		"@article{broken,", // 未闭合残头(parseBib 层丢弃)
		"@article{ok,",
		"  journal = {Soil & Tillage Research},",
		"}",
	}, "\n"))
	if _, ok := d.Bibliography["broken"]; ok {
		t.Errorf("残条不应入库: %v", d.Bibliography)
	}
	e, ok := d.Bibliography["ok"]
	if !ok {
		t.Fatalf("合格条目应入库: %v", d.Bibliography)
	}
	if !strings.Contains(e, `Soil \& Tillage Research`) {
		t.Errorf("入库条目应过特殊字符清洗: %q", e)
	}
	// 解析结果全空 → 不误清真源(既有守卫回归)。
	d2 := &DocStruct{Bibliography: map[string]string{"keep": "@article{keep, title={K}}"}}
	mergeBibInto(d2, "@article{onlybroken,\n")
	if d2.Bibliography["keep"] == "" {
		t.Errorf("全畸形输入不应清空既有 Bibliography: %v", d2.Bibliography)
	}
}

// TestRenderBib_ExitGuard 锁定出口双保险:历史存量的畸形条目(双 @ 头)不落 .bib;
// 存量未转义条目在出口被清洗自愈(裸 & → \&)。
func TestRenderBib_ExitGuard(t *testing.T) {
	out := renderBib(map[string]string{
		"poison": "@article{poison,\n@article{x, title={T}}",           // 双头毒条 → 跳过
		"legacy": "@article{legacy,\n  journal = {Soil & Tillage},\n}", // 存量未转义 → 自愈
	})
	if strings.Contains(out, "poison") {
		t.Errorf("畸形条目不应落 .bib: %q", out)
	}
	if !strings.Contains(out, `Soil \& Tillage`) {
		t.Errorf("出口应清洗存量裸 &: %q", out)
	}
}
