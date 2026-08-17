// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// ssr_link_frontier.go —— 「抓取前沿止步于落地库」。
//
// 实体详情页的静态兜底正文会把上游元数据里的关联实体渲染成站内链接:
// 论文页 → 3~8 条作者链接;作者页 → 最多 25 条代表作链接。这些 ID 直接来自上游
// (authors_json / top_works),其中绝大多数在 seo_authors / seo_papers 里**没有行**。
//
// 后果不是「多几个 404」,是自激扩散:爬虫沿链接抓到未落地 URL → 触发 on-miss 现拉 →
// 建行 + 渲染出更多未落地链接 → 继续爬。生产 24h 实测:新建 4.5 万论文行 + 7.4 万作者行,
// 待补全积压 145k/148k 且在涨,上游调用 12 万次/天。链接图的边界就是抓取预算的边界。
//
// 因此渲染前批量核对一次「哪些已落地」,未落地的降级成纯文本(内容一字不少,只是不可点)。
// 代价是每个实体页多一次走唯一索引的 IN 查询;列表为空时整个跳过。
//
// ⚠️ 期刊页的「本刊近期代表论文」/「同学科期刊」不走这里 —— 它们由
// seo.Repository.ListPapersByVenueForSSR / 同学科查询从**自己库里**选出来,
// 构造上就已闭合,再核对一次纯属浪费。
package config

import (
	"log/slog"

	"scholar-backend/internal/seo"
)

// frontierBatchLimit 单页最多核对的实体数。论文作者列表最多链 12 条、作者代表作最多 25 条,
// 上限只是防上游给出异常长列表时把 IN 查询撑爆。
const frontierBatchLimit = 64

// closePaperAuthorFrontier 返回一份副本:未落地的作者 ID 被清空 ——
// buildPaperAuthorsHTML 见到空 AuthorID 就渲染成纯文本姓名,链接自然消失。
//
// provider 未实现可选接口或查询失败时保持原样(宁可多几条链接,也不要因为一次 DB 抖动
// 就把整页内链抹掉 —— 那会让已收录页面的链接图在故障期间凭空断裂)。
func (h *Handler) closePaperAuthorFrontier(meta *seo.PaperSSRMeta) *seo.PaperSSRMeta {
	if meta == nil || len(meta.AuthorRefs) == 0 {
		return meta
	}
	corpus, ok := h.authorSEOProvider.(AuthorCorpusProvider)
	if !ok {
		return meta
	}
	ids := make([]string, 0, len(meta.AuthorRefs))
	for _, au := range meta.AuthorRefs {
		if au.AuthorID != "" {
			ids = append(ids, au.AuthorID)
		}
	}
	if len(ids) == 0 {
		return meta
	}
	if len(ids) > frontierBatchLimit {
		ids = ids[:frontierBatchLimit]
	}
	existing, err := corpus.ExistingAuthorIDs(ids)
	if err != nil {
		slog.Warn("ssr link frontier: author existence check failed", "paper_id", meta.PaperID, "err", err)
		return meta
	}
	out := *meta
	out.AuthorRefs = make([]seo.Author, len(meta.AuthorRefs))
	copy(out.AuthorRefs, meta.AuthorRefs)
	for i := range out.AuthorRefs {
		if !existing[out.AuthorRefs[i].AuthorID] {
			out.AuthorRefs[i].AuthorID = ""
		}
	}
	return &out
}

// closeAuthorWorkFrontier 同上,作者页的代表作方向:未落地的论文清掉 Source/PaperID,
// 于是 buildWorksListHTML 渲染成无链接的 <li>,buildAuthorJSONLD 的 hasPart 也不再带 url
// (JSON-LD 里的 url 同样是爬虫会跟的边)。标题/年份/被引等内容完全保留。
func (h *Handler) closeAuthorWorkFrontier(meta *seo.AuthorSSRMeta) *seo.AuthorSSRMeta {
	if meta == nil || len(meta.Works) == 0 {
		return meta
	}
	corpus, ok := h.paperSEOProvider.(PaperCorpusProvider)
	if !ok {
		return meta
	}
	ids := make([]string, 0, len(meta.Works))
	for _, w := range meta.Works {
		if w.PaperID != "" {
			ids = append(ids, w.PaperID)
		}
	}
	if len(ids) == 0 {
		return meta
	}
	if len(ids) > frontierBatchLimit {
		ids = ids[:frontierBatchLimit]
	}
	existing, err := corpus.ExistingPaperIDs(ids)
	if err != nil {
		slog.Warn("ssr link frontier: paper existence check failed", "author_id", meta.AuthorID, "err", err)
		return meta
	}
	out := *meta
	out.Works = make([]seo.AuthorWork, len(meta.Works))
	copy(out.Works, meta.Works)
	for i := range out.Works {
		if !existing[out.Works[i].PaperID] {
			out.Works[i].Source = ""
			out.Works[i].PaperID = ""
		}
	}
	return &out
}
