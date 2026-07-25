// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// W6 P1-7 零重叠沉底(链路 A / REST 搜索):上游按关键词匹配排序偶发噪声,会把与查询
// **零词重叠**的条目排到最前(审计案例:文莱论文登顶)。此处做最保守的确定性缓解 ——
// 不判「相关」,只判「连一个查询词都不含(标题+摘要)的不配排前面」:稳定重排沉底,
// 不删除条目、不改任何字段、不进缓存(调用点在 handler 逐请求路径,缓存写入之外)。
// 链路 B(agent MCP)的对应措施是 sanitizeMinicod 的 low_relevance_ids 标注 + prompt 相关性条款。

package minicod

import (
	"regexp"
	"strings"
	"unicode"
)

// nonWordSplitRe 分词:按非单词字符切(\w = [0-9A-Za-z_],CJK 会被切碎 —— 无妨,
// 中文 query 在 sinkZeroOverlap 已整体豁免)。
var nonWordSplitRe = regexp.MustCompile(`\W+`)

// searchStopwords 英文功能词(len>=3 的部分;更短的已被长度门槛滤掉)。
// 刻意只收纯功能词,不收 study/analysis 等有检索语义的常见学术词。
var searchStopwords = map[string]struct{}{
	"the": {}, "and": {}, "for": {}, "with": {}, "from": {}, "that": {}, "this": {},
	"these": {}, "those": {}, "are": {}, "was": {}, "were": {}, "been": {}, "being": {},
	"have": {}, "has": {}, "had": {}, "does": {}, "did": {}, "will": {}, "would": {},
	"can": {}, "could": {}, "should": {}, "may": {}, "might": {}, "must": {}, "shall": {},
	"not": {}, "nor": {}, "but": {}, "its": {}, "their": {}, "they": {}, "them": {},
	"his": {}, "her": {}, "our": {}, "your": {}, "all": {}, "any": {}, "each": {},
	"few": {}, "more": {}, "most": {}, "other": {}, "some": {}, "such": {}, "only": {},
	"own": {}, "same": {}, "than": {}, "too": {}, "very": {}, "what": {}, "when": {},
	"where": {}, "which": {}, "while": {}, "who": {}, "whom": {}, "why": {}, "how": {},
	"into": {}, "onto": {}, "upon": {}, "over": {}, "under": {}, "out": {}, "off": {},
	"again": {}, "further": {}, "then": {}, "once": {}, "here": {}, "there": {},
	"both": {}, "during": {}, "before": {}, "after": {}, "above": {}, "below": {},
	"between": {}, "through": {}, "because": {}, "until": {}, "against": {},
	"about": {}, "among": {}, "via": {}, "using": {}, "based": {},
}

// significantTerms 从查询里抽有效词:小写、\W+ 分词、去停用词、len>=3、去重(保序)。
func significantTerms(query string) []string {
	seen := map[string]struct{}{}
	var terms []string
	for _, w := range nonWordSplitRe.Split(strings.ToLower(query), -1) {
		if len(w) < 3 {
			continue
		}
		if _, stop := searchStopwords[w]; stop {
			continue
		}
		if _, dup := seen[w]; dup {
			continue
		}
		seen[w] = struct{}{}
		terms = append(terms, w)
	}
	return terms
}

// containsCJK 报告字符串是否含汉字(与 agent 侧 sanitizeMinicod 的 CJK_RE 同语义)。
func containsCJK(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

// paperMatchesAnyTerm 标题+摘要是否命中至少一个查询词(小写子串匹配)。
func paperMatchesAnyTerm(p *Paper, terms []string) bool {
	hay := strings.ToLower(p.Title + " " + p.Abstract)
	for _, t := range terms {
		if strings.Contains(hay, t) {
			return true
		}
	}
	return false
}

// sinkZeroOverlap 把「标题+摘要一个查询词都不含」的条目稳定沉底(两组内各保上游原序)。
// 豁免:有效词 <2(极端 query 全是停用词/短词,判据太弱)或 query 含 CJK(中文 query 对
// 英文标题必然零重叠,机械沉底会误杀全部结果)。原地重排,不删不改字段。
func sinkZeroOverlap(query string, papers []Paper) {
	terms := significantTerms(query)
	if len(terms) < 2 || containsCJK(query) {
		return
	}
	matched := make([]Paper, 0, len(papers))
	sunk := make([]Paper, 0)
	for i := range papers {
		if paperMatchesAnyTerm(&papers[i], terms) {
			matched = append(matched, papers[i])
		} else {
			sunk = append(sunk, papers[i])
		}
	}
	if len(sunk) == 0 || len(matched) == 0 {
		return // 全命中 / 全零重叠:无需重排(全零重叠时沉底=原序,保持不动)
	}
	copy(papers, matched)
	copy(papers[len(matched):], sunk)
}
