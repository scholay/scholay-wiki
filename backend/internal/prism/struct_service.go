// ============================================================================
// struct 轨服务编排 —— 结构体 CRUD + projector 投影 → 复用既有编译链。
//   见 REPORT.md Part III §5。SaveStruct = 追加版本 + 投影成 .tex/.bib 写文件版本。
// ============================================================================

package prism

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
)

var allowedImageExt = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".pdf": true}

// structWriteMu —— 每项目 struct 写**串行化**(评审 #1/#14)。所有对某项目结构体的 read-modify-write
// (SaveStruct / UploadAsset / AddCite / SetJournalTemplate / RestoreStructVersion / applyStructRound)
// 在同一 projectID 上串行,消除「用户整档 autosave 撞 AI 轮/传图/加引用」的静默 last-writer-wins 丢更新,
// 以及 SaveStructVersion 读 MAX(version_no)→INSERT 的重复版本号竞态。单实例假设(与 agent hub 一致);
// 多实例需 DB 级 CAS(base_version_id 已具备记录基线的位置)。
var structWriteMu = newKeyedMutex()

type keyedMutex struct {
	mu sync.Mutex
	m  map[uint]*sync.Mutex
}

func newKeyedMutex() *keyedMutex { return &keyedMutex{m: map[uint]*sync.Mutex{}} }

// lock 取某 key 的锁,返回解锁函数(defer 调用)。每项目一把,一把 *sync.Mutex 极小,长驻不清理。
func (k *keyedMutex) lock(id uint) func() {
	k.mu.Lock()
	mu, ok := k.m[id]
	if !ok {
		mu = &sync.Mutex{}
		k.m[id] = mu
	}
	k.mu.Unlock()
	mu.Lock()
	return mu.Unlock
}

// CloneToStruct 逃生口:从旧(legacy)项目新建一个 struct 项目,旧正文**整块**塞进一个 OpaqueBlock
// (非有损自动解析 —— 见 REPORT.md Part III §3.6/§3.8:任意 LaTeX→结构体 2–54% 成功率,绝不自动拆)。
// 用户再经 agent 逐步把 opaque 块拆成有类型块。源项目原封不动(仍可编译/导出)。
func (s *Service) CloneToStruct(userID, srcID uint) (*Project, error) {
	src, err := s.repo.GetProject(srcID, userID)
	if err != nil {
		return nil, err
	}
	if src == nil {
		return nil, ErrProjectNotFound
	}
	body, _ := s.repo.CurrentBodyByPath(srcID, src.MainFile) // best-effort:读不到就空

	np := &Project{UserID: userID, Title: cloneTitle(src.Title), MainFile: "main.tex", Status: "active", SchemaVersion: SchemaStruct}
	if err := s.repo.CreateProject(np); err != nil {
		return nil, err
	}
	d := DefaultDocStruct()
	if strings.TrimSpace(src.Title) != "" {
		d.FrontMatter.Title = src.Title
	}
	d.Body = []Block{{ID: "b1", Type: BlockOpaque, RawLatex: extractDocumentBody(body)}}
	js, err := d.Marshal()
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.SaveStructVersion(np.ID, js, sha256Hex(js), AuthorUser); err != nil {
		return nil, err
	}
	if err := s.materializeStruct(np.ID, d); err != nil {
		return nil, err
	}
	return np, nil
}

func cloneTitle(t string) string {
	t = strings.TrimSpace(t)
	if t == "" {
		return "未命名项目(新版)"
	}
	return t + "(新版)"
}

// extractDocumentBody 取 \begin{document}…\end{document} 之间的正文,剥掉 \maketitle
// (新模板会自己出 \maketitle)。取不到就退回全文(best-effort;旧 preamble 的自定义宏会丢 —— 已知有损)。
func extractDocumentBody(tex string) string {
	lo := strings.Index(tex, "\\begin{document}")
	hi := strings.Index(tex, "\\end{document}")
	inner := tex
	if lo >= 0 && hi > lo {
		inner = tex[lo+len("\\begin{document}"):hi]
	}
	inner = strings.ReplaceAll(inner, "\\maketitle", "")
	return strings.TrimSpace(inner)
}

