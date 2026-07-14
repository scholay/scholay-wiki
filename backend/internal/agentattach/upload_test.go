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

	// Office 二进制
	if !isOffice("application/octet-stream", ".docx") {
		t.Error(".docx 应判为 office")
	}
	if !isOffice("application/vnd.ms-excel", ".xls") {
		t.Error("xls mime 应判为 office")
	}

	// 未知类型 → 全部 false (handler 默认拒绝)
	if isImage("", ".exe") || isPDF("", ".exe") || isPlainText("", ".exe") || isOffice("", ".exe") {
		t.Error(".exe 不应命中任何类别 (应被默认拒绝)")
	}

	// SVG 优先级语义: isImage 因 mime 前缀对 svg 返回 true; 真正拦截 svg 的是
	// parseAndValidateUpload 顶部那条专门 guard (ext==.svg || mime==image/svg+xml), 在 isImage 之前执行。
	if !isImage("image/svg+xml", ".svg") {
		t.Error("isImage 对 svg 返回 true —— 记录: SVG 由专门 guard 拦截, 不是靠 isImage")
	}
}
