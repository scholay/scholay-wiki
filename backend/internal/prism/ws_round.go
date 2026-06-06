// ============================================================================
// Prism agent-native 用户 WS 轮次:prepare(铺源)/ apply(固化)/ reject(还原)/ pending
// + ws-ticket + 读 cwd 文件(实时 diff)。AI 对话本身走 agentbridge.HandleWS(纯 pipe),
// 这里只管「轮次边界」的 DB↔cwd 同步 + 应用门。真源仍是 DB(锁定架构 D1)。
// ============================================================================

package prism

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/safego"
)

// WSFeature 暴露 agentbridge FeatureBridge,供 handler 直接挂 HandleWS(WS pipe)。
func (s *Service) WSFeature() *agentbridge.FeatureBridge { return s.feature }

// IssueWSTicket 校验项目归属 → 解析/建该项目的 agent 会话 → 颁发一次性 ws ticket。
//
// 归属归一(migration 0014)后,prism 会话已双写进 agent_sessions,优先走**标准**
// IssueWSTicket(经 OwnsSession 校验,与 smart_search/claw/peerreview 一致)。仅当归属表
// 偶发缺行(双写漏写/回填前的老会话)时,GetProject 已确认项目属本人,降级到 Trusted 颁发
// 并打 warn ——「降级即告警」: 阶段2 对账 SQL 据此盘点,清零后可彻底删掉 Trusted 后门。
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
	// 优先标准路径(OwnsSession 查统一归属表)。
	token, err := s.feature.IssueWSTicket(ctx, userID, sessionID)
	if err == nil {
		return sessionID, token, nil
	}
	// 归属表缺行 → 降级 Trusted(项目归属已由上面 GetProject 校验,安全),并告警留痕给对账。
	if errors.Is(err, agentbridge.ErrSessionMismatch) {
		slog.Warn("prism: agent_sessions owner row missing, fallback to trusted ws-ticket",
			"project_id", projectID, "user_id", userID, "session_id", sessionID)
		token, terr := s.feature.IssueWSTicketTrusted(ctx, userID, sessionID)
		if terr != nil {
			return "", "", terr
		}
		return sessionID, token, nil
	}
	// 其它错误(Redis 不可用等)如实上抛。
	return "", "", err
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
// instruction 为本轮干净指令(前端透传):首次成功固化后用它异步给项目自动起名(best-effort+幂等)。
func (s *Service) ApplyRound(ctx context.Context, userID, projectID uint, instruction string) (int, error) {
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
	// 首次成功固化 → 自动给项目起名(幂等:仅标题仍是默认占位时落库)。独立 goroutine + background ctx
	// (请求结束就 cancel 会打断 LLM 调用),不阻塞 apply 返回;失败全在 maybeAutoNameProject 内部吞掉。
	if strings.TrimSpace(instruction) != "" {
		safego.Go("prism-autoname", func() {
			actx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			s.maybeAutoNameProject(actx, projectID, userID, instruction)
		})
	}
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
// limitTurns>0 时只返回最近 N 个用户轮(超长会话分页,与 claw/smart-search 统一走 sliceRecentTurns),
// 并带回 totalTurns/hasMore 供前端「加载更早」。归属已由 GetProject 校验,走 bridge 的 Paginate
// (不耦合 OwnsSession/双写;一次双写漏写不会让历史加载失败)。
func (s *Service) GetWSHistory(ctx context.Context, userID, projectID uint, limitTurns int) (*agentbridge.SessionMessagesResult, error) {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return nil, err
	}
	if proj == nil {
		return nil, ErrProjectNotFound
	}
	sessionID, err := s.repo.GetProjectSession(projectID)
	if err != nil || sessionID == "" {
		return &agentbridge.SessionMessagesResult{Messages: nil}, nil
	}
	return s.feature.PaginateSessionMessages(ctx, sessionID, limitTurns)
}

// ContextEstimate 取项目 agent 会话的上下文水位(token 占用),给前端 footer 实时展示用量百分比。
// 归属已由 GetProject 校验(同 GetWSHistory,不耦合 OwnsSession/双写)。返回 (nil, nil) 表示按 0 渲染:
// 还没建会话 / agent 还没记上下文(没说过话)/ 会话已不在 agent 端(自愈)。
func (s *Service) ContextEstimate(ctx context.Context, userID, projectID uint) (*agent.SessionContextEstimate, error) {
	proj, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return nil, err
	}
	if proj == nil {
		return nil, ErrProjectNotFound
	}
	sessionID, err := s.repo.GetProjectSession(projectID)
	if err != nil || sessionID == "" {
		return nil, nil
	}
	est, err := s.agent.GetSessionContextEstimate(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return est, nil
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
