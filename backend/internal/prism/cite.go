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

// ApplyCite 把某条库论文的 BibTeX 写入项目 references.bib(幂等:已存在该 key 则不重复),
// 返回可供前端插入的 \cite{key}。references.bib 不存在则创建。
func (s *Service) ApplyCite(projectID, userID, libraryPaperID uint) (string, error) {
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
	key := citeKey(first, yr, row.ID)
	entry := bibtexEntry(key, row.Title, authors, yr, row.Venue, row.DOI)

	bib, err := s.repo.GetFileByPath(projectID, "references.bib")
	if err != nil {
		return "", err
	}
	if bib == nil {
		// 新建 references.bib + 首个版本
		nf := &File{ProjectID: projectID, RelPath: "references.bib", FileKind: KindBib, Mime: "text/x-bibtex"}
		if err := s.repo.CreateFile(nf); err != nil {
			return "", err
		}
		if _, err := s.repo.AppendCurrentVersion(nf.ID, entry+"\n", sha256Hex(entry+"\n"), AuthorUser, nil); err != nil {
			return "", err
		}
		_ = s.repo.TouchProject(projectID)
		return key, nil
	}
	// 已有 references.bib:幂等追加(key 已存在则跳过)。
	_, body, err := s.GetFileBody(projectID, bib.ID)
	if err != nil {
		return "", err
	}
	if strings.Contains(body, "{"+key+",") {
		return key, nil // 已引用过
	}
	newBody := strings.TrimRight(body, "\n") + "\n\n" + entry + "\n"
	if _, err := s.repo.AppendCurrentVersion(bib.ID, newBody, sha256Hex(newBody), AuthorUser, nil); err != nil {
		return "", err
	}
	_ = s.repo.TouchProject(projectID)
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
