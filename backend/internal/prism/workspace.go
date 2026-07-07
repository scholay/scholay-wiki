// ============================================================================
// Prism agent-native —— 会话工作区「铺源 + 轮末收集」(D1 真源仍是 DB)。
//
//   铺源 materializeProject:每轮 AI 前把 DB current 文本文件写进 agent 会话 cwd(保 relPath),
//     保证 agent 看到的 base == DB current(含用户手改 / 上一轮固化)。
//   收集 collectWorkspaceChanges:轮末读回 cwd 里 DB-known 文本文件,对比 sha,
//     收集被 agent 原生 Write/Edit 改动的文件 → 交给 runStream 批量固化进 DB。
//
// 注:MVP 只跟踪 DB 已有文件;agent 新建文件暂不固化(已知边界,后续用 workspace tree 扩)。
// ============================================================================

package prism

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"golang.org/x/sync/errgroup"
)

// wsConcurrency 铺源 / 轮末读回的并发上限。每次往返打 agent 容器(roundTripTimeout 10s),
// 串行会随文件数线性叠加延迟;有界并发显著降首字节延迟,又不至于打爆 agent 窗口 / backend 内存。
const wsConcurrency = 8

// materializeProject 铺源:DB current 文本文件 → agent 会话 cwd(原样按 relPath 覆盖写)。
// 全量覆盖(幂等):DB current 是权威,cwd 是可丢弃副本,每轮同步成 == DB 即可。
// 有界并发写(errgroup,各文件独立 PUT;任一失败即 Wait 返回该错并取消其余)。
func (s *Service) materializeProject(ctx context.Context, projectID uint, sessionID string) error {
	// struct 轨:agent 编辑面是 markdown —— 铺 document.md(struct→markdown,正文)+ references.bib
	// (参考文献;agent 把 minicod 查到的真实论文写成 BibTeX 放这里,轮末解析回 Bibliography),不铺 .tex。
	if p, perr := s.repo.GetProjectByID(projectID); perr == nil && p != nil && p.SchemaVersion == SchemaStruct {
		js, err := s.GetStruct(projectID)
		if err != nil {
			return err
		}
		d, err := ParseDocStruct(js)
		if err != nil {
			return err
		}
		if err := s.agent.PutWorkspaceFile(ctx, sessionID, EditorDocFile, []byte(structToEditorMarkdown(d))); err != nil {
			return err
		}
		return s.agent.PutWorkspaceFile(ctx, sessionID, BibFile, []byte(renderBib(d.Bibliography)))
	}
	files, _, err := s.gatherCurrent(projectID) // map[relPath]body,已过滤为文本文件
	if err != nil {
		return err
	}
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(wsConcurrency)
	for relPath, body := range files {
		relPath, body := relPath, body
		g.Go(func() error {
			return s.agent.PutWorkspaceFile(gctx, sessionID, relPath, []byte(body))
		})
	}
	return g.Wait()
}

// changedFile 轮末检出的一个被 agent 改动的文件(含新旧正文,用于固化 + 生成 diff 摘要)。
type changedFile struct {
	fileID  uint
	relPath string
	oldBody string
	newBody string
	newSHA  string
	baseVer *uint  // 固化前的 current 版本 id(= 本轮 base,新版本 base_version_id 指它)
	isNew   bool   // agent 本轮新建(DB 还没有)→ 固化时建 File+首版本(fileID/baseVer 为零)
	kind    string // 新文件的 FileKind(按扩展名);仅 isNew 时有意义
}

// allowedNewFileExt —— agent 本轮可新建并固化的文本文件扩展名白名单。
// 控制面:杜绝把 .log/.aux/.synctex 等编译垃圾或意外 scratch 固化进项目;LaTeX 工程常见文本类全覆盖
// (含 pgfplots 用的 .dat/.csv 数据文件)。二进制不在内(图表走 TikZ 文本,无需位图资产)。
var allowedNewFileExt = map[string]bool{
	".tex": true, ".bib": true, ".sty": true, ".cls": true,
	".dat": true, ".csv": true, ".tsv": true, ".txt": true, ".tikz": true, ".pgf": true,
}

func isAllowedNewFile(rel string) bool {
	return allowedNewFileExt[strings.ToLower(filepath.Ext(rel))]
}

const (
	maxNewFilesPerRound = 50   // 一轮最多固化的新文件数(防 agent 失控刷文件)
	maxCwdListDepth     = 5    // cwd 递归列目录深度上限
	maxCwdEntries       = 2000 // cwd 递归列目录条目上限(防超大目录拖垮)
)

