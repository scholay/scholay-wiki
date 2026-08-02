// ============================================================================
// Prism \cite —— 文献库 RAG grounding(反幻觉)。
//
// 候选只来自用户**真实文献库**(user_library_papers,LIKE 检索);ApplyCite 把对应
// BibTeX 写入项目 references.bib(确定性 citeKey),前端再插 \cite{key}。
// 因此每个 cite key 必有真实库行背书 —— agent 不能凭记忆造引用。
// ============================================================================

package prism

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
)

var nonKeyChar = regexp.MustCompile(`[^A-Za-z0-9]`)

// SearchCite 在用户文献库里检索可引用的论文。
func (s *Service) SearchCite(userID uint, query string, limit int) ([]CiteCandidate, error) {
	rows, err := s.repo.SearchLibrary(userID, query, limit)
	if err != nil {
		return nil, err
	}
	out := make([]CiteCandidate, 0, len(rows))
	for _, r := range rows {
		authors, first := authorsFromJSON(r.AuthorsJSON)
		yr := 0
		if r.Year != nil {
			yr = int(*r.Year)
		}
		out = append(out, CiteCandidate{
			LibraryPaperID: r.ID,
			CiteKey:        citeKey(first, yr, r.ID),
			Title:          r.Title,
			Authors:        authors,
			Year:           yr,
			Venue:          r.Venue,
			DOI:            r.DOI,
		})
	}
	return out, nil
}

// ApplyStructCite(struct 轨)把某条库论文的 BibTeX 写进**结构体的 Bibliography map**(citeKey→entry),
// 再 SaveStructVersion + materializeStruct —— projector 据 Bibliography 生成 references.bib + \bibliography,
// 使正文里的 [@key] 真正编译出参考文献(旧版把 bib 写成独立文件,会被 materializeStruct 重生覆盖,是死 sink)。
// 幂等:key 已在 map 里则不重复写、直接返回。返回 cite key 供前端在光标处插入 [@key] 节点。
func (s *Service) ApplyStructCite(projectID, userID, libraryPaperID uint) (string, error) {
	row, err := s.repo.GetLibraryPaper(userID, libraryPaperID)
	if err != nil {
		return "", err
	}
	if row == nil {
		return "", ErrCiteNotInLibrary
	}
	authors, first := authorsFromJSON(row.AuthorsJSON)
	yr := 0
	if row.Year != nil {
		yr = int(*row.Year)
	}
	baseKey := citeKey(first, yr, row.ID)
	newNorm := normBibBody(bibtexEntry(baseKey, row.Title, authors, yr, row.Venue, row.DOI))

	// 取每项目写锁:加引用的 GetStruct→改 Bibliography→存 与 autosave/AI 轮串行(评审 #1)。
	unlock := structWriteMu.lock(projectID)
	defer unlock()
	js, err := s.GetStruct(projectID)
	if err != nil {
		return "", err
	}
	d, err := ParseDocStruct(js)
	if err != nil {
		return "", err
	}
	if d.Bibliography == nil {
		d.Bibliography = map[string]string{}
	}
	// 幂等:同一篇(去掉键行后 body 归一化相同)已在任意键下引用过 → 返回那个键,不重复写。
	// 2026-07 审查 [15]:比对两侧都过 normBibBody(剥花括号 + 剥转义反斜杠)—— 只过 sanitize
	// 补不回旧 bibEscape 剥掉的花括号(旧:{DNA} repair → DNA repair;新:保留 {DNA}),
	// 标题含成对花括号的存量条目会漏判「同一篇」而重复加条(同一篇出现两次)。
	for k, e := range d.Bibliography {
		if normBibBody(e) == newNorm {
			return k, nil
		}
	}
	// 键碰撞消歧:baseKey 已被**别的**论文占用(同姓同年)→ 追加字母后缀 a/b/c…(pandoc 惯例)。
	key := baseKey
	if _, taken := d.Bibliography[key]; taken {
		key = ""
		for _, suf := range "abcdefghijklmnopqrstuvwxyz" {
			if cand := baseKey + string(suf); d.Bibliography[cand] == "" {
				key = cand
				break
			}
		}
		if key == "" {
			key = fmt.Sprintf("%s%d", baseKey, row.ID) // 极端兜底:26 篇同姓同年
		}
	}
	d.Bibliography[key] = bibtexEntry(key, row.Title, authors, yr, row.Venue, row.DOI)
	canonical, err := d.Marshal()
	if err != nil {
		return "", err
	}
	if _, err := s.repo.SaveStructVersion(projectID, canonical, sha256Hex(canonical), AuthorUser); err != nil {
		return "", err
	}
	if err := s.materializeStruct(projectID, d); err != nil {
		return "", err
	}
	return key, nil
}

