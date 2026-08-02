// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// fields 过滤参数白名单 —— 2026-07 线上审计治本项。
//
// 背景(第三次同族复发,前两次:authors 请求带已废 `source` 恒 400 / olx select 字段名不合):
// handler 把 HTTP query 的 fields 原样透传给上游,线上旧构建前端仍传已废弃的 `tldr`,
// /papers/references 与 /authors/papers 恒 400,用户点击直接失败。
// 治本:所有发往上游的 fields 一律先过白名单(未知/已废字段静默剔除,过滤后为空则不发
// fields、取上游默认字段)。**白名单以仓库根 api-1.json 的 Paper / Author schema 为准**,
// fields_test.go 有单测锁住这一契约。
// ============================================================================

package minicod

import (
	"log/slog"
	"strings"
)

// paperFieldSpec —— 论文 fields 白名单声明。
// key = api-1.json `Paper` schema 的属性名(snake_case,真源);
// value = 该属性允许的全部拼法(含前端/SS 契约沿用的 camelCase 别名,双拼法都放行)。
//
// 刻意不含(= 会被剔除):
//   - tldr / bibtex:api-1.json 里是**响应**字段,但 references / authors-papers 的
//     fields 过滤参数不接受(线上恒 400 实证);
//   - source:上游已废(2026-07-29 seoenrich 审计实证恒 400);
//   - corpusId / s2FieldsOfStudy / influentialCitationCount / journal / publicationTypes
//     等旧 Semantic Scholar 词表:api-1.json 无对应属性,视为未知。
var paperFieldSpec = map[string][]string{
	"id":               {"id", "paperId"},
	"title":            {"title"},
	"abstract":         {"abstract"},
	"year":             {"year"},
	"publication_date": {"publication_date", "publicationDate"},
	"doi":              {"doi", "externalIds"},
	"citation_count":   {"citation_count", "citationCount"},
	"reference_count":  {"reference_count", "referenceCount"},
	"venue":            {"venue"},
	"is_open_access":   {"is_open_access", "isOpenAccess"},
	"pdf_url":          {"pdf_url", "pdfUrl", "openAccessPdf"},
	"url":              {"url"},
	"fields_of_study":  {"fields_of_study", "fieldsOfStudy"},
	"authors":          {"authors"},
}

// authorFieldSpec —— 作者 fields 白名单声明,key 对齐 api-1.json `Author` schema。
// 例外:`homepage` 不在 Author schema,但 seoenrich(authorEnrichFields)线上长期在用且
// 上游接受,登记为已知例外(fields_test.go 里显式列出)。同样刻意不含 source。
var authorFieldSpec = map[string][]string{
	"id":             {"id", "authorId"},
	"name":           {"name"},
	"affiliations":   {"affiliations"},
	"paper_count":    {"paper_count", "paperCount"},
	"citation_count": {"citation_count", "citationCount"},
	"h_index":        {"h_index", "hIndex"},
	"orcid":          {"orcid"},
	"url":            {"url"},
	"homepage":       {"homepage"}, // 已知例外,见上
}

// specToAllowSet 把 spec 声明摊平成查询集合。
func specToAllowSet(spec map[string][]string) map[string]struct{} {
	out := make(map[string]struct{}, len(spec)*2)
	for _, aliases := range spec {
		for _, a := range aliases {
			out[a] = struct{}{}
		}
	}
	return out
}

var (
	paperFieldAllow  = specToAllowSet(paperFieldSpec)
	authorFieldAllow = specToAllowSet(authorFieldSpec)
)

// filterFields 逐项 trim 后过白名单;未知字段静默剔除(Debug 留痕,字段名不含用户内容)。
// 过滤后为空返回 nil —— 调用侧 len==0 即不发 fields,取上游默认字段集。
func filterFields(fields []string, allow map[string]struct{}) []string {
	if len(fields) == 0 {
		return nil
	}
	out := make([]string, 0, len(fields))
	var dropped []string
	for _, f := range fields {
		f = strings.TrimSpace(f)
		if f == "" {
			continue
		}
		if _, ok := allow[f]; ok {
			out = append(out, f)
		} else {
			dropped = append(dropped, f)
		}
	}
	if len(dropped) > 0 {
		slog.Debug("minicod: dropped non-allowlisted fields", "dropped", dropped)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// filterPaperFields 论文类端点(search/get/batch/citations/references/authors-papers/
// recommendations)的 fields 白名单过滤。
func filterPaperFields(fields []string) []string { return filterFields(fields, paperFieldAllow) }

// filterAuthorFields 作者类端点(authors/search/get、papers/authors)的 fields 白名单过滤。
func filterAuthorFields(fields []string) []string { return filterFields(fields, authorFieldAllow) }
