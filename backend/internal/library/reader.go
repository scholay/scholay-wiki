// ============================================================================
// library.Reader —— 只读跨模块访问器。
//
// 给其它模块(如 claw 智能助手「引用文献」)读取用户文献集数据用,不暴露写能力。
// library 本身没有 repo/service 分层(handler 直接 GORM),这里集中只读查询 + PDF 取流,
// 避免别的包到处手抄 user_library_papers 的查询与鉴权(必带 user_id 归属)。
// ============================================================================

package library

import (
	"context"
	"errors"
	"io"
	"strings"

	"gorm.io/gorm"

	"scholar-backend/internal/storage"
)

// Reader 只读访问用户文献集(papers / folders / 用户上传 PDF)。
type Reader struct {
	db *gorm.DB
}

func NewReader(db *gorm.DB) *Reader { return &Reader{db: db} }

// PapersByIDs 按行 ID 批量取**属于该用户**的论文(越权的 id 自然被 user_id 过滤掉)。
// 不保证返回顺序;调用方需要原序自行按 ids 重排。
func (r *Reader) PapersByIDs(userID uint64, ids []uint64) ([]UserLibraryPaper, error) {
	if r == nil || r.db == nil || len(ids) == 0 {
		return nil, nil
	}
	var ps []UserLibraryPaper
	err := r.db.Where("user_id = ? AND id IN ?", userID, ids).Find(&ps).Error
	return ps, err
}

// FolderByID 取属于该用户的文件夹(用于拿名字)。不存在 / 越权 → (nil, nil)。
func (r *Reader) FolderByID(userID, folderID uint64) (*UserLibraryFolder, error) {
	if r == nil || r.db == nil {
		return nil, nil
	}
	var f UserLibraryFolder
	err := r.db.Where("user_id = ? AND id = ?", userID, folderID).First(&f).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// FolderPapers 取文件夹内属于该用户的论文(新→旧),最多 limit 篇;total 是该文件夹实际总数
// (供调用方判断是否被截断)。limit<=0 不取明细只回 total。
func (r *Reader) FolderPapers(userID, folderID uint64, limit int) (papers []UserLibraryPaper, total int64, err error) {
	if r == nil || r.db == nil {
		return nil, 0, nil
	}
	q := r.db.Model(&UserLibraryPaper{}).Where("user_id = ? AND folder_id = ?", userID, folderID)
	if err = q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if limit <= 0 {
		return nil, total, nil
	}
	err = q.Order("created_at DESC").Limit(limit).Find(&papers).Error
	return papers, total, err
}

// CitePaper 精简论文行 —— 只含生成 BibTeX / cite key 所需列(prism \cite 消费)。
// ⚠️ 字段形状(含 ID 用 uint)逐字段对齐 prism 历史 libRow:prism 的 citeKey 由
// (第一作者姓氏, 年份, ID) 确定性生成,形状/语义变了会破坏已生成的 references.bib。
type CitePaper struct {
	ID          uint
	Title       string
	AuthorsJSON []byte `gorm:"column:authors_json"`
	Year        *uint16
	Venue       string
	DOI         string
}

// citePaperColumns 与 CitePaper 字段一一对应的 SELECT 列(集中一处,防止漂移)。
const citePaperColumns = "id, title, authors_json, year, venue, doi"

// SearchCitePapers 在用户文献集里按关键词 LIKE 检索(title/venue/doi 三列,通配符转义),
// 只返属于该用户的真实库行 —— prism \cite 反幻觉的根。query 为空 → 直接返回该用户
// 按年份新→旧的前 limit 篇;limit 越界(<=0 或 >50)钳到 20。
func (r *Reader) SearchCitePapers(userID uint64, query string, limit int) ([]CitePaper, error) {
	if r == nil || r.db == nil {
		return nil, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	q := r.db.Model(&UserLibraryPaper{}).
		Select(citePaperColumns).
		Where("user_id = ?", userID)
	if s := strings.TrimSpace(query); s != "" {
		esc := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
		if len(esc) > 100 {
			esc = esc[:100]
		}
		like := "%" + esc + "%"
		q = q.Where("title LIKE ? ESCAPE '\\\\' OR venue LIKE ? ESCAPE '\\\\' OR doi LIKE ? ESCAPE '\\\\'", like, like, like)
	}
	var rows []CitePaper
	err := q.Order("year DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

// CitePaperByID 取某条属于该用户的库论文(prism cite apply 用,user_id 归属校验)。
// 不存在 / 越权 → (nil, nil),约定同 FolderByID。
func (r *Reader) CitePaperByID(userID, paperID uint64) (*CitePaper, error) {
	if r == nil || r.db == nil {
		return nil, nil
	}
	var row CitePaper
	err := r.db.Model(&UserLibraryPaper{}).
		Select(citePaperColumns).
		Where("id = ? AND user_id = ?", paperID, userID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// OpenPDF 取用户为该论文上传的 PDF 流(MinIO)。没有用户 PDF / 存储未启用 → (nil, nil)。
// 注意:pdf_url(上游 OA 直链)不在此 —— 那是链接不是用户文件,调用方按需另处理。
// 返回的 ReadCloser 由调用方负责 Close。
func (r *Reader) OpenPDF(ctx context.Context, p *UserLibraryPaper) (io.ReadCloser, error) {
	if p == nil || p.PdfObjectKey == "" || p.PdfUploadedAt == nil || !storage.IsEnabled() {
		return nil, nil
	}
	rc, _, err := storage.GetObject(ctx, storage.PaperPDFBucket(), p.PdfObjectKey)
	if err != nil {
		return nil, err
	}
	return rc, nil
}
