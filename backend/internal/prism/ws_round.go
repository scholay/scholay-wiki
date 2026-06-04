// ============================================================================
// Prism agent-native 用户 WS 轮次:prepare(铺源)/ apply(固化)/ reject(还原)/ pending
// + ws-ticket + 读 cwd 文件(实时 diff)。AI 对话本身走 agentbridge.HandleWS(纯 pipe),
// 这里只管「轮次边界」的 DB↔cwd 同步 + 应用门。真源仍是 DB(锁定架构 D1)。
// ============================================================================

package prism

import (
	"context"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
)

// WSFeature 暴露 agentbridge FeatureBridge,供 handler 直接挂 HandleWS(WS pipe)。
func (s *Service) WSFeature() *agentbridge.FeatureBridge { return s.feature }

// IssueWSTicket 校验项目归属 → 解析/建该项目的 agent 会话 → 颁发一次性 ws ticket(跳过通用
// OwnsSession,因 prism 会话不在 agent_sessions、归属由本处 GetProject 校验)。返回 (sessionID, token)。
func (s *Service) IssueWSTicket(ctx context.Context, userID, projectID uint) (string, string, error) {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return "", "", err
	}
	if proj == nil {
		return "", "", ErrProjectNotFound
	}
	sessionID, err := s.ensureProjectSession(ctx, projectID, userID)
	if err != nil {
		return "", "", err
	}
	token, err := s.feature.IssueWSTicketTrusted(ctx, userID, sessionID)
	if err != nil {
		return "", "", err
	}
	return sessionID, token, nil
}

// PrepareRound 每轮 AI 前调:校验归属 → 铺源(DB current → 会话 cwd),保证 agent 基于最新真源改。
func (s *Service) PrepareRound(ctx context.Context, userID, projectID uint) error {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return err
	}
	if proj == nil {
		return ErrProjectNotFound
	}
	sessionID, err := s.ensureProjectSession(ctx, projectID, userID)
	if err != nil {
		return err
	}
	return s.materializeProject(ctx, projectID, sessionID)
}

// PendingFile 一个待应用(或已检出)的文件改动:DB 旧正文 + cwd 新正文,前端据此渲染 diff。
type PendingFile struct {
	FileID  uint   `json:"file_id"`
	RelPath string `json:"rel_path"`
	OldBody string `json:"old_body"`
	NewBody string `json:"new_body"`
}

// PendingRound 检出当前 cwd 相对 DB 的改动(= 待应用集合)。重入时前端拉它渲染「待应用 diff」。
func (s *Service) PendingRound(ctx context.Context, userID, projectID uint) ([]PendingFile, error) {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return nil, err
	}
	if proj == nil {
		return nil, ErrProjectNotFound
	}
	sessionID, err := s.repo.GetProjectSession(projectID)
	if err != nil || sessionID == "" {
		return nil, nil // 无会话 = 无待应用
	}
	changes, err := s.collectWorkspaceChanges(ctx, projectID, sessionID)
	if err != nil {
		return nil, err
	}
	out := make([]PendingFile, 0, len(changes))
	for _, c := range changes {
		out = append(out, PendingFile{FileID: c.fileID, RelPath: c.relPath, OldBody: c.oldBody, NewBody: c.newBody})
	}
	return out, nil
}

// ApplyRound 应用:读回 cwd 变更 → 单事务批量固化进 DB(author=agent)。返回固化的文件数。
func (s *Service) ApplyRound(ctx context.Context, userID, projectID uint) (int, error) {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return 0, err
	}
	if proj == nil {
		return 0, ErrProjectNotFound
	}
	sessionID, err := s.repo.GetProjectSession(projectID)
	if err != nil || sessionID == "" {
		return 0, nil
	}
	changes, err := s.collectWorkspaceChanges(ctx, projectID, sessionID)
	if err != nil {
		return 0, err
	}
	if len(changes) == 0 {
		return 0, nil
	}
	writes := make([]VersionWrite, 0, len(changes))
	for _, c := range changes {
		writes = append(writes, VersionWrite{FileID: c.fileID, Body: c.newBody, SHA: c.newSHA, BaseVersionID: c.baseVer})
	}
	if _, err := s.repo.BatchAppendCurrentVersions(writes, AuthorAgent); err != nil {
		return 0, err
	}
	_ = s.repo.TouchProject(projectID)
	return len(changes), nil
}

// RejectRound 丢弃:重铺源(DB current 覆盖回 cwd)→ 抹掉 agent 本轮未应用的改动。
func (s *Service) RejectRound(ctx context.Context, userID, projectID uint) error {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return err
	}
	if proj == nil {
		return ErrProjectNotFound
	}
	sessionID, err := s.repo.GetProjectSession(projectID)
	if err != nil || sessionID == "" {
		return nil
	}
	return s.materializeProject(ctx, projectID, sessionID)
}

// GetWSHistory 取项目 agent 会话的历史消息(重入恢复用,= agent jsonl 真源,同 claw)。
func (s *Service) GetWSHistory(ctx context.Context, userID, projectID uint) (*agent.SessionMessagesResponse, error) {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return nil, err
	}
	if proj == nil {
		return nil, ErrProjectNotFound
	}
	sessionID, err := s.repo.GetProjectSession(projectID)
	if err != nil || sessionID == "" {
		return &agent.SessionMessagesResponse{Messages: []agent.SessionMessage{}}, nil
	}
	return s.agent.GetSessionMessages(ctx, sessionID)
}

// ReadWorkspaceFile 读会话 cwd 里某文件的当前正文(?full=1 绕截断)—— 流式中前端按 tool_result
// 逐个 refetch 做实时 diff(方案 B:比增量套用稳,MultiEdit/replace_all 不飘位)。
func (s *Service) ReadWorkspaceFile(ctx context.Context, userID, projectID uint, relPath string) (string, bool, error) {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return "", false, err
	}
	if proj == nil {
		return "", false, ErrProjectNotFound
	}
	sessionID, err := s.repo.GetProjectSession(projectID)
	if err != nil || sessionID == "" {
		return "", false, nil
	}
	wf, err := s.agent.ReadWorkspaceFileFull(ctx, sessionID, relPath)
	if err != nil || wf == nil {
		return "", false, err
	}
	if wf.State != "ok" || wf.PreviewType != "text" {
		return "", false, nil
	}
	return wf.Content, true, nil
}
