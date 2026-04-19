// ============================================================================
// Scholay学术 V1.0
// 面向 LLM 的论文/参考文献格式化辅助函数
// ============================================================================

package peerreview

import (
	"fmt"
	"strings"
)

// compactPapersForLLM 压缩论文列表供LLM使用
func (s *Service) compactPapersForLLM(papers []map[string]any, maxPapers int) string {
	var sb strings.Builder

	for i, p := range papers {
		if i >= maxPapers {
			break
		}

		title, _ := p["title"].(string)
		year := 0
		if y, ok := p["year"].(float64); ok {
			year = int(y)
		}
		abstract, _ := p["abstract"].(string)
		if len(abstract) > 300 {
			abstract = abstract[:300] + "..."
		}
		citations := 0
		if c, ok := p["citationCount"].(float64); ok {
			citations = int(c)
		}

		sb.WriteString(fmt.Sprintf("%d. %s (%d) [引用: %d]\n", i+1, title, year, citations))
		if abstract != "" {
			sb.WriteString(fmt.Sprintf("   摘要: %s\n", abstract))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// buildReferenceList 构建参考文献列表
func (s *Service) buildReferenceList(papers []map[string]any) []ReferenceForReviewer {
	refs := make([]ReferenceForReviewer, 0, len(papers))

	for i, p := range papers {
		if i >= 30 { // 最多30篇参考文献
			break
		}

		title, _ := p["title"].(string)
		year := 0
		if y, ok := p["year"].(float64); ok {
			year = int(y)
		}
		paperID, _ := p["paperId"].(string)
		url, _ := p["url"].(string)

		// 提取作者（最多 3 位 + et al.）
		authors := ""
		if authorList, ok := p["authors"].([]any); ok && len(authorList) > 0 {
			authorNames := []string{}
			for j, a := range authorList {
				if j >= 3 {
					authorNames = append(authorNames, "et al.")
					break
				}
				if authorMap, ok := a.(map[string]any); ok {
					if name, ok := authorMap["name"].(string); ok {
						authorNames = append(authorNames, name)
					}
				}
			}
			authors = strings.Join(authorNames, ", ")
		}

		refs = append(refs, ReferenceForReviewer{
			ID:      fmt.Sprintf("R%d", i+1),
			Title:   title,
			Year:    year,
			Authors: authors,
			URL:     url,
			PaperID: paperID,
		})
	}

	return refs
}

// formatRefsForPrompt 格式化参考文献供提示词使用
func (s *Service) formatRefsForPrompt(refs []ReferenceForReviewer) string {
	var sb strings.Builder
	for _, ref := range refs {
		sb.WriteString(fmt.Sprintf("[%s] %s. %s (%d)\n", ref.ID, ref.Authors, ref.Title, ref.Year))
	}
	return sb.String()
}
