// ============================================================================
// agentattach — upload.go 类型嗅探纯逻辑测试(随实现从 internal/claw 迁入)。
// 覆盖 HandleUpload 分类用到的谓词:
// isImage/isPDF/isPlainText/isOffice/normalizeImageMime + SVG 拒绝的优先级语义。
// (大小限制 / OwnsSession 分支依赖 FeatureBridge, 留给 E2E harness。)
// ============================================================================

package agentattach

import "testing"

func TestUploadTypeSniffing(t *testing.T) {
	// 图片
	if !isImage("image/png", ".png") {
		t.Error("image/png 应判为 image")
	}
	if !isImage("application/octet-stream", ".png") {
		t.Error(".png 扩展名应判为 image")
	}
	if isImage("", "") {
		t.Error("空 mime/ext 不应判为 image")
	}
	if got := normalizeImageMime("", ".jpg"); got != "image/jpeg" {
		t.Errorf("normalizeImageMime .jpg = %q; want image/jpeg", got)
	}
	if got := normalizeImageMime("image/webp", ".webp"); got != "image/webp" {
		t.Errorf("normalizeImageMime keeps mime = %q", got)
	}

	// PDF
	if !isPDF("application/pdf", ".pdf") || !isPDF("", ".pdf") {
		t.Error("pdf 嗅探失败")
	}

	// 文本类
	if !isPlainText("text/csv", ".csv") {
		t.Error("text/csv 应判为文本")
	}
	if !isPlainText("application/json", ".json") {
		t.Error("application/json 应判为文本")
	}
	if !isPlainText("", ".bib") {
		t.Error(".bib 扩展名应判为文本")
	}

	// Office 二进制 (仅收 agent 端 ReadDocument 真能读的: docx/xlsx/pptx/odt/rtf)
	if !isOffice("application/octet-stream", ".docx") {
		t.Error(".docx 应判为 office")
	}
	if !isOffice("", ".xlsx") || !isOffice("", ".pptx") {
		t.Error(".xlsx/.pptx 应判为 office")
	}

	// 旧版/无解析器格式 → 扩展名 guard 命中 (入口拒收, 引导另存为新格式)
	if !isLegacyOfficeExt(".doc") || !isLegacyOfficeExt(".xls") || !isLegacyOfficeExt(".ppt") ||
		!isLegacyOfficeExt(".ods") || !isLegacyOfficeExt(".odp") {
		t.Error("legacy office 扩展名应命中 isLegacyOfficeExt")
	}
	if isOffice("", ".doc") || isOffice("", ".xls") || isOffice("", ".ods") {
		t.Error("legacy office 不应再命中 isOffice (2026-07 收=能读原则)")
	}
	// ⚠️ 审查修正回归位: legacy mime 绝不能压过受支持扩展名 —— Windows 装 Excel/WPS 后
	// .csv 会带 application/vnd.ms-excel、.docx 会带 application/msword。
	if isLegacyOfficeExt(".csv") || isLegacyOfficeExt(".docx") {
		t.Error("受支持扩展名不得被判为 legacy")
	}
	if !isPlainText("application/vnd.ms-excel", ".csv") {
		t.Error(".csv + ms-excel mime 应仍按纯文本收 (Windows 注册表 mime 场景)")
	}
	if !isOffice("application/msword", ".docx") {
		t.Error(".docx + msword mime 应仍按 office 收")
	}
	if !isLegacyOfficeMime("application/vnd.ms-excel") || isLegacyOfficeMime("text/csv") {
		t.Error("isLegacyOfficeMime 兜底判定失准")
	}

	// BMP / 超 vision 白名单图片: 不判 image (入口专门拒收或转格式指引)
	if isImage("", ".bmp") || isImage("image/tiff", "") || isImage("image/heic", "") {
		t.Error("bmp/tiff/heic 不应判为 image (vision 嵌不进, 上传口拒收)")
	}
	if !isUnsupportedImageMime("image/tiff") || isUnsupportedImageMime("image/png") || isUnsupportedImageMime("text/plain") {
		t.Error("isUnsupportedImageMime 判定失准")
	}
	if got := normalizeImageMime("image/jpg", ".jpg"); got != "image/jpeg" {
		t.Errorf("image/jpg 应归一为 image/jpeg, got %q", got)
	}

	// 未知类型 → 全部 false (handler 默认拒绝)
	if isImage("", ".exe") || isPDF("", ".exe") || isPlainText("", ".exe") || isOffice("", ".exe") || isLegacyOfficeExt(".exe") {
		t.Error(".exe 不应命中任何类别 (应被默认拒绝)")
	}

	// SVG: 专门 guard (ext==.svg || mime==image/svg+xml) 在所有分类之前拦截;
	// isImage 收窄到 vision mime 白名单后对 svg 也是 false (双保险)。
	if isImage("image/svg+xml", ".svg") {
		t.Error("isImage 不应再放行 svg (vision 白名单收窄)")
	}
}
