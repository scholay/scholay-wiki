// ============================================================================
// Scholay 文献集 · 用户上传 PDF
// ----------------------------------------------------------------------------
// 路由(挂在 /api/v1/user/library/papers/:id/pdf 上):
//
//	POST   /papers/:id/pdf    上传 / 重新上传(multipart/form-data,field=file)
//	GET    /papers/:id/pdf    下载(stream from MinIO,backend 转发,鉴权)
//	DELETE /papers/:id/pdf    撤销上传(同时删 MinIO 对象)
//
// 设计:
//   - object_key 规范:papers/<user_id>/<paper_id>/<sha256>.pdf
//     同 hash 复用,不同 hash 删旧 + 写新(保持单一引用)
//   - 大小上限 50 MiB(超出 413)—— 学术 PDF 几乎不会更大,真有超大需求再放宽
//   - MIME 严格只允许 application/pdf;同时检查首部 magic bytes %PDF-
//     (前端可被绕过,服务端必须自验)
//   - PUT 期间用 streaming(io.TeeReader 边读边算 sha256),不缓全文进内存
// ============================================================================

package library

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PDF 上传约束
const (
	maxPDFSize     int64  = 50 * 1024 * 1024 // 50 MiB
	pdfContentType string = "application/pdf"
	pdfMagicPrefix string = "%PDF-" // PDF 文件前 5 字节
	pdfDownloadTTL        = 10 * time.Minute
)

// objectKeyForPaper 生成 MinIO 对象 key —— 包含 user_id 隔离,避免误删别人的
func objectKeyForPaper(userID, paperRowID uint64, sha256hex string) string {
	return fmt.Sprintf("papers/%d/%d/%s.pdf", userID, paperRowID, sha256hex)
}

// loadOwnedPaper 鉴权辅助 —— 取出当前用户拥有的论文行,不属于该用户则 404
func loadOwnedPaper(c *gin.Context, db *gorm.DB, uid, paperID uint64) (*UserLibraryPaper, bool) {
	var p UserLibraryPaper
	if err := db.Where("id = ? AND user_id = ?", paperID, uid).First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.Error(c, http.StatusNotFound, "论文不存在或无权访问")
		} else {
			utils.Error(c, http.StatusInternalServerError, "查询失败")
		}
		return nil, false
	}
	return &p, true
}

