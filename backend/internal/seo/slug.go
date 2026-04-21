// ============================================================================
// Slug 生成 —— 把论文标题 + paperId 压缩为 URL 安全的短字符串
// 设计要点：
//   1. 仅保留 ASCII [a-z0-9-]，非 ASCII 字符（如中文）直接丢弃（标题多为英文）
//   2. 保留 paperId 末 8 位哈希作为消歧后缀（防止同标题冲突）
//   3. 长度上限 160（留给唯一后缀和路径前缀）
// ============================================================================

package seo

import (
	"crypto/sha1"
	"encoding/hex"
	"regexp"
	"strings"
)

// 论文来源常量。和 minicod.SourceSTC / SourceOLX 字面量一致，
// 但 seo 包不反向依赖 minicod，在此独立声明。
const (
	SourceSTC = "stc"
	SourceOLX = "olx"
)

// InferSource 按 paperId 前缀推断来源：`olx:` 开头 → OpenAlex；否则 → Semantic Scholar。
// 两个源的 ID 形态是唯一可靠信号（前端 localStorage 里的 search_source 可能与真实命中源不一致）。
func InferSource(paperID string) string {
	if strings.HasPrefix(paperID, "olx:") {
		return SourceOLX
	}
	return SourceSTC
}

const maxSlugBase = 120

var (
	reNonSlug = regexp.MustCompile(`[^a-z0-9]+`)
	reMulti   = regexp.MustCompile(`-+`)
)

// GenerateSlug 由 title + paperID 生成 URL slug（返回值保证全局稳定性：同输入同输出）
// paperID 用作消歧后缀，保证即使标题相同也能区分。
func GenerateSlug(title, paperID string) string {
	base := slugifyBase(title)
	suffix := paperIDSuffix(paperID)
	if base == "" {
		return suffix
	}
	return base + "-" + suffix
}

// slugifyBase 把 title 转为 ascii slug，丢弃非 ascii，截断至 maxSlugBase
func slugifyBase(s string) string {
	s = strings.ToLower(s)
	s = reNonSlug.ReplaceAllString(s, "-")
	s = reMulti.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > maxSlugBase {
		s = s[:maxSlugBase]
		s = strings.TrimRight(s, "-")
	}
	return s
}

// paperIDSuffix 从 paperId 里派生 8 字符稳定后缀（sha1 前 8 hex）
// 用 hash 而非 paperId 原文：paperId 可能含特殊字符，并且可能较长。
func paperIDSuffix(paperID string) string {
	h := sha1.Sum([]byte(paperID))
	return hex.EncodeToString(h[:])[:8]
}
