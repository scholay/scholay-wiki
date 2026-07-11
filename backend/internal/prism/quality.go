// ============================================================================
// Prism 质量回执(Phase 4 · 双轨)—— 在**当前结构体**上算确定性质量信号,供前端展示 + 让用户一键交给 AI 修。
//
// 设计的「双轨 verifier 回执」里可**纯非-LLM 确定性判定**的那部分(结构真源的独有优势):
//   A 轨(rigor/format 硬问题,计入 issue_count):
//     · 悬空文献引用 [@key] —— 正文引了但 references.bib 无此条目(反幻觉的结构级闭合)
//     · 未定义交叉引用 [@fig:x]/[@tbl:x]/[@sec:x]/… —— 引了但没有对应打锚的块(编译会出 ??)
//     · 前置信息缺失 —— 复用 StructConformance(目标模板必填项/超页/溢出)
//   B 轨(craft 软提示,不计入 issue_count,仅供参考):
//     · 超长句数(>40 词/60 字的粗略代理,提示可拆)
//
// 设计的「逐轮自动注入回执」是最高风险项(需 agentbridge 级新 plumbing:现只支持首条消息 in-band),
// 本期改为**用户在环**:前端展示回执 + 「让 AI 修复」把回执作为一条普通指令经既有对话发出(天然是一个
// 配额轮、天然披露)——同样把修订锚在外部确定性信号上,而不新增易碎的每轮注入面(见 REPORT §校验闭环)。
// ============================================================================

package prism

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// QualityReceipt —— 当前结构体的确定性质量回执。
type QualityReceipt struct {
	DanglingCites  []string `json:"dangling_cites"`  // [@key] 无对应 references.bib 条目
	UndefinedXRefs []string `json:"undefined_xrefs"` // [@fig:x] 等无对应打锚
	MissingFront   []string `json:"missing_front"`   // 前置信息缺失(复用 conformance)
	LongSentences  int      `json:"long_sentences"`  // 超长句数(craft 软提示)
	// V2-A4(生成侧确定性信号,零 schema):
	StubSections []string `json:"stub_sections"` // 骨架节:heading 下没有实质正文(空节/待起草)
	TodoCount    int      `json:"todo_count"`    // %TODO / [TODO 哨兵数(wl-blank-page 纪律的占位,提醒回填)
	AbbrevIssues []string `json:"abbrev_issues"` // 缩写一致性:使用多次未定义 / 定义前已使用
	// V4-R1(数字地基 + 一致性扫描 = V2-A4 收尾⑥):
	AbstractNumIssues []string `json:"abstract_num_issues"` // 摘要数字在正文无出处(C5 对账:摘要数字 ⊆ 正文数字)
	TermVariants      []string `json:"term_variants"`       // 术语变体并用(dataset/data set、e-mail/email 等词形归一后同组多表面形)
	StyleIssues       []string `json:"style_issues"`        // 数字/统计风格不一致(千分位混用、p/P 混写等)
	IssueCount        int      `json:"issue_count"`         // A 轨硬问题总数(dangling + xref + front)
}

// QualityReceiptFor —— 算当前结构体的质量回执。读失败返回空回执(无异常上抛,纯只读诊断)。
func (s *Service) QualityReceiptFor(projectID uint) (QualityReceipt, error) {
	js, err := s.GetStruct(projectID)
	if err != nil {
		return QualityReceipt{}, err
	}
	d, err := ParseDocStruct(js)
	if err != nil {
		return QualityReceipt{}, err
	}
	r := computeQualityReceipt(d)
	// 前置信息缺失复用 conformance(目标模板必填项 / 超页 / 溢出)。失败不阻断,仅少这一档。
	if conf, cerr := s.StructConformance(projectID); cerr == nil {
		r.MissingFront = conf.Missing
	}
	r.IssueCount = len(r.DanglingCites) + len(r.UndefinedXRefs) + len(r.MissingFront)
	return r, nil
}