// UploadPDF POST /api/v1/user/library/papers/:id/pdf
//
// multipart/form-data:
//
//	file=<binary>  必填,application/pdf,≤ 50 MiB
//
// 行为:
//  1. 读 file → 缓存到内存(因为要先算 sha256 再 PutObject 给 MinIO,
//     MinIO 单 part 上传要求预知 size)。50MiB 上限保证内存压力可控
//  2. 校验:大小 / Content-Type / magic bytes
//  3. 算 sha256 → object key
//  4. PutObject 到 MinIO
//  5. 旧对象与新对象 key 不同则异步删旧
//  6. 更新 user_library_papers 元数据列
//
// 返回:更新后的 UserLibraryPaper(含 pdf_uploaded_at 等)
func (h *Handler) UploadPDF(c *gin.Context) {
	if !storage.IsEnabled() {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "对象存储未启用,无法上传")
		return
	}

	uid, ok := getUserID(c)
	if !ok {
		return
	}
	paperID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	db := database.GetDB()
	paper, ok := loadOwnedPaper(c, db, uid, paperID)
	if !ok {
		return
	}

	// 限大小 —— Gin 的 MaxMultipartMemory 已经全局设过,但这里再守一道
	if c.Request.ContentLength > maxPDFSize+1<<20 {
		// 容差 1 MiB 用于 multipart 编码 overhead
		utils.ErrorResponse(c, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("文件过大,上限 %d MiB", maxPDFSize/1024/1024))
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "缺少 file 字段或上传中断: "+err.Error())
		return
	}
	if fileHeader.Size > maxPDFSize {
		utils.ErrorResponse(c, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("文件过大(%d 字节),上限 %d MiB", fileHeader.Size, maxPDFSize/1024/1024))
		return
	}
	if fileHeader.Size == 0 {
		utils.Error(c, http.StatusBadRequest, "上传文件为空")
		return
	}

	// 校验扩展名(轻量过滤,真凭 magic bytes 才作数)
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext != ".pdf" {
		utils.Error(c, http.StatusBadRequest, "目前只支持上传 PDF(.pdf)文件")
		return
	}

	// 读全文到内存(50MiB 内可控) —— 同时算 sha256
	src, err := fileHeader.Open()
	if err != nil {
		utils.InternalError(c, 500, "无法读取上传文件", err)
		return
	}
	defer src.Close()

	buf := make([]byte, fileHeader.Size)
	if _, err := io.ReadFull(src, buf); err != nil {
		utils.Error(c, http.StatusBadRequest, "读取上传内容失败: "+err.Error())
		return
	}

	// magic bytes 校验 —— 防止伪装成 .pdf 扩展名的非 PDF
	if len(buf) < len(pdfMagicPrefix) || string(buf[:len(pdfMagicPrefix)]) != pdfMagicPrefix {
		utils.Error(c, http.StatusBadRequest, "文件不是合法的 PDF(magic bytes 校验失败)")
		return
	}

	sum := sha256.Sum256(buf)
	sha := hex.EncodeToString(sum[:])

	bucket := storage.PaperPDFBucket()
	newKey := objectKeyForPaper(uid, paper.ID, sha)

	// 已经是同一 hash → 秒传:不重传对象,只刷新元数据(filename / uploaded_at)
	// 即使 newKey == paper.PdfObjectKey 也不跳过元数据更新 —— 用户可能改了文件名
	if paper.PdfObjectKey != newKey {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		if _, err := storage.PutObject(ctx, bucket, newKey, bytesReader(buf), int64(len(buf)),
			storage.PutOptions{
				ContentType: pdfContentType,
				UserMeta: map[string]string{
					"user-id":  fmt.Sprintf("%d", uid),
					"paper-id": fmt.Sprintf("%d", paper.ID),
				},
			}); err != nil {
			slog.Error("library: PutObject 失败", "err", err, "user_id", uid, "paper_id", paper.ID)
			utils.Error(c, http.StatusInternalServerError, "上传到对象存储失败")
			return
		}
	}

	// 元数据落库 —— 用 Update 而不是 Save 避免覆盖其他列
	now := time.Now()
	updates := map[string]interface{}{
		"pdf_object_key":        newKey,
		"pdf_original_filename": fileHeader.Filename,
		"pdf_size":              fileHeader.Size,
		"pdf_sha256":            sha,
		"pdf_mime":              pdfContentType,
		"pdf_uploaded_at":       now,
	}
	if err := db.Model(&UserLibraryPaper{}).
		Where("id = ? AND user_id = ?", paper.ID, uid).
		Updates(updates).Error; err != nil {
		utils.InternalError(c, 500, "保存元数据失败", err)
		return
	}

	// 旧对象与新 key 不一致 → 异步删旧(失败只记日志,不影响主流程)
	if paper.PdfObjectKey != "" && paper.PdfObjectKey != newKey {
		oldKey := paper.PdfObjectKey
		safego.Go("library-replace-pdf-cleanup", func() {
			ctx, cancel := ctxutil.With(ctxutil.QuickIO)
			defer cancel()
			if err := storage.DeleteObject(ctx, bucket, oldKey); err != nil {
				slog.Warn("library: 清理旧 PDF 对象失败", "err", err, "key", oldKey)
			}
		})
	}

	// 回填新值返回(用户立即看到更新)
	paper.PdfObjectKey = newKey
	paper.PdfOriginalFilename = fileHeader.Filename
	paper.PdfSize = fileHeader.Size
	paper.PdfSHA256 = sha
	paper.PdfMime = pdfContentType
	paper.PdfUploadedAt = &now

	utils.Success(c, paper)
}

// DownloadPDF GET /api/v1/user/library/papers/:id/pdf
//
// 走 backend stream 转发 —— bucket 是私有的,不直接给前端 URL。
// 鉴权:必须是该论文的拥有者(loadOwnedPaper 已做)。
//
// 响应头:
//
//	Content-Type:        application/pdf
//	Content-Length:      <对象大小>
//	Content-Disposition: inline; filename="<原文件名>"
//
// inline(非 attachment)允许浏览器内嵌 PDF.js 预览。
func (h *Handler) DownloadPDF(c *gin.Context) {
	if !storage.IsEnabled() {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "对象存储未启用,无法下载")
		return
	}

	uid, ok := getUserID(c)
	if !ok {
		return
	}
	paperID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	paper, ok := loadOwnedPaper(c, database.GetDB(), uid, paperID)
	if !ok {
		return
	}
	if paper.PdfObjectKey == "" || paper.PdfUploadedAt == nil {
		utils.Error(c, http.StatusNotFound, "尚未上传 PDF")
		return
	}

	bucket := storage.PaperPDFBucket()
	ctx, cancel := context.WithTimeout(c.Request.Context(), pdfDownloadTTL)
	defer cancel()

	reader, info, err := storage.GetObject(ctx, bucket, paper.PdfObjectKey)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			utils.Error(c, http.StatusNotFound, "PDF 对象已被删除")
			return
		}
		slog.Error("library: GetObject 失败", "err", err, "key", paper.PdfObjectKey)
		utils.Error(c, http.StatusInternalServerError, "下载失败")
		return
	}
	defer reader.Close()

	// 文件名做下 ASCII fallback + UTF-8 编码,兼容老浏览器
	filename := paper.PdfOriginalFilename
	if filename == "" {
		filename = "paper.pdf"
	}

	c.Header("Content-Type", pdfContentType)
	c.Header("Content-Length", fmt.Sprintf("%d", info.Size))
	c.Header("Content-Disposition", fmt.Sprintf(
		`inline; filename="paper.pdf"; filename*=UTF-8''%s`,
		urlEscape(filename),
	))
	c.Header("Cache-Control", "private, max-age=0, must-revalidate")

	if _, err := io.Copy(c.Writer, reader); err != nil {
		// 客户端断流是常态,只 debug 日志
		slog.Debug("library: 下载 PDF 流式写入中断", "err", err)
	}
}

