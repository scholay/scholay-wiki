// ============================================================================
// Prism 文件 CRUD —— 新建 / 重命名 / 删除(多文件创作)。
// 文本文件(.tex/.bib/.sty/.cls)的元操作;真源仍在 DB(prism_files + 版本表)。
// ============================================================================

package prism

import (
	"errors"
	"strings"

	"github.com/go-sql-driver/mysql"
)

// isDuplicateKey 判断是否 MySQL 唯一键冲突(1062);把 check→insert 的 TOCTOU 竞态下的
// 插入失败翻成友好的 ErrFileExists,而非 500(review F7)。
func isDuplicateKey(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && me.Number == 1062
}

func isTextExt(p string) bool {
	for _, ext := range []string{".tex", ".bib", ".sty", ".cls"} {
		if strings.HasSuffix(p, ext) {
			return true
		}
	}
	return false
}

func kindFromPath(p string) string {
	switch {
	case strings.HasSuffix(p, ".bib"):
		return KindBib
	case strings.HasSuffix(p, ".sty"):
		return KindSty
	case strings.HasSuffix(p, ".cls"):
		return KindCls
	default:
		return KindTex
	}
}

func mimeFor(p string) string {
	if strings.HasSuffix(p, ".bib") {
		return "text/x-bibtex"
	}
	return "text/x-tex"
}

// CreateTextFile 在项目里新建一个空文本文件(.tex/.bib/.sty/.cls)。
func (s *Service) CreateTextFile(projectID uint, relPath string) (*File, error) {
	clean, ok := safeRel(relPath)
	if !ok || !isTextExt(clean) {
		return nil, ErrInvalidPath
	}
	existing, err := s.repo.GetFileByPath(projectID, clean)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrFileExists
	}
	f := &File{ProjectID: projectID, RelPath: clean, FileKind: kindFromPath(clean), Mime: mimeFor(clean)}
	if err := s.repo.CreateFile(f); err != nil {
		if isDuplicateKey(err) { // 并发同名创建 → 唯一索引兜底,翻成友好提示
			return nil, ErrFileExists
		}
		return nil, err
	}
	if _, err := s.repo.AppendCurrentVersion(f.ID, "", sha256Hex(""), AuthorUser, nil); err != nil {
		return nil, err
	}
	_ = s.repo.TouchProject(projectID)
	return f, nil
}

// RenameFile 改文件相对路径;若改的是入口主文件,在**同一事务**内同步 project.main_file。
// proj 由 handler 的 ownedProject 解析后传入(避免二次查库 + 「查库报错被吞 → 主文件保护被绕过」窗口,review F4)。
func (s *Service) RenameFile(proj *Project, fileID uint, newRelPath string) (*File, error) {
	f, err := s.repo.GetFileInProject(proj.ID, fileID)
	if err != nil {
		return nil, err
	}
	if f == nil {
		return nil, ErrFileNotFound
	}
	clean, ok := safeRel(newRelPath)
	if !ok || !isTextExt(clean) {
		return nil, ErrInvalidPath
	}
	if clean == f.RelPath {
		return f, nil
	}
	ex, err := s.repo.GetFileByPath(proj.ID, clean)
	if err != nil {
		return nil, err
	}
	if ex != nil {
		return nil, ErrFileExists
	}
	updateMain := proj.MainFile == f.RelPath
	if err := s.repo.RenameFileTx(fileID, proj.ID, clean, updateMain); err != nil {
		if isDuplicateKey(err) { // 与 check 之间的竞态 → 唯一索引兜底
			return nil, ErrFileExists
		}
		return nil, err
	}
	_ = s.repo.TouchProject(proj.ID)
	f.RelPath = clean
	f.FileKind = kindFromPath(clean)
	return f, nil
}

// DeleteFile 删文件(禁止删入口主文件)。proj 由 handler 传入(同 RenameFile,消除查库吞错窗口)。
func (s *Service) DeleteFile(proj *Project, fileID uint) error {
	f, err := s.repo.GetFileInProject(proj.ID, fileID)
	if err != nil {
		return err
	}
	if f == nil {
		return ErrFileNotFound
	}
	if proj.MainFile == f.RelPath {
		return ErrCannotDeleteMain
	}
	if err := s.repo.DeleteFile(fileID); err != nil {
		return err
	}
	_ = s.repo.TouchProject(proj.ID)
	return nil
}