// computeQualityReceipt —— 纯函数:在结构体上算悬空引用 / 未定义交叉引用 / 超长句(不含 conformance)。
func computeQualityReceipt(d *DocStruct) QualityReceipt {
	labels := map[string]bool{} // 所有已打锚的 {#key}
	for _, blk := range d.Body {
		if strings.TrimSpace(blk.Label) != "" {
			labels[blk.Label] = true
		}
	}
	danglingSet := map[string]bool{}
	xrefSet := map[string]bool{}
	longSentences := 0
	walkInlines := func(inls []Inline) {
		for _, in := range inls {
			switch in.T {
			case InlineCite:
				key := strings.TrimSpace(in.Key)
				if key == "" {
					continue
				}
				if isCrossRefKey(key) {
					if !labels[key] {
						xrefSet[key] = true // 引了但没打锚 → 编译会出 ??
					}
				} else if _, ok := d.Bibliography[key]; !ok {
					danglingSet[key] = true // 文献引用但 bib 无条目 → 悬空(可能是幻觉)
				}
			case InlineText:
				longSentences += countLongSentences(in.V)
			}
		}
	}
	// V3-4.3-2:补盲区 —— 交叉引用/文献可能出现在 heading/table caption/opaque(\cite)里,不只 paragraph/list。
	scanCiteText := func(text string) {
		// opaque LaTeX 里的 \cite{a,b} / \ref{fig:x}:悬空/未定义同样要抓。
		for _, m := range citeCmdRe.FindAllStringSubmatch(text, -1) {
			for _, key := range strings.Split(m[2], ",") {
				key = strings.TrimSpace(key)
				if key == "" {
					continue
				}
				if m[1] != "cite" || isCrossRefKey(key) { // ref/eqref/autoref/cref = 交叉引用
					if !labels[key] {
						xrefSet[key] = true
					}
				} else if _, ok := d.Bibliography[key]; !ok {
					danglingSet[key] = true
				}
			}
		}
	}
	for _, blk := range d.Body {
		switch blk.Type {
		case BlockParagraph:
			walkInlines(blk.Inlines)
		case BlockList:
			for _, it := range blk.Items {
				walkInlines(it)
			}
		case BlockHeading:
			longSentences += countLongSentences(blk.Text)
		case BlockOpaque:
			scanCiteText(blk.RawLatex)
		}
		if strings.TrimSpace(blk.Caption) != "" {
			scanCiteText(blk.Caption) // 题注里也可能引用
		}
	}
	r := QualityReceipt{
		DanglingCites:  sortedKeys(danglingSet),
		UndefinedXRefs: sortedKeys(xrefSet),
		LongSentences:  longSentences,
	}
	r.StubSections, r.TodoCount = detectStubs(d)
	r.AbbrevIssues = detectAbbrevIssues(d)
	r.AbstractNumIssues = checkAbstractNumbers(d)
	r.TermVariants = detectTermVariants(d)
	r.StyleIssues = detectStyleIssues(d)
	return r
}

// ── V4-R1 数字地基 ──────────────────────────────────────────────────────────
// extractNumbers:抽取并归一化文本里的数字 token(千分位剥离;百分号保留;小数保真)。
// 单一实现,三处共享:C5 摘要-正文对账 / ⑤ 数据成员校验 / A3 数词校验。
var numberRe = regexp.MustCompile(`\d+(?:,\d{3})*(?:\.\d+)?%?`)

func extractNumbers(text string) []string {
	var out []string
	for _, m := range numberRe.FindAllString(text, -1) {
		out = append(out, strings.ReplaceAll(m, ",", ""))
	}
	return out
}

// bodyProseText 拼接正文散文(段落+列表+题注),供数字/术语扫描。
func bodyProseText(d *DocStruct) string {
	var b strings.Builder
	for _, blk := range d.Body {
		switch blk.Type {
		case BlockParagraph:
			for _, in := range blk.Inlines {
				b.WriteString(in.V)
				b.WriteByte(' ')
			}
		case BlockList:
			for _, it := range blk.Items {
				for _, in := range it {
					b.WriteString(in.V)
					b.WriteByte(' ')
				}
			}
		case BlockTable:
			for _, row := range blk.Rows {
				for _, cell := range row {
					b.WriteString(cell)
					b.WriteByte(' ')
				}
			}
		}
		if blk.Caption != "" {
			b.WriteString(blk.Caption)
			b.WriteByte(' ')
		}
	}
	return b.String()
}

