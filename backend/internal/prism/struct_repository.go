// ============================================================================
// struct 轨仓储 —— 结构体真源读写 + 追加式版本链 + projector 产物落文件版本。
//   见 REPORT.md Part III §4.3。doc_struct 整存一列(不拆子表),版本链镜像 prism_file_versions。
// ============================================================================

package prism

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// GetStructJSON 取项目当前结构体 JSON(空 = 尚未初始化)。
func (r *Repository) GetStructJSON(projectID uint) (string, error) {
	var p Project
	if err := r.db.Select("doc_struct").Where("id = ?", projectID).First(&p).Error; err != nil {
		return "", err
	}
	if p.DocStruct == nil {
		return "", nil
	}
	return *p.DocStruct, nil
}

// structHistoryLimit 结构体历史面板一次最多回多少条(评审 #14:防版本链无界膨胀拖垮列表查询)。
const structHistoryLimit = 200

// SaveStructVersion 追加一条结构体版本 + 翻 current + 回写 prism_projects.doc_struct/struct_version_id(单事务)。
// 评审 #14:① sha 去重 —— 内容与当前 current 一致时不追加空版本(autosave 空存 / 同模板重存 / 空操作 AI 轮都会命中),
// 仅刷新项目缓存列并原样返回当前 version_no;② base_version_id 记录本版所基于的旧 current(可检测性 + 未来 CAS 基线)。
func (r *Repository) SaveStructVersion(projectID uint, docJSON, sha, author string) (int, error) {
	var versionNo int
	err := r.db.Transaction(func(tx *gorm.DB) error {
		// 取当前 current 版本(version_no 单调,current 恒为最大号):用于 sha 去重 + base_version_id 基线。
		var cur StructVersion
		hasCur := false
		if e := tx.Where("project_id = ? AND status = ?", projectID, VerCurrent).
			Order("version_no DESC").First(&cur).Error; e == nil {
			hasCur = true
		} else if !errors.Is(e, gorm.ErrRecordNotFound) {
			return e
		}
		// sha 去重:内容无变化 → 不追加新版本,只保证项目缓存列指向当前 current。
		if hasCur && cur.StructSHA256 == sha {
			versionNo = cur.VersionNo
			return tx.Model(&Project{}).Where("id = ?", projectID).Updates(map[string]any{
				"doc_struct": docJSON, "struct_version_id": cur.ID, "updated_at": time.Now(),
			}).Error
		}
		versionNo = cur.VersionNo + 1 // hasCur=false → cur.VersionNo=0 → 版本号从 1 起
		if err := tx.Model(&StructVersion{}).
			Where("project_id = ? AND status = ?", projectID, VerCurrent).
			Update("status", VerSuperseded).Error; err != nil {
			return err
		}
		sv := &StructVersion{
			ProjectID: projectID, VersionNo: versionNo, DocStruct: docJSON,
			StructSHA256: sha, Author: author, Status: VerCurrent,
		}
		if hasCur {
			base := cur.ID
			sv.BaseVersionID = &base
		}
		if err := tx.Create(sv).Error; err != nil {
			return err
		}
		return tx.Model(&Project{}).Where("id = ?", projectID).Updates(map[string]any{
			"doc_struct": docJSON, "struct_version_id": sv.ID, "updated_at": time.Now(),
		}).Error
	})
	return versionNo, err
}

// ListStructVersions 结构体版本列表(不含正文 JSON,历史面板用;取最近 structHistoryLimit 条)。
func (r *Repository) ListStructVersions(projectID uint) ([]StructVersion, error) {
	var vs []StructVersion
	err := r.db.Select("id, project_id, version_no, struct_sha256, author, status, base_version_id, created_at").
		Where("project_id = ?", projectID).Order("version_no DESC").Limit(structHistoryLimit).Find(&vs).Error
	return vs, err
}

// GetStructVersion 取某结构体版本(含 doc_struct 正文,供恢复;project_id 双条件防越权取他项目版本)。
func (r *Repository) GetStructVersion(projectID, versionID uint) (*StructVersion, error) {
	var v StructVersion
	if err := r.db.Where("id = ? AND project_id = ?", versionID, projectID).First(&v).Error; err != nil {
		return nil, err
	}
	return &v, nil
}

// UpsertFileBody get-or-create 文件 + 追加 current 版本(author=agent)。projector 产物落库用。
func (r *Repository) UpsertFileBody(projectID uint, relPath, kind, body string) error {
	var f File
	err := r.db.Where("project_id = ? AND rel_path = ?", projectID, relPath).First(&f).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		f = File{ProjectID: projectID, RelPath: relPath, FileKind: kind, Mime: mimeForKind(kind)}
		if err := r.db.Create(&f).Error; err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	_, err = r.AppendCurrentVersion(f.ID, body, sha256Hex(body), AuthorAgent, nil)
	return err
}

// CurrentBodyByPath 取项目某文件 current 版本正文(clone-to-struct 读旧 main.tex 用)。
func (r *Repository) CurrentBodyByPath(projectID uint, relPath string) (string, error) {
	var f File
	if err := r.db.Where("project_id = ? AND rel_path = ?", projectID, relPath).First(&f).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil
		}
		return "", err
	}
	if f.CurrentVersionID == nil {
		return "", nil
	}
	v, err := r.GetVersion(*f.CurrentVersionID)
	if err != nil {
		return "", err
	}
	return v.Body, nil
}

func mimeForKind(kind string) string {
	switch kind {
	case KindBib:
		return "text/x-bibtex"
	default:
		return "text/x-tex"
	}
}
