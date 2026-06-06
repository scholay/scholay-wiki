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

	"golang.org/x/sync/errgroup"
)

// wsConcurrency 铺源 / 轮末读回的并发上限。每次往返打 agent 容器(roundTripTimeout 10s),
// 串行会随文件数线性叠加延迟;有界并发显著降首字节延迟,又不至于打爆 agent 窗口 / backend 内存。
const wsConcurrency = 8

// materializeProject 铺源:DB current 文本文件 → agent 会话 cwd(原样按 relPath 覆盖写)。
// 全量覆盖(幂等):DB current 是权威,cwd 是可丢弃副本,每轮同步成 == DB 即可。
// 有界并发写(errgroup,各文件独立 PUT;任一失败即 Wait 返回该错并取消其余)。
func (s *Service) materializeProject(ctx context.Context, projectID uint, sessionID string) error {
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
	baseVer *uint // 固化前的 current 版本 id(= 本轮 base,新版本 base_version_id 指它)
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
	return changed, nil
}
