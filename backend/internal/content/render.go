package content

import (
	"encoding/json"
	"fmt"
	"html"
	"strings"
)

// RenderNoscriptHTML 把整篇文章渲染成爬虫可见的完整正文 HTML(一个 <section>…</section>)。
// 样式参数由调用方(config SSR)传入,与站内其它 noscript 卡片观感一致。这是让
// 搜索引擎 / AI 爬虫读到「完整正文」(而非 teaser)的关键 —— GEO 可引用性的核心。
func RenderNoscriptHTML(a *Article, baseStyle, headingStyle, textStyle string) string {
	var b strings.Builder
	fmt.Fprintf(&b, `<section %s>`, baseStyle)
	fmt.Fprintf(&b, `<h1 %s>%s</h1>`, headingStyle, html.EscapeString(a.Title))

	// 署名 + 日期(E-E-A-T:具名作者 + 更新时间)
	var metaParts []string
	if a.Author != nil && a.Author.Name != "" {
		who := a.Author.Name
		if a.Author.Role != "" {
			who += " · " + a.Author.Role
		}
		metaParts = append(metaParts, who)
	}
	if a.Date != "" {
		metaParts = append(metaParts, "发布 "+a.Date)
	}
	if a.UpdatedDate != "" && a.UpdatedDate != a.Date {
		metaParts = append(metaParts, "更新 "+a.UpdatedDate)
	}
	if len(metaParts) > 0 {
		fmt.Fprintf(&b, `<p style="color:#6E6E78;font-size:0.9rem;margin-bottom:8px;">%s</p>`,
			html.EscapeString(strings.Join(metaParts, " · ")))
	}
	if a.Excerpt != "" {
		fmt.Fprintf(&b, `<p %s><em>%s</em></p>`, textStyle, html.EscapeString(a.Excerpt))
	}

	for _, s := range a.Sections {
		switch s.Type {
		case "heading":
			fmt.Fprintf(&b, `<h2 %s>%s</h2>`, headingStyle, html.EscapeString(s.Text))
		case "tip":
			title := html.EscapeString(s.Title)
			if title == "" {
				title = "提示"
			}
			fmt.Fprintf(&b,
				`<aside style="margin:16px 0;padding:12px 16px;border-left:3px solid #E5A800;background:#E5DFCE;">`+
					`<strong style="color:#664B00;">%s</strong> <span %s>%s</span></aside>`,
				title, textStyle, html.EscapeString(s.Text))
		case "list":
			tag := "ul"
			if s.Ordered {
				tag = "ol"
			}
			fmt.Fprintf(&b, `<%s style="margin:12px 0;padding-left:24px;line-height:1.8;color:#505059;">`, tag)
			for _, it := range s.Items {
				fmt.Fprintf(&b, `<li>%s</li>`, html.EscapeString(it))
			}
			fmt.Fprintf(&b, `</%s>`, tag)
		case "table":
			b.WriteString(`<table style="border-collapse:collapse;margin:16px 0;width:100%;font-size:0.95em;color:#505059;">`)
			if len(s.Headers) > 0 {
				b.WriteString(`<thead><tr>`)
				for _, h := range s.Headers {
					fmt.Fprintf(&b, `<th style="border:1px solid #DCDAD6;padding:6px 10px;text-align:left;background:#EFEDE5;color:#1F1F23;">%s</th>`, html.EscapeString(h))
				}
				b.WriteString(`</tr></thead>`)
			}
			b.WriteString(`<tbody>`)
			for _, row := range s.Rows {
				b.WriteString(`<tr>`)
				for _, cell := range row {
					fmt.Fprintf(&b, `<td style="border:1px solid #DCDAD6;padding:6px 10px;">%s</td>`, html.EscapeString(cell))
				}
				b.WriteString(`</tr>`)
			}
			b.WriteString(`</tbody></table>`)
		case "faq":
			for _, qa := range s.FAQ {
				fmt.Fprintf(&b, `<h3 %s>%s</h3>`, headingStyle, html.EscapeString(qa.Q))
				fmt.Fprintf(&b, `<p %s>%s</p>`, textStyle, html.EscapeString(qa.A))
			}
		default: // paragraph
			fmt.Fprintf(&b, `<p %s>%s</p>`, textStyle, html.EscapeString(s.Text))
		}
	}

	// 作者 bio 卡(给 AI / 爬虫一个明确的"谁对内容负责"信号)
	if a.Author != nil && a.Author.Bio != "" {
		fmt.Fprintf(&b,
			`<p style="color:#6E6E78;font-size:0.85rem;margin-top:16px;">作者:%s —— %s</p>`,
			html.EscapeString(a.Author.Name), html.EscapeString(a.Author.Bio))
	}
	b.WriteString(`</section>`)
	return b.String()
}

// BuildJSONLD 生成 BlogPosting(blog)/ Article(resources)的 JSON-LD。
func (a *Article) BuildJSONLD(canonical, baseURL string) string {
	typ := "Article"
	if a.Kind == "blog" {
		typ = "BlogPosting"
	}
	obj := map[string]any{
		"@context":         "https://schema.org",
		"@type":            typ,
		"headline":         truncateRunes(a.Title, 110),
		"name":             a.Title,
		"url":              canonical,
		"mainEntityOfPage": canonical,
		"inLanguage":       "zh-CN",
		"publisher": map[string]any{
			"@type": "Organization", "name": "Scholay学术", "url": baseURL,
		},
	}
	if a.Excerpt != "" {
		obj["description"] = a.Excerpt
	}
	if a.Date != "" {
		obj["datePublished"] = a.Date
	}
	if lm := a.LastMod(); lm != "" {
		obj["dateModified"] = lm
	}
	if a.Author != nil && a.Author.Name != "" {
		au := map[string]any{"@type": "Person", "name": a.Author.Name}
		if a.Author.Bio != "" {
			au["description"] = a.Author.Bio
		}
		obj["author"] = au
	}
	if len(a.Tags) > 0 {
		obj["keywords"] = strings.Join(a.Tags, ",")
	}
	if a.Category != "" {
		obj["articleSection"] = a.Category
	}
	b, err := json.Marshal(obj)
	if err != nil {
		return ""
	}
	return `<script type="application/ld+json">` + string(b) + `</script>`
}

// BuildFAQJSONLD 若文章含 faq section,产出 FAQPage JSON-LD —— AI 引擎 / Google 富结果
// 最易抽取的结构。无 faq 返回 ""。作为独立 <script> 与 BlogPosting JSON-LD 并存。
func (a *Article) BuildFAQJSONLD() string {
	var qas []map[string]any
	for _, s := range a.Sections {
		if s.Type != "faq" {
			continue
		}
		for _, qa := range s.FAQ {
			if qa.Q == "" || qa.A == "" {
				continue
			}
			qas = append(qas, map[string]any{
				"@type":          "Question",
				"name":           qa.Q,
				"acceptedAnswer": map[string]any{"@type": "Answer", "text": qa.A},
			})
		}
	}
	if len(qas) == 0 {
		return ""
	}
	b, err := json.Marshal(map[string]any{
		"@context":   "https://schema.org",
		"@type":      "FAQPage",
		"mainEntity": qas,
	})
	if err != nil {
		return ""
	}
	return `<script type="application/ld+json">` + string(b) + `</script>`
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