// UploadAsset 上传一张图片 → 存 MinIO + 建 KindAsset 文件 + 记进 struct.assets + 末尾插一个 figure 块 → SaveStruct。
// 编译时 gatherAssets 会把它从 MinIO 拉回沙箱,projector 出 \includegraphics。仅 struct 轨。
func (s *Service) UploadAsset(ctx context.Context, projectID uint, filename string, data []byte, mime string) (*DocStruct, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if !allowedImageExt[ext] {
		return nil, ErrInvalidPath
	}
	sha := sha256Hex(string(data))
	relPath := "figures/" + sha[:12] + ext
	minioKey := fmt.Sprintf("prism/%d/assets/%s%s", projectID, sha[:12], ext)
	if err := s.putObject(ctx, minioKey, data, mime); err != nil {
		return nil, err
	}
	// get-or-create 文件行(同图重复上传不重复建)。
	if existing, _ := s.repo.GetFileByPath(projectID, relPath); existing == nil {
		f := &File{ProjectID: projectID, RelPath: relPath, FileKind: KindAsset, Mime: mime,
			Size: int64(len(data)), ContentSHA256: sha, MinioObjectKey: &minioKey}
		if err := s.repo.CreateFile(f); err != nil && !isDuplicateKey(err) {
			return nil, err
		}
	}
	// 更新结构体:登记资产 + 末尾插 figure 块(用户可再让 agent 移动位置)。
	// 取每项目写锁:整段 GetStruct→改→SaveStructVersion 串行,防与 autosave/AI 轮丢更新(评审 #1)。
	unlock := structWriteMu.lock(projectID)
	defer unlock()
	js, err := s.GetStruct(projectID)
	if err != nil {
		return nil, err
	}
	d, err := ParseDocStruct(js)
	if err != nil {
		return nil, err
	}
	if d.Assets == nil {
		d.Assets = map[string]DocAsset{}
	}
	assetID := "fig_" + sha[:8]
	d.Assets[assetID] = DocAsset{RelPath: relPath, Mime: mime}
	d.Body = append(d.Body, Block{
		ID: "b_" + sha[:8], Type: BlockFigure, Asset: assetID,
		Caption: strings.TrimSuffix(filename, ext), Label: "fig:" + sha[:6],
	})
	canonical, err := d.Marshal()
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.SaveStructVersion(projectID, canonical, sha256Hex(canonical), AuthorUser); err != nil {
		return nil, err
	}
	if err := s.materializeStruct(projectID, d); err != nil {
		return nil, err
	}
	return d, nil
}

// GetStruct 取当前结构体 JSON;空 → 返回默认骨架(自愈,前端拿到即可渲染)。
func (s *Service) GetStruct(projectID uint) (string, error) {
	js, err := s.repo.GetStructJSON(projectID)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(js) == "" {
		d := DefaultDocStruct()
		return d.Marshal()
	}
	return js, nil
}

// SaveStruct 保存结构体(公开入口,取每项目写锁)。SetJournalTemplate/RestoreStructVersion 等
// 「先 GetStruct 再存」的组合改动**已自行持锁**,内部走 saveStructLocked,避免重入死锁。
func (s *Service) SaveStruct(projectID uint, docJSON, author string) (*DocStruct, error) {
	unlock := structWriteMu.lock(projectID)
	defer unlock()
	return s.saveStructLocked(projectID, docJSON, author)
}

// saveStructLocked —— SaveStruct 的实体,**不取锁**;调用方须已持有该项目的 structWriteMu。
// 解析 → 规范化 → 追加版本 → projector 投影落文件版本(供 StartCompile 复用)。
func (s *Service) saveStructLocked(projectID uint, docJSON, author string) (*DocStruct, error) {
	d, err := ParseDocStruct(docJSON)
	if err != nil {
		return nil, err
	}
	canonical, err := d.Marshal()
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.SaveStructVersion(projectID, canonical, sha256Hex(canonical), author); err != nil {
		return nil, err
	}
	if err := s.materializeStruct(projectID, d); err != nil {
		return nil, err
	}
	return d, nil
}

// ListStructVersions 结构体版本列表(历史面板;不含正文 JSON)。
func (s *Service) ListStructVersions(projectID uint) ([]StructVersion, error) {
	return s.repo.ListStructVersions(projectID)
}

// RestoreStructVersion 把某历史结构体版本恢复为当前:读回该版本 doc_struct → 经 SaveStruct
// **追加成新 current 版本**(非破坏性,历史链不改)→ 重投影 main.tex,可立即重编译。
func (s *Service) RestoreStructVersion(projectID, versionID uint) (*DocStruct, error) {
	unlock := structWriteMu.lock(projectID) // 读旧版本→追加成新 current 串行(评审 #1)
	defer unlock()
	v, err := s.repo.GetStructVersion(projectID, versionID)
	if err != nil {
		return nil, err
	}
	return s.saveStructLocked(projectID, v.DocStruct, AuthorUser)
}