// checkAbstractNumbers(C5 对账):摘要里的每个数字必须在正文(含表格/题注)有出处 —— 摘要数字 ⊆ 正文数字。
// 抓「摘要写 18% 正文却是 17.8%」这类漂移与摘要编数。年份样式的 4 位数(19xx/20xx)豁免(年份非结果数字)。
func checkAbstractNumbers(d *DocStruct) []string {
	abs := strings.TrimSpace(d.FrontMatter.Abstract)
	if abs == "" {
		return nil
	}
	bodySet := map[string]bool{}
	for _, n := range extractNumbers(bodyProseText(d)) {
		bodySet[n] = true
	}
	var out []string
	seen := map[string]bool{}
	for _, n := range extractNumbers(abs) {
		if seen[n] || bodySet[n] {
			continue
		}
		if len(n) == 4 && (strings.HasPrefix(n, "19") || strings.HasPrefix(n, "20")) {
			continue // 年份豁免
		}
		seen[n] = true
		out = append(out, n)
	}
	sort.Strings(out)
	if len(out) > 8 {
		out = out[:8]
	}
	return out
}

// ── V4-R1 一致性扫描(V2-A4 收尾⑥,纯规则零 token)────────────────────────────

// detectTermVariants:词形归一(去空格/连字符/小写)后同组出现 ≥2 种表面形、每种 ≥2 次 → 术语变体并用。
// 只看 2 词以内的连字符/空格复合(dataset vs data set / e-mail vs email / state-of-the-art 类);限 6 条。
var compoundRe = regexp.MustCompile(`\b[A-Za-z]+(?:[- ][A-Za-z]+)?\b`)

func detectTermVariants(d *DocStruct) []string {
	text := bodyProseText(d)
	counts := map[string]map[string]int{} // 归一形 → 表面形 → 次数
	for _, m := range compoundRe.FindAllString(text, -1) {
		if len(m) < 5 { // 太短的词(如 "a b")噪声大,跳过
			continue
		}
		norm := strings.ToLower(strings.NewReplacer(" ", "", "-", "").Replace(m))
		if counts[norm] == nil {
			counts[norm] = map[string]int{}
		}
		counts[norm][strings.ToLower(m)]++
	}
	var out []string
	for _, surfaces := range counts {
		if len(surfaces) < 2 {
			continue
		}
		qualified := []string{}
		for s, c := range surfaces {
			if c >= 2 {
				qualified = append(qualified, s)
			}
		}
		if len(qualified) >= 2 {
			sort.Strings(qualified)
			out = append(out, strings.Join(qualified, " / ")+" 并用,请统一")
		}
	}
	sort.Strings(out)
	if len(out) > 6 {
		out = out[:6]
	}
	return out
}

// detectStyleIssues:数字/统计风格不一致(确定性可判的子集):
// ① 千分位混用(≥4 位数既有带逗号又有不带);② p/P 值大小写混写;③ 百分号空格混用(50 % vs 50%)。
func detectStyleIssues(d *DocStruct) []string {
	text := bodyProseText(d)
	var out []string
	withComma := regexp.MustCompile(`\b\d{1,3}(?:,\d{3})+\b`).FindString(text) != ""
	plain4 := regexp.MustCompile(`\b\d{5,}\b`).FindString(text) != "" // 5 位起算,避开年份
	if withComma && plain4 {
		out = append(out, "千分位分隔混用(1,234 与 12345 并存),请统一")
	}
	lowerP := regexp.MustCompile(`\bp\s*[<=>]`).FindString(text) != ""
	upperP := regexp.MustCompile(`\bP\s*[<=>]`).FindString(text) != ""
	if lowerP && upperP {
		out = append(out, "p 值大小写混写(p< 与 P< 并存),请统一")
	}
	spacedPct := regexp.MustCompile(`\d\s+%`).FindString(text) != ""
	tightPct := regexp.MustCompile(`\d%`).FindString(text) != ""
	if spacedPct && tightPct {
		out = append(out, "百分号空格混用(50 % 与 50%),请统一")
	}
	return out
}

// detectStubs(V2-A4 · 零 schema)—— 从**内容**判「这节还是骨架吗」(不依赖任何 Drafted 字段):
// heading 到下一 heading 之间无任何实质块、或正文合计 < 40 字 → 记为骨架节。顺带数 TODO 哨兵。
func detectStubs(d *DocStruct) (stubs []string, todoCount int) {
	type sec struct {
		title string
		chars int
	}
	var cur *sec
	flush := func() {
		if cur != nil && cur.chars < 40 && strings.TrimSpace(cur.title) != "" {
			stubs = append(stubs, cur.title)
		}
		cur = nil
	}
	countTodo := func(t string) {
		todoCount += strings.Count(t, "%TODO") + strings.Count(t, "[TODO")
	}
	for _, blk := range d.Body {
		switch blk.Type {
		case BlockHeading:
			flush()
			cur = &sec{title: blk.Text}
		case BlockParagraph:
			for _, in := range blk.Inlines {
				if cur != nil {
					cur.chars += len([]rune(in.V)) + len([]rune(in.Latex))
				}
				countTodo(in.V)
			}
		case BlockList:
			for _, it := range blk.Items {
				for _, in := range it {
					if cur != nil {
						cur.chars += len([]rune(in.V))
					}
					countTodo(in.V)
				}
			}
		case BlockDisplayMath, BlockFigure, BlockTable, BlockOpaque:
			if cur != nil {
				cur.chars += 100 // 有实质块(公式/图/表/opaque)= 非空节
			}
		}
	}
	flush()
	if len(stubs) > 10 {
		stubs = stubs[:10]
	}
	return stubs, todoCount
}

