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

import "context"

// materializeProject 铺源:DB current 文本文件 → agent 会话 cwd(原样按 relPath 覆盖写)。
// 全量覆盖(幂等):DB current 是权威,cwd 是可丢弃副本,每轮同步成 == DB 即可。
func (s *Service) materializeProject(ctx context.Context, projectID uint, sessionID string) error {
	files, _, err := s.gatherCurrent(projectID) // map[relPath]body,已过滤为文本文件
	if err != nil {
		return err
	}
	for relPath, body := range files {
		if err := s.agent.PutWorkspaceFile(ctx, sessionID, relPath, []byte(body)); err != nil {
			return err
		}
	}
	return nil
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
func (s *Service) collectWorkspaceChanges(ctx context.Context, projectID uint, sessionID string) ([]changedFile, error) {
	dbFiles, err := s.repo.ListFiles(projectID)
	if err != nil {
		return nil, err
	}
	var changed []changedFile
	for _, f := range dbFiles {
		if f.FileKind == KindAsset || f.CurrentVersionID == nil {
			continue
		}
		v, err := s.repo.GetVersion(*f.CurrentVersionID)
		if err != nil {
			return nil, err
		}
		wf, err := s.agent.ReadWorkspaceFileFull(ctx, sessionID, f.RelPath)
		if err != nil || wf == nil || wf.State != "ok" || wf.PreviewType != "text" {
			continue // 读不回 / 非文本 → 跳过
		}
		newSHA := sha256Hex(wf.Content)
		if newSHA == f.ContentSHA256 {
			continue // 未改动
		}
		changed = append(changed, changedFile{
			fileID: f.ID, relPath: f.RelPath, oldBody: v.Body, newBody: wf.Content, newSHA: newSHA,
			baseVer: f.CurrentVersionID,
		})
	}
	return changed, nil
}
