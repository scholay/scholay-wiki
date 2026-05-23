// ============================================================================
// Journal Slug 生成 —— canonical_name 转为 URL-safe slug, 用作 /journal/{id}/{slug} 后缀
//
// 设计:
//   - canonical_name 经 slugifyBase 折叠成 URL-safe (复用 slug.go 的实现)
//   - 不附加 hash 后缀: id 已在 URL 主路径里担任消歧, slug 纯粹是 SEO 关键词
//   - 空 canonical_name 时返回 "" (handler 会跳过写入 slug, 老行会保留之前的值)
// ============================================================================

package seo

// GenerateJournalSlug canonical_name → URL-safe slug
//
// 与 paper/author slug 不同: 不带 hash 后缀 (journal_id 已经在 URL 路径里做消歧)。
// 返回 "" 表示无法生成 (上游 canonical_name 全是非字母数字字符)。
func GenerateJournalSlug(canonicalName string) string {
	return slugifyBase(canonicalName)
}