// materializeStruct projector:结构体 → main.tex (+ references.bib) 写入文件版本。
// 之后前端调既有 Compile 端点即可编出精确 PDF(struct 轨复用整条编译/缓存/MinIO 链)。
func (s *Service) materializeStruct(projectID uint, d *DocStruct) error {
	for rel, body := range ProjectStruct(d) {
		kind := KindTex
		if strings.HasSuffix(rel, ".bib") {
			kind = KindBib
		}
		if err := s.repo.UpsertFileBody(projectID, rel, kind, body); err != nil {
			return err
		}
	}
	_ = s.repo.TouchProject(projectID)
	return nil
}

// initStructProject 新建 struct 项目时种入默认结构体 + 首投影(CreateProject 在 cutover 后走这条)。
func (s *Service) initStructProject(projectID uint) error {
	d := DefaultDocStruct()
	js, err := d.Marshal()
	if err != nil {
		return err
	}
	if _, err := s.repo.SaveStructVersion(projectID, js, sha256Hex(js), AuthorUser); err != nil {
		return err
	}
	return s.materializeStruct(projectID, d)
}

// SetJournalTemplate 确定性换刊:只改 targetTemplate → 重投影(projector 把同一份结构体投成目标期刊
// 的作者/机构宏 + 文档结构)。绝不 LLM 重写。见 REPORT.md Part II「swap-not-rewrite」。
func (s *Service) SetJournalTemplate(projectID uint, template string) (*DocStruct, error) {
	unlock := structWriteMu.lock(projectID) // 整段 GetStruct→改→存 串行(评审 #1)
	defer unlock()
	js, err := s.GetStruct(projectID)
	if err != nil {
		return nil, err
	}
	d, err := ParseDocStruct(js)
	if err != nil {
		return nil, err
	}
	d.TargetTemplate = template
	canonical, err := d.Marshal()
	if err != nil {
		return nil, err
	}
	return s.saveStructLocked(projectID, canonical, AuthorUser)
}

// applyStructRound struct 轨轮末固化:读回 cwd document.md → parseEditorMarkdown → 合并进结构体
// → SaveStruct(重投影 main.tex,可重编译)。agent 只改 title/abstract/keywords/body;
// authors/affiliations/bibliography/targetTemplate 从既有结构体保留(不因 agent 编辑而丢)。
// applyStructRound 固化本轮:把 document.md 正文合并进结构体真源。
// hasOverride(P2 per-hunk):true = 前端「逐块审阅」取舍后的合并正文(overrideDoc,可能为空=用户全删),
// **显式提供就一律用它**、绝不回落 cwd —— 用「是否提供」而非「是否非空」区分,消除空串哨兵歧义
// (对抗审查:overrides[key] 存在但为空 与 key 缺失 都返回 ""、旧逻辑会把「用户全删」误当「整轮应用」)。
// hasOverride=false(自动轨,overrides 无此 key)= 读 cwd 全部改动(整轮应用)。bib/术语表回收两轨一致。
func (s *Service) applyStructRound(ctx context.Context, projectID uint, sessionID, overrideStruct string, hasOverride bool) (int, error) {
	// 取每项目写锁:AI 轮末的合并→存 与用户 autosave 串行(评审 #1/#2)。
	unlock := structWriteMu.lock(projectID)
	defer unlock()
	var d *DocStruct
	if hasOverride {
		// P2 逐块审阅:override = 前端块级取舍后的**完整 struct JSON**(最终态,已含 label/图宽,来自 pending 的
		// new_struct/old_struct 合并)→ 直接作真源。不读 cwd document.md、不走 markdown 合并 —— 用户已在 WYSIWYG
		// 块级 diff 里选择性接受,结果就是这份 struct(彻底避开「原始 markdown 摊给用户 + 逐行 hunk 劈坏 $$/围栏」)。
		dd, perr := ParseDocStruct(overrideStruct)
		if perr != nil {
			return 0, fmt.Errorf("parse override struct: %w", perr)
		}
		// 安全网:override body 为空但 DB 现有正文 → 拒绝(防前端偶发送空把稿件清掉);正文非空正常放行。
		if cur, cerr := s.GetStruct(projectID); cerr == nil {
			if cd, derr := ParseDocStruct(cur); derr == nil && len(cd.Body) > 0 && len(dd.Body) == 0 {
				return 0, fmt.Errorf("override struct has empty body while document is non-empty; refusing to clear")
			}
		}
		d = dd
	} else {
		// 自动轨:读 cwd document.md → 合并进当前 DB struct 真源。
		wf, werr := s.agent.ReadWorkspaceFileFull(ctx, sessionID, EditorDocFile)
		if werr != nil {
			return 0, werr
		}
		if wf == nil || wf.State != "ok" || wf.PreviewType != "text" {
			return 0, nil
		}
		js, gerr := s.GetStruct(projectID)
		if gerr != nil {
			return 0, gerr
		}
		dd, derr := ParseDocStruct(js)
		if derr != nil {
			return 0, derr
		}
		applyEditorMarkdown(dd, wf.Content) // 解析 + 带守卫/元数据回填的合并(见 md_bridge.mergeEditorInto)
		d = dd
	}
	// 读回 agent 编辑的 references.bib(它把 minicod 查到的论文写成 BibTeX 放这里)→ 解析 → 合并进 Bibliography。
	// 读失败/文件缺:忽略,保留既有 Bibliography(不因偶发读失败清空真源)。
	if bf, berr := s.agent.ReadWorkspaceFileFull(ctx, sessionID, BibFile); berr == nil && bf != nil && bf.State == "ok" && bf.PreviewType == "text" {
		mergeBibInto(d, bf.Content)
	}
	// V4-④ 术语表回收:agent 翻译轮把首译写进 cwd terminology.md → 轮末回收进 DB 真源(骨架级约束 2:
	// cwd 工件不持久)。空/读失败忽略(不清空真源);内容未变不写库。
	if tf, terr := s.agent.ReadWorkspaceFileFull(ctx, sessionID, TerminologyFile); terr == nil && tf != nil && tf.State == "ok" && tf.PreviewType == "text" && strings.TrimSpace(tf.Content) != "" {
		if p, perr := s.repo.GetProjectByID(projectID); perr == nil && p != nil {
			cur := ""
			if p.Terminology != nil {
				cur = *p.Terminology
			}
			if tf.Content != cur {
				if serr := s.repo.SetTerminology(projectID, tf.Content); serr != nil {
					slog.Warn("prism: harvest terminology failed", "project_id", projectID, "err", serr)
				}
			}
		}
	}
	canonical, err := d.Marshal()
	if err != nil {
		return 0, err
	}
	if _, err := s.repo.SaveStructVersion(projectID, canonical, sha256Hex(canonical), AuthorAgent); err != nil {
		return 0, err
	}
	if err := s.materializeStruct(projectID, d); err != nil {
		return 0, err
	}
	return 1, nil
}