// listCwdFiles 递归列出会话 cwd 下所有文件的相对路径(跳过隐藏项;有界深度/条目)。
func (s *Service) listCwdFiles(ctx context.Context, sessionID string) ([]string, error) {
	var out []string
	var walk func(dir string, depth int) error
	walk = func(dir string, depth int) error {
		if depth > maxCwdListDepth || len(out) >= maxCwdEntries {
			return nil
		}
		tree, err := s.agent.ListWorkspaceFiles(ctx, sessionID, dir)
		if err != nil {
			return err
		}
		if tree == nil || tree.State != "ok" {
			return nil
		}
		for _, e := range tree.Entries {
			if strings.HasPrefix(e.Name, ".") {
				continue
			}
			if e.IsDirectory {
				if err := walk(e.Path, depth+1); err != nil {
					return err
				}
			} else if len(out) < maxCwdEntries {
				out = append(out, e.Path)
			}
		}
		return nil
	}
	if err := walk("", 0); err != nil {
		return nil, err
	}
	return out, nil
}

// collectWorkspaceChanges 轮末读回 cwd 里 DB-known 文本文件,对比 sha,返回被改动的集合。
// 读不回(被删/异常)的文件跳过(MVP 不处理删除)。?full=1 绕 1MB 截断,防大文件固化被截。
//
// 先一次批量取本轮所有 current 版本(固化要 oldBody = base 正文),再有界并发读回 cwd
// 逐文件比 sha —— 消掉 N×单查版本 + N 次串行 HTTP 读回的线性叠加延迟。
func (s *Service) collectWorkspaceChanges(ctx context.Context, projectID uint, sessionID string) ([]changedFile, error) {
	dbFiles, err := s.repo.ListFiles(projectID)
	if err != nil {
		return nil, err
	}
	// 候选 = DB-known 文本文件;批量取它们的 current 版本。
	candidates := make([]File, 0, len(dbFiles))
	verIDs := make([]uint, 0, len(dbFiles))
	for _, f := range dbFiles {
		if f.FileKind == KindAsset || f.CurrentVersionID == nil {
			continue
		}
		candidates = append(candidates, f)
		verIDs = append(verIDs, *f.CurrentVersionID)
	}
	vers, err := s.repo.GetVersionsByIDs(verIDs)
	if err != nil {
		return nil, err
	}

	// 有界并发读回(各文件独立);命中改动的写进 results[i] 保序,最后压实。
	results := make([]*changedFile, len(candidates))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(wsConcurrency)
	for i, f := range candidates {
		i, f := i, f
		v := vers[*f.CurrentVersionID]
		if v == nil {
			return nil, fmt.Errorf("prism: current version %d missing for file %s", *f.CurrentVersionID, f.RelPath)
		}
		g.Go(func() error {
			wf, rerr := s.agent.ReadWorkspaceFileFull(gctx, sessionID, f.RelPath)
			if rerr != nil || wf == nil || wf.State != "ok" || wf.PreviewType != "text" {
				return nil // 读不回 / 非文本 → 跳过
			}
			newSHA := sha256Hex(wf.Content)
			if newSHA == f.ContentSHA256 {
				return nil // 未改动
			}
			results[i] = &changedFile{
				fileID: f.ID, relPath: f.RelPath, oldBody: v.Body, newBody: wf.Content, newSHA: newSHA,
				baseVer: f.CurrentVersionID,
			}
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	changed := make([]changedFile, 0, len(candidates))
	for _, r := range results {
		if r != nil {
			changed = append(changed, *r)
		}
	}

	// 检出 agent 本轮**新建**的文件(DB 还没有)→ 作为新文件固化。列举失败不致命:
	// 退化为「只固化已知文件改动」(老行为),保证主流程不被一次 tree 列举异常打断。
	dbPaths := make(map[string]bool, len(dbFiles))
	for _, f := range dbFiles {
		dbPaths[f.RelPath] = true
	}
	if cwdFiles, lerr := s.listCwdFiles(ctx, sessionID); lerr == nil {
		newCount := 0
		for _, rel := range cwdFiles {
			if newCount >= maxNewFilesPerRound {
				break
			}
			if dbPaths[rel] || !isAllowedNewFile(rel) {
				continue
			}
			if clean, ok := safeRel(rel); !ok || clean != rel {
				continue // 防 ../、绝对路径、非规整路径
			}
			wf, rerr := s.agent.ReadWorkspaceFileFull(ctx, sessionID, rel)
			if rerr != nil || wf == nil || wf.State != "ok" || wf.PreviewType != "text" {
				continue // 读不回 / 非文本(如意外二进制)→ 跳过
			}
			changed = append(changed, changedFile{
				relPath: rel, oldBody: "", newBody: wf.Content, newSHA: sha256Hex(wf.Content),
				isNew: true, kind: kindFromPath(rel),
			})
			newCount++
		}
	}
	return changed, nil
}