// ─── helpers ───────────────────────────────────────────────────────────────

// authorsFromJSON 容错解析 authors_json([{"name":..}] 或 ["A","B"] 或 [{"given","family"}]),
// 返回 (展示串, 第一作者姓氏 token)。
func authorsFromJSON(raw []byte) (string, string) {
	if len(raw) == 0 {
		return "", ""
	}
	// 形态 1: [{"name":"X"}, ...] 或 [{"given":"A","family":"B"}]
	var objs []map[string]any
	if err := json.Unmarshal(raw, &objs); err == nil && len(objs) > 0 {
		names := make([]string, 0, len(objs))
		for _, o := range objs {
			if n, ok := o["name"].(string); ok && n != "" {
				names = append(names, n)
			} else if fam, ok := o["family"].(string); ok && fam != "" {
				if g, ok := o["given"].(string); ok && g != "" {
					names = append(names, g+" "+fam)
				} else {
					names = append(names, fam)
				}
			}
		}
		if len(names) > 0 {
			return strings.Join(names, ", "), lastToken(names[0])
		}
	}
	// 形态 2: ["A","B"]
	var strs []string
	if err := json.Unmarshal(raw, &strs); err == nil && len(strs) > 0 {
		return strings.Join(strs, ", "), lastToken(strs[0])
	}
	return "", ""
}

func lastToken(name string) string {
	parts := strings.Fields(strings.TrimSpace(name))
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}

// citeKey 确定性键:第一作者姓氏 + 年份;退化用 ref<id>。仅 [A-Za-z0-9]。
func citeKey(firstAuthorLast string, year int, paperID uint) string {
	base := nonKeyChar.ReplaceAllString(firstAuthorLast, "")
	if base == "" {
		base = fmt.Sprintf("ref%d", paperID)
	}
	if year > 0 {
		return fmt.Sprintf("%s%d", base, year)
	}
	return base
}

func bibtexEntry(key, title, authors string, year int, venue, doi string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "@article{%s,\n", key)
	if title != "" {
		fmt.Fprintf(&b, "  title   = {%s},\n", bibEscape(title))
	}
	if authors != "" {
		fmt.Fprintf(&b, "  author  = {%s},\n", bibEscape(authors))
	}
	if year > 0 {
		fmt.Fprintf(&b, "  year    = {%d},\n", year)
	}
	if venue != "" {
		fmt.Fprintf(&b, "  journal = {%s},\n", bibEscape(venue))
	}
	if doi != "" {
		// 2026-07 审查 [12]:doi 是 URL 型字段,`_ & #` 是其合法字符,转义会把链接写坏。
		fmt.Fprintf(&b, "  doi     = {%s},\n", bibEscapeURL(doi))
	}
	b.WriteString("}")
	return b.String()
}

// bibEscape 把纯文本字段值转义成 .bib 安全形态(2026-07 线上审计 #1:旧实现只删花括号,
// 期刊名 "Soil & Tillage Research" 的裸 & 直落 .bib → "Misplaced alignment tab character &"
// 连炸编译)。规则:& % # $ _ 前加反斜杠;已转义(前有 \)的不双重转义;**成对**花括号保留
// (BibTeX 大小写保护语义),不配平时才全部剔除(防毒化 .bib 结构)。
func bibEscape(s string) string { return bibEscapeWith(s, isBibSpecial) }

