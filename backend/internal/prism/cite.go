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
	newBody := bibBody(bibtexEntry(baseKey, row.Title, authors, yr, row.Venue, row.DOI))

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
	// 幂等:同一篇(去掉键行后 body 相同)已在任意键下引用过 → 返回那个键,不重复写。
	for k, e := range d.Bibliography {
		if bibBody(e) == newBody {
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
		fmt.Fprintf(&b, "  doi     = {%s},\n", bibEscape(doi))
	}
	b.WriteString("}")
	return b.String()
}

// bibEscape 去掉会破坏 .bib 的花括号(简单防御,够 MVP)。
func bibEscape(s string) string {
	return strings.NewReplacer("{", "", "}", "").Replace(s)
}

// bibBody 去掉 "@article{key," 首行,只留字段部分 —— 用于判「是不是同一篇」(键不同不影响,消歧用)。
func bibBody(entry string) string {
	if i := strings.IndexByte(entry, '\n'); i >= 0 {
		return entry[i:]
	}
	return entry
}

// mergeBibInto 把 agent 编辑回的 references.bib 解析成 citeKey→entry 合并进 d.Bibliography(agent 权威:替换)。
// 守卫:解析出**非空**才替换 —— agent 清空/删文件(读到空)时不误清真源;它要删某条就删该条,而非清空整份。
func mergeBibInto(d *DocStruct, bibText string) {
	m := parseBib(bibText)
	if len(m) > 0 {
		d.Bibliography = m
	}
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
		for k < len(s) {
			if s[k] == '{' {
				depth++
			} else if s[k] == '}' {
				depth--
			}
			k++
			if depth == 0 {
				break
			}
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
