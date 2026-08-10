// ============================================================================
// Slug 生成 —— 把论文标题 + paperId 压缩为 URL 安全的短字符串
// 设计要点：
//   1. 保留 Unicode 字母 + 数字（含中文），其它全部压成 "-"
//      —— 浏览器/Google 会自动 percent-encode 中文字符，不影响抓取
//   2. 保留 paperId 末 8 位哈希作为消歧后缀（防止同标题冲突）
//   3. 长度上限按 rune 数（maxSlugBaseRunes），避免 byte 切片截断 UTF-8 中间
// ============================================================================

package seo

import (
	"crypto/sha1"
	"encoding/hex"
	"strings"
	"unicode"
)

// 论文来源常量。和 minicod.SourceSTC / SourceOLX 字面量一致，
// 但 seo 包不反向依赖 minicod，在此独立声明。
const (
	SourceSTC = "stc"
	SourceOLX = "olx"
	SourcePMD = "pmd"
)

// IsCanonicalSource 只允许公开 URL / sitemap 协议中已定义的来源枚举。
// source 会进入 canonical path，不能把 URL 或公开 expose API 中的任意字符串当作真源。
func IsCanonicalSource(source string) bool {
	switch source {
	case SourceSTC, SourceOLX, SourcePMD:
		return true
	default:
		return false
	}
}

// InferSource 按已归一的 entity ID 前缀推断来源。非 STC 的 ID 在 minicod
// 输出边界会带 olx:/pmd: 前缀，因此 ID 比浏览器传入的 source 可靠。
func InferSource(paperID string) string {
	switch {
	case strings.HasPrefix(paperID, SourceOLX+":"):
		return SourceOLX
	case strings.HasPrefix(paperID, SourcePMD+":"):
		return SourcePMD
	case strings.HasPrefix(paperID, "pubmed:"):
		return SourcePMD
	default:
		return SourceSTC
	}
}

// AuthoritativeSource 优先使用上游返回的受控 source；上游未回传时再由
// 已归一 ID 推断。调用方不得把请求 URL 中的 source 传到这里当真源。
func AuthoritativeSource(upstreamSource, entityID string) string {
	upstreamSource = strings.ToLower(strings.TrimSpace(upstreamSource))
	if IsCanonicalSource(upstreamSource) {
		return upstreamSource
	}
	return InferSource(strings.TrimSpace(entityID))
}

// slug base 的 rune 数上限。DB 列是 VARCHAR(200)，utf8mb4 下中文每字符 3~4 字节
// 取 80 runes ≈ 最多 320 字节，给 `-` + 8 字符 hash 后缀留足余量。
const maxSlugBaseRunes = 80

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

// slugifyBase 把 title 转为 URL-safe slug（保留 Unicode 字母/数字，其它压 "-"）
func slugifyBase(s string) string {
	s = strings.ToLower(s)

	// 单次遍历：把非字母/数字字符折叠成 "-"，连续 "-" 合并
	var b strings.Builder
	b.Grow(len(s))
	prevDash := true // 句首视为刚刚放过 dash，避免前导 "-"
	runeCount := 0
	for _, r := range s {
		if runeCount >= maxSlugBaseRunes {
			break
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevDash = false
			runeCount++
			continue
		}
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
			runeCount++
		}
	}

	return strings.Trim(b.String(), "-")
}

// paperIDSuffix 从 paperId 里派生 8 字符稳定后缀（sha1 前 8 hex）
// 用 hash 而非 paperId 原文：paperId 可能含特殊字符，并且可能较长。
func paperIDSuffix(paperID string) string {
	h := sha1.Sum([]byte(paperID))
	return hex.EncodeToString(h[:])[:8]
}