// bibEscapeURL 用于 url/doi 这类 URL 型字段(2026-07 审查 [12]):`_ & #` 在 URL 里是合法字符,
// 转义会把链接写坏、且会被 mergeBibInto 回写固化进 struct 真源;只转义在 TeX 排版里会毒化
// 整行的 `%` 与会开数学段的 `$`。
func bibEscapeURL(s string) string { return bibEscapeWith(s, isBibSpecialURL) }

func bibEscapeWith(s string, special func(byte) bool) string {
	if !bracesBalanced(s) {
		s = strings.NewReplacer("{", "", "}", "").Replace(s)
	}
	var b strings.Builder
	b.Grow(len(s) + 8)
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\\' && i+1 < len(s) {
			// 反斜杠打头(\& 已转义 / LaTeX 命令)→ 连同下一字节原样保留,不双重转义。
			b.WriteByte(c)
			b.WriteByte(s[i+1])
			i++
			continue
		}
		if special(c) {
			b.WriteByte('\\')
		}
		b.WriteByte(c)
	}
	return b.String()
}

// isBibSpecial 报 c 是否是必须转义的 BibTeX 值内特殊字符。
func isBibSpecial(c byte) bool {
	switch c {
	case '&', '%', '#', '$', '_':
		return true
	}
	return false
}

// isBibSpecialURL 是 URL 型字段的收窄口径:只转义 % 与 $。
func isBibSpecialURL(c byte) bool { return c == '%' || c == '$' }

// urlLikeBibField 报字段名是否是 URL/标识符型 —— 这类值里的 `_ & #` 必须原样保留
// (2026-07 审查 [12])。名字已小写。
func urlLikeBibField(name string) bool {
	switch name {
	case "url", "doi", "eprint", "file", "howpublished":
		return true
	}
	return false
}

// bracesBalanced 报字符串里的花括号是否成对配平(深度不为负且收尾归零)。
func bracesBalanced(s string) bool {
	d := 0
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '{':
			d++
		case '}':
			d--
			if d < 0 {
				return false
			}
		}
	}
	return d == 0
}

// sanitizeBibEntry 对整条 bib 条目做**字段值级**清洗(2026-07 线上审计 #1:agent 手写条目
// 同样带裸 & 等):仅在花括号深度 ≥2(字段值内)或深度 1 的引号值内给裸 & % # _ 补反斜杠;
// $ 视作数学定界原样保留、数学段内不转义(标题含 $O(n)$ 常见);已转义的不双重转义;
// 头行(@type{key,)与字段名所在的深度 1 原样不动。幂等:清洗过的再过一遍不变。
//
// 2026-07 审查 [11]/[23]:数学段判定收窄到**单个字段值内配对的 $**,并在字段边界强制复位 ——
// 旧实现是整条 entry 的单向 toggle,标题里一个货币 $(Cost is $5)就会让其后所有字段的裸 &/%
// 不再转义,线上炸编译的形态原样复发。
// 2026-07 审查 [12]:url/doi 等 URL 型字段跳过 `_ & #` 的转义(值会被回写固化进 struct 真源)。
func sanitizeBibEntry(entry string) string {
	var b strings.Builder
	b.Grow(len(entry) + 8)
	depth := 0
	inQuote := false   // 深度 1 的 field = "value" 引号值
	inMath := false    // 当前字段值内的 $...$ 数学段
	var nameBuf []byte // 深度 1 上累积的字段名候选(上一个 ',' 到 '=' 之间)
	field := ""        // 当前字段名(小写)
	for i := 0; i < len(entry); i++ {
		c := entry[i]
		if c == '\\' && i+1 < len(entry) {
			b.WriteByte(c)
			b.WriteByte(entry[i+1])
			i++
			continue
		}
		switch c {
		case '{':
			depth++
			b.WriteByte(c)
		case '}':
			if depth > 0 {
				depth--
			}
			if depth <= 1 { // 字段值结束:数学段不跨字段泄漏
				inMath = false
			}
			b.WriteByte(c)
		case '"':
			if depth == 1 {
				inQuote = !inQuote
				if !inQuote {
					inMath = false
				}
			}
			b.WriteByte(c)
		case ',':
			if depth == 1 && !inQuote { // 字段分隔:字段名与数学段一起清零
				nameBuf, field, inMath = nameBuf[:0], "", false
			}
			b.WriteByte(c)
		case '=':
			if depth == 1 && !inQuote {
				field = strings.ToLower(strings.TrimSpace(string(nameBuf)))
				nameBuf = nameBuf[:0]
			}
			b.WriteByte(c)
		case '$':
			// 只有在同一字段值内找得到配对的 $ 才算数学段;落单的 $(货币)按字面处理。
			if inMath {
				inMath = false
			} else {
				inMath = hasClosingMathDollar(entry[i+1:], depth == 1 && inQuote)
			}
			b.WriteByte(c)
		case '&', '%', '#', '_':
			if (depth >= 2 || (depth == 1 && inQuote)) && !inMath &&
				!(urlLikeBibField(field) && c != '%') {
				b.WriteByte('\\')
			}
			b.WriteByte(c)
		default:
			if depth == 1 && !inQuote {
				nameBuf = append(nameBuf, c)
			}
			b.WriteByte(c)
		}
	}
	return b.String()
}

