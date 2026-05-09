// ============================================================================
// 作者 slug 生成 —— 与论文 slug 同构: slugify(name) + "-" + sha1(authorID)[:8]
// 设计要点见 slug.go；这里独立出来是为了把"输入是 name 还是 title"的语义区分开。
// ============================================================================

package seo

// GenerateAuthorSlug 由 name + authorID 生成 URL slug
// authorID 用作消歧后缀，保证同名作者也能区分。
func GenerateAuthorSlug(name, authorID string) string {
	base := slugifyBase(name)
	suffix := paperIDSuffix(authorID)
	if base == "" {
		return suffix
	}
	return base + "-" + suffix
}

// InferAuthorSource 按 authorID 形态推断来源：`olx:` 开头 → OpenAlex；否则 → Semantic Scholar。
// 与 InferSource 区分仅是为了语义清晰；逻辑相同。
func InferAuthorSource(authorID string) string {
	return InferSource(authorID)
}
