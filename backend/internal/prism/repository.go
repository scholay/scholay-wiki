package prism

import (
	"errors"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/library"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// AfterFind 给查出的 Project 填充计算字段 read_only —— 前端据此决定旧版工作台是否只读。
// GORM 在 First/Find 后自动回调,GetProject / ListProjects / GetProjectBySession 都覆盖到。
func (p *Project) AfterFind(*gorm.DB) error {
	p.ReadOnlyFlag = p.ReadOnly()
	return nil
}

// ─── 项目 ────────────────────────────────────────────────────────────────

func (r *Repository) CreateProject(p *Project) error { return r.db.Create(p).Error }

// GetProject 取项目并校验归属;不存在/非本人 → (nil, nil)。
func (r *Repository) GetProject(id, userID uint) (*Project, error) {
	var p Project
	err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) ListProjects(userID uint) ([]Project, error) {
	var ps []Project
	err := r.db.Where("user_id = ?", userID).Order("updated_at DESC").Find(&ps).Error
	return ps, err
}

// GetProjectByID 按 id 取项目(内部用,不校验归属;调用方须已鉴权)。用于轮次流里判 schema_version。
func (r *Repository) GetProjectByID(id uint) (*Project, error) {
	var p Project
	if err := r.db.Where("id = ?", id).First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

// UpdateProjectTitle 改项目标题(调用方已校验归属 + 非空)。
func (r *Repository) UpdateProjectTitle(id uint, title string) error {
	return r.db.Model(&Project{}).Where("id = ?", id).Updates(map[string]any{
		"title": title, "updated_at": time.Now(),
	}).Error
}

// UpdateProjectTitleIfDefault 仅当标题仍是默认占位时才写入(自动命名用)。
// 单条条件 UPDATE → 幂等 + 永不覆盖用户已改/已自动命名的名字,且与并发手动重命名无 read-modify-write 竞态。
// 返回是否命中(false=标题已非默认,自动命名跳过)。
func (r *Repository) UpdateProjectTitleIfDefault(id uint, defaultTitle, title string) (bool, error) {
	res := r.db.Model(&Project{}).
		Where("id = ? AND title = ?", id, defaultTitle).
		Update("title", title)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

// CompileObjectKeys 取项目全部编译产物 pdf/log 的 MinIO key(删项目前清对象用)。
func (r *Repository) CompileObjectKeys(projectID uint) ([]string, error) {
	var cs []Compile
	if err := r.db.Select("pdf_object_key, log_object_key").Where("project_id = ?", projectID).Find(&cs).Error; err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(cs)*2)
	for _, c := range cs {
		if c.PdfObjectKey != nil && *c.PdfObjectKey != "" {
			keys = append(keys, *c.PdfObjectKey)
		}
		if c.LogObjectKey != nil && *c.LogObjectKey != "" {
			keys = append(keys, *c.LogObjectKey)
		}
	}
	return keys, nil
}

// DeleteProjectCascade 事务删项目 + 全部子表(版本/文件/编译/编辑/对话);DB 真源一次清干净。
func (r *Repository) DeleteProjectCascade(projectID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var fileIDs []uint
		if err := tx.Model(&File{}).Where("project_id = ?", projectID).Pluck("id", &fileIDs).Error; err != nil {
			return err
		}
		if len(fileIDs) > 0 {
			if err := tx.Where("file_id IN ?", fileIDs).Delete(&FileVersion{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("project_id = ?", projectID).Delete(&File{}).Error; err != nil {
			return err
		}
		if err := tx.Where("project_id = ?", projectID).Delete(&Compile{}).Error; err != nil {
			return err
		}
		if err := tx.Where("project_id = ?", projectID).Delete(&Edit{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", projectID).Delete(&Project{}).Error
	})
}

func (r *Repository) TouchProject(id uint) error {
	return r.db.Model(&Project{}).Where("id = ?", id).Update("updated_at", time.Now()).Error
}

// SetWritingProfile 写项目写作画像 JSON(Phase 2:base 文体/学科人格 + genre + source + needs_refine)。
func (r *Repository) SetWritingProfile(id uint, profileJSON string) error {
	return r.db.Model(&Project{}).Where("id = ?", id).Update("writing_profile", profileJSON).Error
}

// SetTerminology 写项目术语表真源(V4-④:markdown 文本;轮末从 cwd terminology.md 回收)。
func (r *Repository) SetTerminology(id uint, md string) error {
	return r.db.Model(&Project{}).Where("id = ?", id).Update("terminology", md).Error
}

// SetProjectSession 写项目的 agent 会话 id(每项目独立会话;""=清空让下次重建)。
func (r *Repository) SetProjectSession(id uint, sessionID string) error {
	var v any
	if sessionID == "" {
		v = nil
	} else {
		v = sessionID
	}
	return r.db.Model(&Project{}).Where("id = ?", id).Update("agent_session_id", v).Error
}

// ClaimProjectSession 原子认领项目会话:仅当当前为空(NULL/”)时写入。
// 返回 true=认领成功;false=已被并发请求抢先(调用方应删掉本次多建的会话,改用既存的)。
// 这是跨进程也成立的并发兜底;同进程的并发由 Service 的 per-project 锁先行串行化。
func (r *Repository) ClaimProjectSession(id uint, sessionID string) (bool, error) {
	res := r.db.Model(&Project{}).
		Where("id = ? AND (agent_session_id IS NULL OR agent_session_id = '')", id).
		Update("agent_session_id", sessionID)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

// GetProjectSession 取项目当前 agent 会话 id(认领竞态后取胜者用,无需 userID)。空=未设置。
func (r *Repository) GetProjectSession(id uint) (string, error) {
	var p Project
	if err := r.db.Select("agent_session_id").Where("id = ?", id).First(&p).Error; err != nil {
		return "", err
	}
	if p.AgentSessionID == nil {
		return "", nil
	}
	return *p.AgentSessionID, nil
}

// GetProjectBySession 按 agent 会话 id 反查项目(agent 生成标题回传时据 sessionID 定位 project +
// 校验归属)。不存在 → (nil, nil)。
func (r *Repository) GetProjectBySession(sessionID string) (*Project, error) {
	if sessionID == "" {
		return nil, nil
	}
	var p Project
	err := r.db.Where("agent_session_id = ?", sessionID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ─── 文件 ────────────────────────────────────────────────────────────────

func (r *Repository) CreateFile(f *File) error { return r.db.Create(f).Error }

func (r *Repository) ListFiles(projectID uint) ([]File, error) {
	var fs []File
	err := r.db.Where("project_id = ?", projectID).Order("rel_path ASC").Find(&fs).Error
	return fs, err
}

// GetFileInProject 取文件并校验它属于该项目;不存在 → (nil, nil)。
func (r *Repository) GetFileInProject(projectID, fileID uint) (*File, error) {
	var f File
	err := r.db.Where("id = ? AND project_id = ?", fileID, projectID).First(&f).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// RenameFileTx 改文件相对路径;updateMain 时在**同一事务**内同步 project.main_file,
// 保证「改主文件名」时 main_file 指针与文件 rel_path 要么一起变、要么都不变(消除孤儿主文件)。
// 调用方已校验路径安全 + 唯一。
func (r *Repository) RenameFileTx(fileID, projectID uint, newRelPath string, updateMain bool) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if updateMain {
			if err := tx.Model(&Project{}).Where("id = ?", projectID).Update("main_file", newRelPath).Error; err != nil {
				return err
			}
		}
		return tx.Model(&File{}).Where("id = ?", fileID).Update("rel_path", newRelPath).Error
	})
}

// DeleteFile 删文件 + 其全部版本(事务)。
func (r *Repository) DeleteFile(fileID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("file_id = ?", fileID).Delete(&FileVersion{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", fileID).Delete(&File{}).Error
	})
}

func (r *Repository) GetVersion(id uint) (*FileVersion, error) {
	var v FileVersion
	if err := r.db.Where("id = ?", id).First(&v).Error; err != nil {
		return nil, err
	}
	return &v, nil
}

// GetVersionsByIDs 一次取多条版本(含 body),返回 id→版本 映射。
// 给铺源 / 轮末收集用:消掉「每文件一次 GetVersion」的 N 次单查(改一次 IN 查询)。
func (r *Repository) GetVersionsByIDs(ids []uint) (map[uint]*FileVersion, error) {
	if len(ids) == 0 {
		return map[uint]*FileVersion{}, nil
	}
	var vs []FileVersion
	if err := r.db.Where("id IN ?", ids).Find(&vs).Error; err != nil {
		return nil, err
	}
	m := make(map[uint]*FileVersion, len(vs))
	for i := range vs {
		m[vs[i].ID] = &vs[i]
	}
	return m, nil
}

// ListVersions 列某文件的版本(不含 body,列表轻量;按 version_no 倒序)。
func (r *Repository) ListVersions(fileID uint, limit int) ([]FileVersion, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var vs []FileVersion
	err := r.db.Select("id, file_id, version_no, content_sha256, author, status, created_at").
		Where("file_id = ?", fileID).Order("version_no DESC").Limit(limit).Find(&vs).Error
	return vs, err
}

// AppendCurrentVersion 追加一个 current 版本:事务内 supersede 旧 current → 插入新版本
// → 更新 file 的 current_version_id / content_sha256 / size。返回新版本。
func (r *Repository) AppendCurrentVersion(fileID uint, body, sha, author string, baseVersionID *uint) (*FileVersion, error) {
	var ver FileVersion
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var maxNo int
		tx.Model(&FileVersion{}).Where("file_id = ?", fileID).
			Select("COALESCE(MAX(version_no),0)").Scan(&maxNo)

		// 旧 current → superseded(防多 current)。
		if err := tx.Model(&FileVersion{}).
			Where("file_id = ? AND status = ?", fileID, VerCurrent).
			Update("status", VerSuperseded).Error; err != nil {
			return err
		}

		ver = FileVersion{
			FileID: fileID, VersionNo: maxNo + 1, Body: body, ContentSHA256: sha,
			Author: author, Status: VerCurrent, BaseVersionID: baseVersionID,
		}
		if err := tx.Create(&ver).Error; err != nil {
			return err
		}
		return tx.Model(&File{}).Where("id = ?", fileID).Updates(map[string]any{
			"current_version_id": ver.ID,
			"content_sha256":     sha,
			"size":               len(body),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return &ver, nil
}

// VersionWrite 一次批量固化里的一个文件改动(轮末把 agent 在 cwd 的改动写穿进 DB)。
type VersionWrite struct {
	FileID        uint
	Body          string
	SHA           string
	BaseVersionID *uint
}

// BatchAppendCurrentVersions 在**单个事务**里给多个文件各追加一个 current 版本:
// 多文件改动要么一起进 DB、要么一起回滚,杜绝半固化(改了 3 个落了 2 个)的不自洽稿件。
// author 统一(轮末固化传 AuthorAgent)。每个文件:supersede 旧 current → 插新版本 → 更新 file 指针。
func (r *Repository) BatchAppendCurrentVersions(items []VersionWrite, author string) ([]FileVersion, error) {
	out := make([]FileVersion, 0, len(items))
	err := r.db.Transaction(func(tx *gorm.DB) error {
		for _, it := range items {
			var maxNo int
			tx.Model(&FileVersion{}).Where("file_id = ?", it.FileID).
				Select("COALESCE(MAX(version_no),0)").Scan(&maxNo)
			if err := tx.Model(&FileVersion{}).
				Where("file_id = ? AND status = ?", it.FileID, VerCurrent).
				Update("status", VerSuperseded).Error; err != nil {
				return err
			}
			ver := FileVersion{
				FileID: it.FileID, VersionNo: maxNo + 1, Body: it.Body, ContentSHA256: it.SHA,
				Author: author, Status: VerCurrent, BaseVersionID: it.BaseVersionID,
			}
			if err := tx.Create(&ver).Error; err != nil {
				return err
			}
			if err := tx.Model(&File{}).Where("id = ?", it.FileID).Updates(map[string]any{
				"current_version_id": ver.ID,
				"content_sha256":     it.SHA,
				"size":               len(it.Body),
			}).Error; err != nil {
				return err
			}
			out = append(out, ver)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// appendVersionTx 在给定事务里给一个**已存在**文件追加一个 current 版本(supersede 旧 → 插新 → 更新指针)。
func appendVersionTx(tx *gorm.DB, fileID uint, body, sha, author string, baseVersionID *uint) error {
	var maxNo int
	tx.Model(&FileVersion{}).Where("file_id = ?", fileID).Select("COALESCE(MAX(version_no),0)").Scan(&maxNo)
	if err := tx.Model(&FileVersion{}).
		Where("file_id = ? AND status = ?", fileID, VerCurrent).
		Update("status", VerSuperseded).Error; err != nil {
		return err
	}
	ver := FileVersion{
		FileID: fileID, VersionNo: maxNo + 1, Body: body, ContentSHA256: sha,
		Author: author, Status: VerCurrent, BaseVersionID: baseVersionID,
	}
	if err := tx.Create(&ver).Error; err != nil {
		return err
	}
	return tx.Model(&File{}).Where("id = ?", fileID).Updates(map[string]any{
		"current_version_id": ver.ID, "content_sha256": sha, "size": len(body),
	}).Error
}

// NewFileWrite 本轮 agent 新建的文件(轮末检出);固化时建 File + 首版本。
type NewFileWrite struct {
	RelPath string
	Kind    string
	Mime    string
	Body    string
	SHA     string
}

// ApplyRoundTx 单事务固化一轮:已存在文件追加 current 版本 + 新建文件建 File+首版本。
// 全成功或全回滚(杜绝半固化)。新文件遇唯一键冲突(并发已建)→ 降级为给既存文件追加版本,不致整轮失败。
func (r *Repository) ApplyRoundTx(projectID uint, existing []VersionWrite, created []NewFileWrite, author string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		for _, it := range existing {
			if err := appendVersionTx(tx, it.FileID, it.Body, it.SHA, author, it.BaseVersionID); err != nil {
				return err
			}
		}
		for _, nf := range created {
			f := File{ProjectID: projectID, RelPath: nf.RelPath, FileKind: nf.Kind, Mime: nf.Mime}
			if err := tx.Create(&f).Error; err != nil {
				if isDuplicateKey(err) {
					var ex File
					if e := tx.Where("project_id = ? AND rel_path = ?", projectID, nf.RelPath).First(&ex).Error; e != nil {
						return e
					}
					if err := appendVersionTx(tx, ex.ID, nf.Body, nf.SHA, author, nil); err != nil {
						return err
					}
					continue
				}
				return err
			}
			ver := FileVersion{FileID: f.ID, VersionNo: 1, Body: nf.Body, ContentSHA256: nf.SHA, Author: author, Status: VerCurrent}
			if err := tx.Create(&ver).Error; err != nil {
				return err
			}
			if err := tx.Model(&File{}).Where("id = ?", f.ID).Updates(map[string]any{
				"current_version_id": ver.ID, "content_sha256": nf.SHA, "size": len(nf.Body),
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ─── 编译 ────────────────────────────────────────────────────────────────

func (r *Repository) CreateCompile(c *Compile) error { return r.db.Create(c).Error }

func (r *Repository) GetCompileInProject(projectID, id uint) (*Compile, error) {
	var c Compile
	err := r.db.Where("id = ? AND project_id = ?", id, projectID).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) UpdateCompile(id uint, fields map[string]any) error {
	return r.db.Model(&Compile{}).Where("id = ?", id).Updates(fields).Error
}

// FindCachedCompile 命中未过期的成功编译(内容哈希一致)→ 复用其 PDF,免起容器。
func (r *Repository) FindCachedCompile(projectID uint, contentHash string, now time.Time) (*Compile, error) {
	if contentHash == "" {
		return nil, nil
	}
	var c Compile
	err := r.db.Where("project_id = ? AND content_hash = ? AND status = ? AND expires_at > ?",
		projectID, contentHash, CompileSuccess, now).Order("id DESC").First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ListStaleCompiles 取可回收的旧编译(评审 #7):早于 cutoff 且**不是所属项目的最新一条**
// —— 每项目最新一条永久保留,保证 /pdf 始终能取到最近产物,只回收历史堆积。返回带对象键的行,
// 供调用方先删 MinIO(pdf/log)再删行。limit 分批,防一次扫太多。
func (r *Repository) ListStaleCompiles(cutoff time.Time, limit int) ([]Compile, error) {
	var cs []Compile
	err := r.db.
		Select("id, pdf_object_key, log_object_key").
		Where("created_at < ?", cutoff).
		Where("id NOT IN (?)", r.db.Model(&Compile{}).Select("MAX(id)").Group("project_id")).
		Order("id ASC").
		Limit(limit).
		Find(&cs).Error
	return cs, err
}

// DeleteCompilesByIDs 批量删编译行。返回删除条数。
func (r *Repository) DeleteCompilesByIDs(ids []uint) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	res := r.db.Where("id IN ?", ids).Delete(&Compile{})
	return res.RowsAffected, res.Error
}

// GetFileByPath 按相对路径取项目内文件;不存在 → (nil, nil)。
func (r *Repository) GetFileByPath(projectID uint, relPath string) (*File, error) {
	var f File
	err := r.db.Where("project_id = ? AND rel_path = ?", projectID, relPath).First(&f).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// ─── AI 编辑作业 ───────────────────────────────────────────────────────────

func (r *Repository) CreateEdit(e *Edit) error { return r.db.Create(e).Error }

func (r *Repository) GetEditInProject(projectID, id uint) (*Edit, error) {
	var e Edit
	err := r.db.Where("id = ? AND project_id = ?", id, projectID).First(&e).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *Repository) UpdateEdit(id uint, fields map[string]any) error {
	return r.db.Model(&Edit{}).Where("id = ?", id).Updates(fields).Error
}

// ─── 文献库检索(\cite RAG 源)───────────────────────────────────────────────
//
// 收口到 library.Reader 只读 facade,不再裸查 user_library_papers ——
// library 改列(og_* 合并 / 类型变更等)时由 CitePaper 的 SELECT 常量集中约束,
// 避免 prism 手抄裸字符串成为 schema 演进的静默盲区。查询语义(SELECT 列 /
// user_id 归属 / LIKE ESCAPE / ORDER year DESC / limit 钳制)与历史裸查完全一致。
//
// libRow 是 library.CitePaper 的别名,保留原类型名不动 cite.go 调用方
// (字段 ID/Title/AuthorsJSON/Year/Venue/DOI 逐字段一致,citeKey 生成的确定性不变)。
type libRow = library.CitePaper

// SearchLibrary 在用户文献库里按关键词 LIKE 检索(title/venue/doi),只返真实库行 —— \cite 反幻觉的根。
func (r *Repository) SearchLibrary(userID uint, query string, limit int) ([]libRow, error) {
	return library.NewReader(r.db).SearchCitePapers(uint64(userID), query, limit)
}

// GetLibraryPaper 取某条库论文(cite apply 用,校验归属)。不存在 / 越权 → (nil, nil)。
func (r *Repository) GetLibraryPaper(userID, paperID uint) (*libRow, error) {
	return library.NewReader(r.db).CitePaperByID(uint64(userID), uint64(paperID))
}

// LatestSuccessCompile 项目最近一次成功编译(取 PDF 用)。
func (r *Repository) LatestSuccessCompile(projectID uint) (*Compile, error) {
	var c Compile
	err := r.db.Where("project_id = ? AND status = ?", projectID, CompileSuccess).
		Order("id DESC").First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}
