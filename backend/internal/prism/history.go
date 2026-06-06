// ============================================================================
// Prism 历史 —— 文件版本(查看/回滚)。
//
// 对话历史真源是 agent jsonl(见 ws_round.go GetWSHistory,同 claw),不在 DB。
// 旧的 prism_chat_messages DB 双轨(persistChat/ListChat)已随 agent-native 迁移废弃删除,
// 表保留为 stranded(不再读写)。
// ============================================================================

package prism

// ─── 文件版本历史 ──────────────────────────────────────────────────────────

// ListVersions 列某文件的版本(不含 body)。
func (s *Service) ListVersions(projectID, fileID uint) ([]FileVersion, error) {
	f, err := s.repo.GetFileInProject(projectID, fileID)
	if err != nil {
		return nil, err
	}
	if f == nil {
		return nil, ErrFileNotFound
	}
	return s.repo.ListVersions(fileID, 50)
}

// RestoreVersion 把某历史版本设为当前(追加为新 current 版本,保留全链审计)。
func (s *Service) RestoreVersion(projectID, fileID, versionID uint) (*FileVersion, error) {
	f, err := s.repo.GetFileInProject(projectID, fileID)
	if err != nil {
		return nil, err
	}
	if f == nil {
		return nil, ErrFileNotFound
	}
	v, err := s.repo.GetVersion(versionID)
	if err != nil || v == nil || v.FileID != fileID {
		return nil, ErrEditNotFound
	}
	ver, err := s.repo.AppendCurrentVersion(fileID, v.Body, sha256Hex(v.Body), AuthorUser, nil)
	if err != nil {
		return nil, err
	}
	_ = s.repo.TouchProject(projectID)
	return ver, nil
}