// pendingStructRound 检出 cwd document.md 相对当前结构体 markdown 的改动(前端渲染 markdown diff)。
func (s *Service) pendingStructRound(ctx context.Context, projectID uint, sessionID string) ([]PendingFile, error) {
	wf, err := s.agent.ReadWorkspaceFileFull(ctx, sessionID, EditorDocFile)
	if err != nil || wf == nil || wf.State != "ok" || wf.PreviewType != "text" {
		return nil, nil
	}
	js, err := s.GetStruct(projectID)
	if err != nil {
		return nil, err
	}
	d, err := ParseDocStruct(js)
	if err != nil {
		return nil, err
	}
	oldMD := structToEditorMarkdown(d)
	if wf.Content == oldMD {
		return nil, nil
	}
	// 构造 new struct(与 applyStructRound 同款合并:agent 只改 title/abstract/keywords/body,其余保留),
	// 连同 old struct 一起回给前端渲染 Word 式痕迹 diff(不再走 markdown 代码 diff)。
	nd := *d
	applyEditorMarkdown(&nd, wf.Content) // 与 applyStructRound 单一真源合并逻辑;nd.Body 尚 == d.Body,回填读到旧块
	oldJSON, _ := d.Marshal()
	newJSON, _ := nd.Marshal()
	return []PendingFile{{
		RelPath: EditorDocFile, OldBody: oldMD, NewBody: wf.Content,
		OldStruct: json.RawMessage(oldJSON), NewStruct: json.RawMessage(newJSON),
	}}, nil
}

// StructConformance 目标模板合规检查(必填前置信息是否齐全;确定性,不需编译)。
func (s *Service) StructConformance(projectID uint) (ConformanceReport, error) {
	js, err := s.GetStruct(projectID)
	if err != nil {
		return ConformanceReport{}, err
	}
	d, err := ParseDocStruct(js)
	if err != nil {
		return ConformanceReport{}, err
	}
	r := Conformance(d)
	// 页限/溢出:读最近一次成功编译(排版几何只有编译后才知道)。
	if c, cerr := s.repo.LatestSuccessCompile(projectID); cerr == nil && c != nil {
		r.PageCount = c.PageCount
		r.Overfull = c.OverfullCount
		if r.PageLimit > 0 && c.PageCount > r.PageLimit {
			r.Missing = append(r.Missing, fmt.Sprintf("超过页数上限(%d/%d 页)", c.PageCount, r.PageLimit))
		}
		if c.OverfullCount > 0 {
			r.Missing = append(r.Missing, fmt.Sprintf("%d 处内容溢出边距", c.OverfullCount))
		}
	}
	return r, nil
}
