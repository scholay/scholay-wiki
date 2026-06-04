// ============================================================================
// Prism 历史 —— 文件版本(查看/回滚)+ 对话持久化(重入恢复)。
// ============================================================================

package prism

import (
	"log/slog"
	"strings"
)

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

// ─── 对话持久化 ────────────────────────────────────────────────────────────

// ListChat 取项目对话线(重入恢复)。
func (s *Service) ListChat(projectID uint) ([]ChatMessage, error) {
	return s.repo.ListChat(projectID, 200)
}

// visibleProse 助手回复的展示文本。agent-native 下回复就是 1-2 句说明(不再含补丁块);
// 仍防御性截到 "[PRISM_PATCH]" 之前 + 去空白,避免偶发回显污染对话线。
func visibleProse(reply string) string {
	return strings.TrimSpace(strings.Split(reply, "[PRISM_PATCH]")[0])
}

// persistChat 一轮成功编辑落库:用户指令 + 助手说明(剥离补丁)+ 改动摘要。
// 成对原子批量插入 → 不会有问无答、并发也不交错(review F9/F10)。best-effort:失败仅告警(SSE 结果已返回)。
func (s *Service) persistChat(e *Edit, instruction, reply string, applied, failed int) {
	fid := e.FileID
	eid := e.ID
	user := &ChatMessage{ProjectID: e.ProjectID, UserID: e.UserID, Role: "user", Text: instruction}
	assistant := &ChatMessage{
		ProjectID: e.ProjectID, UserID: e.UserID, Role: "assistant",
		Text: visibleProse(reply), EditID: &eid, FileID: &fid,
		AppliedHunks: applied, FailedHunks: failed,
	}
	if err := s.repo.AppendChatPair(user, assistant); err != nil {
		slog.Error("prism: persist chat failed", "project_id", e.ProjectID, "edit_id", eid, "err", err)
	}
}