// DeletePDF DELETE /api/v1/user/library/papers/:id/pdf
//
// 清理元数据 + 异步删 MinIO 对象。
func (h *Handler) DeletePDF(c *gin.Context) {
	if !storage.IsEnabled() {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "对象存储未启用")
		return
	}

	uid, ok := getUserID(c)
	if !ok {
		return
	}
	paperID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	db := database.GetDB()
	paper, ok := loadOwnedPaper(c, db, uid, paperID)
	if !ok {
		return
	}
	if paper.PdfObjectKey == "" {
		utils.Success(c, gin.H{"deleted": false})
		return
	}

	// 空壳守卫:free 行(未关联上游)若基本信息全空,PDF 是它唯一的内容,
	// 移除后会变成彻底空壳 —— 阻断并引导直接删条目。linked 行不受限。
	if paper.LinkState == LinkStateFree && ogAllEmpty(paper) {
		utils.Error(c, http.StatusBadRequest,
			"移除后该条目将不包含任何信息;如不需要请直接删除该条目")
		return
	}

	if err := db.Model(&UserLibraryPaper{}).
		Where("id = ? AND user_id = ?", paper.ID, uid).
		Updates(map[string]interface{}{
			"pdf_object_key":        "",
			"pdf_original_filename": "",
			"pdf_size":              0,
			"pdf_sha256":            "",
			"pdf_mime":              "",
			"pdf_uploaded_at":       nil,
		}).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "清理元数据失败")
		return
	}

	oldKey := paper.PdfObjectKey
	bucket := storage.PaperPDFBucket()
	safego.Go("library-delete-pdf-cleanup", func() {
		ctx, cancel := ctxutil.With(ctxutil.QuickIO)
		defer cancel()
		if err := storage.DeleteObject(ctx, bucket, oldKey); err != nil {
			slog.Warn("library: DeletePDF 清理对象失败", "err", err, "key", oldKey)
		}
	})

	utils.Success(c, gin.H{"deleted": true})
}

// ============================================================================
// 工具
// ============================================================================

// bytesReader 把 []byte 包成 io.Reader,避免直接引 bytes.NewReader
// (减少 imports 噪声)。
type bytesReaderImpl struct {
	b []byte
	i int
}

func bytesReader(b []byte) io.Reader { return &bytesReaderImpl{b: b} }

func (r *bytesReaderImpl) Read(p []byte) (int, error) {
	if r.i >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.i:])
	r.i += n
	return n, nil
}

// urlEscape 按 RFC 5987 把 filename* 段做 percent-encoding
// —— 不引入 net/url 是为了精确控制需要转义的字符集(空格 + 特殊符号)
func urlEscape(s string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	b.Grow(len(s) * 2)
	for i := 0; i < len(s); i++ {
		c := s[i]
		// 仅保留 attr-char 集合(RFC 5987):字母数字 + ! # $ & + - . ^ _ ` | ~
		if (c >= '0' && c <= '9') ||
			(c >= 'A' && c <= 'Z') ||
			(c >= 'a' && c <= 'z') ||
			c == '!' || c == '#' || c == '$' || c == '&' || c == '+' ||
			c == '-' || c == '.' || c == '^' || c == '_' || c == '`' ||
			c == '|' || c == '~' {
			b.WriteByte(c)
			continue
		}
		b.WriteByte('%')
		b.WriteByte(hex[c>>4])
		b.WriteByte(hex[c&0xF])
	}
	return b.String()
}
