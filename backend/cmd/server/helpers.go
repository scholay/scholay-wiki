// ============================================================================
// Scholay学术 V1.0
// 辅助工具函数
// ============================================================================

package main

import "strings"

// isStaticAsset 检查路径是否为静态资源（应由前端容器处理）
func isStaticAsset(path string) bool {
	staticExtensions := []string{
		".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
		".woff", ".woff2", ".ttf", ".eot", ".otf",
		".map", ".json", ".txt", ".xml", ".webp",
		".mp3", ".mp4", ".webm", ".ogg", ".wav",
		".pdf", ".zip", ".bcmap",
	}

	pathLower := strings.ToLower(path)
	for _, ext := range staticExtensions {
		if strings.HasSuffix(pathLower, ext) {
			return true
		}
	}

	if strings.HasPrefix(path, "/static/") ||
		strings.HasPrefix(path, "/assets/") ||
		strings.HasPrefix(path, "/fonts/") ||
		strings.HasPrefix(path, "/images/") ||
		strings.HasPrefix(path, "/favicon") ||
		strings.HasPrefix(path, "/manifest") ||
		strings.HasPrefix(path, "/robots") ||
		strings.HasPrefix(path, "/sitemap") {
		return true
	}

	return false
}