// hasClosingMathDollar 报「当前字段值的剩余部分里还有没有配对的 $」:遇到本字段值的结束
// (相对深度 0 上的 '}',或引号值的收尾 '"')即判未配对(2026-07 审查 [11])。
func hasClosingMathDollar(rest string, inQuote bool) bool {
	d := 0
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case '\\':
			i++ // 跳过被转义字符(\$ 不是定界符)
		case '{':
			d++
		case '}':
			if d == 0 {
				return false // 字段值结束
			}
			d--
		case '"':
			if inQuote && d == 0 {
				return false
			}
		case '$':
			return true
		}
	}
	return false
}

// bibBody 去掉 "@article{key," 首行,只留字段部分 —— 用于判「是不是同一篇」(键不同不影响,消歧用)。
func bibBody(entry string) string {
	if i := strings.IndexByte(entry, '\n'); i >= 0 {
		return entry[i:]
	}
	return entry
}

// normBibBody 把条目 body 归一化到「可跨 bibEscape 换代比对」的形态(2026-07 审查 [15]):
// 剥掉所有花括号(旧实现无条件删、新实现保留成对的)+ 剥掉特殊字符前的转义反斜杠
// (旧实现不转义、新实现转义)。只用于「是不是同一篇」的比对,不改写任何存量数据。
func normBibBody(entry string) string {
	s := bibBody(entry)
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '{' || c == '}':
			// 丢弃
		case c == '\\' && i+1 < len(s) && isBibSpecial(s[i+1]):
			b.WriteByte(s[i+1]) // \& → &
			i++
		default:
			b.WriteByte(c)
		}
	}
	return b.String()
}

// mergeBibInto 把 agent 编辑回的 references.bib 解析成 citeKey→entry 合并进 d.Bibliography(agent 权威:替换)。
// 守卫:解析出**非空**才替换 —— agent 清空/删文件(读到空)时不误清真源;它要删某条就删该条,而非清空整份。
// 2026-07 线上审计 #2:入库前逐条校验(单 @ 头 + 头部合法),不合格丢弃 + 告警 —— 宁缺一条,
// 不让「一个 value 装两个 @article 头」的畸形条毒死整份 bib(pandoc/bibtex 双炸);
// 合格条目再过 sanitizeBibEntry 清洗裸特殊字符(审计 #1,agent 手写路径)。
func mergeBibInto(d *DocStruct, bibText string) {
	m := parseBib(bibText)
	for k, e := range m {
		if !validBibEntry(e) {
			slog.Warn("prism: 丢弃畸形 bib 条目(入库校验)", "cite_key", k)
			delete(m, k)
			continue
		}
		m[k] = sanitizeBibEntry(e)
	}
	if len(m) > 0 {
		d.Bibliography = m
	}
}

// bibEntryHeadRe 合法条目头:^@type{key, —— key 内不允许逗号/花括号。
var bibEntryHeadRe = regexp.MustCompile(`^@\w+\{[^,{}]+,`)