// abbrevRe / abbrevDefRe —— 缩写一致性(V2-A4 · 记号/术语 registry 的确定性子集):
// 「使用 ≥3 次却从未给全称定义」与「定义之前已在用」。定义形态 = 「Full Name (ABC)」。
// 纯启发式软信号:白名单常见非缩写全大写词,上限 8 条防噪声淹没。
var abbrevRe = regexp.MustCompile(`\b[A-Z][A-Z0-9]{1,5}\b`)

var abbrevWhitelist = map[string]bool{
	"II": true, "III": true, "IV": true, "USA": true, "UK": true, "EU": true,
	"DNA": true, "RNA": true, "AI": true, "OK": true,
}

func detectAbbrevIssues(d *DocStruct) []string {
	type rec struct {
		uses     int
		firstUse int // 块序
		defined  int // 定义所在块序(-1 = 未定义)
	}
	seen := map[string]*rec{}
	blockIdx := 0
	scan := func(text string) {
		// 定义:「(ABC)」—— 括号内恰为缩写词。
		for _, m := range abbrevRe.FindAllStringIndex(text, -1) {
			tok := text[m[0]:m[1]]
			if abbrevWhitelist[tok] {
				continue
			}
			r, ok := seen[tok]
			if !ok {
				r = &rec{firstUse: blockIdx, defined: -1}
				seen[tok] = r
			}
			// 被括号紧包 = 定义(Full Name (ABC));否则算使用。
			isDef := m[0] > 0 && text[m[0]-1] == '(' && m[1] < len(text) && text[m[1]] == ')'
			if isDef {
				if r.defined < 0 {
					r.defined = blockIdx
				}
			} else {
				r.uses++
				if r.uses == 1 && r.firstUse > blockIdx {
					r.firstUse = blockIdx
				}
			}
		}
	}
	for _, blk := range d.Body {
		switch blk.Type {
		case BlockParagraph:
			for _, in := range blk.Inlines {
				scan(in.V)
			}
		case BlockList:
			for _, it := range blk.Items {
				for _, in := range it {
					scan(in.V)
				}
			}
		case BlockHeading:
			scan(blk.Text)
		}
		blockIdx++
	}
	var out []string
	for tok, r := range seen {
		if r.defined < 0 && r.uses >= 3 {
			out = append(out, tok+" 使用 "+itoa(r.uses)+" 次但未给全称定义")
		} else if r.defined >= 0 && r.uses > 0 && r.firstUse < r.defined {
			out = append(out, tok+" 在定义之前已被使用")
		}
	}
	sort.Strings(out)
	if len(out) > 8 {
		out = out[:8]
	}
	return out
}

func itoa(n int) string {
	return strconv.Itoa(n)
}

// countLongSentences —— 粗略数超长句:按句末标点切分,单句 rune 数 > 60 记一处(craft 软提示,允许误差)。
// 句末标点(全角 。!?; + 半角 .!?;),用 unicode 转义写全角以免与半角字面量重复。
const sentenceEnders = "。！？；.!?;"

// citeCmdRe 抓 opaque/题注里的 \cite{...} / \ref{...} / \eqref{...}(捕获命令名与键列表)。
var citeCmdRe = regexp.MustCompile(`\\(cite|ref|eqref|autoref|cref)\{([^}]*)\}`)

func countLongSentences(text string) int {
	n := 0
	cur := 0
	for _, r := range text {
		cur++
		if strings.ContainsRune(sentenceEnders, r) {
			if cur > 60 {
				n++
			}
			cur = 0
		}
	}
	if cur > 60 {
		n++
	}
	return n
}

func sortedKeys(m map[string]bool) []string {
	if len(m) == 0 {
		return nil
	}
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
