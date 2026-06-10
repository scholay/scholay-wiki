// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

// GenerateCacheKey generates a cache key from query parameters.
// Uses MD5 hash of parameters for consistent key generation.
//
// ⚠️ 历史 Bug：之前用 `fmt.Sprintf("%v", params)`，Go map 迭代顺序是随机的 →
// 同一组参数会生成不同 key，导致 cache 近乎永不命中。这里显式按 key 字典序排序后再哈希，
// 保证 {"a":1,"b":2} 与 {"b":2,"a":1} 命中同一条 cache。
//
// (从已删除的 semantic_scholar.go 迁出 —— 该文件其余 Semantic Scholar 专用缓存 helper
// 自集成下线后已无任何调用方,仅本函数仍被 minicod 使用。)
func GenerateCacheKey(prefix string, params map[string]any) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('|')
		}
		b.WriteString(k)
		b.WriteByte('=')
		fmt.Fprintf(&b, "%v", params[k])
	}

	hash := md5.Sum([]byte(b.String()))
	hashStr := hex.EncodeToString(hash[:])

	return fmt.Sprintf("%s:%s", prefix, hashStr)
}