// bibTypeHeadRe 统计条目内出现的 @type{ 头(合法条目全文只允许一个)。
var bibTypeHeadRe = regexp.MustCompile(`@\w+\{`)

// bibHeadStartRe 「看起来像新条目头」的宽松判据(parseBib 判截断重启用,不要求已带 key/逗号)。
var bibHeadStartRe = regexp.MustCompile(`^@\w+\s*\{`)

// validBibEntry 报一个条目 value 是否「单条且头部合法」(2026-07 线上审计 #2:
// 头部匹配 ^@type{key, 且全文仅一个 @type{ 头;入库与出口两侧共用)。
func validBibEntry(entry string) bool {
	return bibEntryHeadRe.MatchString(entry) && len(bibTypeHeadRe.FindAllStringIndex(entry, 2)) == 1
}

// parseBib 宽松解析 BibTeX:按 @ 记录切,花括号配平取整条,键 = "@type{" 与第一个 "," 之间。
// 容忍 agent 手写的各种排版(值里的嵌套花括号靠配平处理;非条目文本跳过)。互逆于 projector.renderBib。
func parseBib(s string) map[string]string {
	out := map[string]string{}
	for i := 0; i < len(s); {
		if s[i] != '@' {
			i++
			continue
		}
		br := strings.IndexByte(s[i:], '{')
		if br < 0 {
			break
		}
		open := i + br // '{' 的字节位置
		depth, k := 0, open
		restart := -1 // 2026-07 线上审计 #2:配平途中撞到「行首 @」= 上一条没闭合被截断,从这里重启
		for k < len(s) {
			if s[k] == '{' {
				depth++
			} else if s[k] == '}' {
				depth--
			} else if s[k] == '@' && atLineStart(s, k) && bibHeadStartRe.MatchString(s[k:]) {
				// 线上 project 267:某条只写头 "@article{key," 未闭合,配平一路吞掉下一条,
				// 一个 value 装两个 @ 头 → 毒死整份 bib。行首 @ 判上一条截断:丢弃残条、从新 @ 重启。
				// 2026-07 审查 [10]/[24]:必须**长得像条目头**(@type{)才判截断 —— 只看「行首 @」
				// 会把值里换行后行首的 @(多行 note 里的邮箱/handle)误判成新条目,
				// 整条合法条目被静默丢弃且 mergeBibInto 整份替换后不可恢复。
				restart = k
				break
			}
			k++
			if depth == 0 {
				break
			}
		}
		if restart >= 0 {
			// 2026-07 审查 [10]:被丢弃的残条留痕(带推断 key)—— 否则引用凭空消失、运维无从定位。
			slog.Warn("prism: 丢弃未闭合的 bib 残条(行首遇到新条目头)", "cite_key", bibFragKey(s[i:restart]))
			i = restart
			continue
		}
		if depth != 0 {
			break // 花括号没配平(截断)→ 停
		}
		entry := strings.TrimSpace(s[i:k])
		key := strings.TrimSpace(s[open+1 : k-1])
		if c := strings.IndexByte(key, ','); c >= 0 {
			key = strings.TrimSpace(key[:c]) // 键在 '{' 与第一个 ',' 之间
		}
		if key != "" {
			out[key] = entry
		}
		i = k
	}
	return out
}

// bibFragKey 从被丢弃的残条片段里尽力推断 cite key(仅日志定位用,失败返回空)。
func bibFragKey(frag string) string {
	br := strings.IndexByte(frag, '{')
	if br < 0 {
		return ""
	}
	key := frag[br+1:]
	if c := strings.IndexAny(key, ",\n"); c >= 0 {
		key = key[:c]
	}
	key = strings.TrimSpace(key)
	if len(key) > 64 {
		key = key[:64]
	}
	return key
}

// atLineStart 报 s[k] 是否是其所在行的第一个非空白字符(parseBib 判「行首 @」用;
// 字段值里的 email @ 在行中,不会误判)。
func atLineStart(s string, k int) bool {
	for j := k - 1; j >= 0; j-- {
		switch s[j] {
		case '\n':
			return true
		case ' ', '\t', '\r':
			continue
		default:
			return false
		}
	}
	return true // 全文开头
}
