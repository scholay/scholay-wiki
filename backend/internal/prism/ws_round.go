// ============================================================================
// Prism agent-native 用户 WS 轮次:prepare(铺源)/ apply(固化)/ reject(还原)/ pending
// + ws-ticket + 读 cwd 文件(实时 diff)。AI 对话本身走 agentbridge.HandleWS(纯 pipe),
// 这里只管「轮次边界」的 DB↔cwd 同步 + 应用门。真源仍是 DB(锁定架构 D1)。
// ============================================================================

package prism

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
)

// WSFeature 暴露 agentbridge FeatureBridge,供 handler 直接挂 HandleWS(WS pipe)。
func (s *Service) WSFeature() *agentbridge.FeatureBridge { return s.feature }

// IssueWSTicket 校验项目归属 → 解析/建该项目的 agent 会话 → 颁发一次性 ws ticket。
//
// 归属归一(migration 0014)后,prism 会话已双写进 agent_sessions,走**标准**
// IssueWSTicket(经 OwnsSession 校验,与 smart_search/claw/peerreview 一致)。若归属表偶发
// 缺行(双写漏写 / reconcile 尚未扫到的新会话),不再绕过校验:GetProject 已确认项目属本人,
// 据此**自愈补写** owner 映射(BindOwnerSession),再重试一次标准 IssueWSTicket。
// Trusted 后门(IssueWSTicketTrusted)已退役 —— 缺行从「绕过鉴权」变成「补全鉴权数据」(C12)。
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
	// 标准路径(OwnsSession 查统一归属表)。
	token, err := s.feature.IssueWSTicket(ctx, userID, sessionID)
	if err == nil {
		return sessionID, token, nil
	}
	// 归属表缺行(双写漏写 / reconcile 未扫到的新会话)→ 不绕过校验,而是用已校验的归属
	// (上面 GetProject 已确认项目属本人)自愈补写 owner 映射,再重试一次标准颁发。
	if errors.Is(err, agentbridge.ErrSessionMismatch) {
		slog.Warn("prism: agent_sessions owner row missing, self-healing owner binding",
			"project_id", projectID, "user_id", userID, "session_id", sessionID)
		if bindErr := s.feature.BindOwnerSession(userID, "project", uint64(projectID), sessionID); bindErr != nil {
			// 自愈写失败 → fail-closed:不颁发 ticket,WS 升级会 401。这关系到鉴权数据完整性,
			// 不能在补写失败时还颁发(否则等于退回后门)。前端可重试,reconcile 兜底亦会补上。
			slog.Error("prism: self-heal owner binding failed, refusing ws-ticket",
				"project_id", projectID, "user_id", userID, "session_id", sessionID, "err", bindErr)
			return "", "", bindErr
		}
		token, terr := s.feature.IssueWSTicket(ctx, userID, sessionID)
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
// IsNew=true 表示 agent 本轮新建的文件(DB 还没有,OldBody 为空,渲染为全新增);FileID 为 0。
type PendingFile struct {
	FileID  uint   `json:"file_id"`
	RelPath string `json:"rel_path"`
	OldBody string `json:"old_body"`
	NewBody string `json:"new_body"`
	IsNew   bool   `json:"is_new,omitempty"`
	// struct 轨:agent 改动前后的结构体(供前端渲染 Word 式痕迹 diff,而非 markdown 代码 diff)。
	OldStruct json.RawMessage `json:"old_struct,omitempty"`
	NewStruct json.RawMessage `json:"new_struct,omitempty"`
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
	if proj.SchemaVersion == SchemaStruct {
		return s.pendingStructRound(ctx, projectID, sessionID)
	}
	changes, err := s.collectWorkspaceChanges(ctx, projectID, sessionID)
	if err != nil {
		return nil, err
	}
	out := make([]PendingFile, 0, len(changes))
	for _, c := range changes {
		out = append(out, PendingFile{FileID: c.fileID, RelPath: c.relPath, OldBody: c.oldBody, NewBody: c.newBody, IsNew: c.isNew})
	}
	return out, nil
}

// ApplyRound 应用:读回 cwd 变更 → 单事务固化进 DB(author=agent)。返回固化的文件数。
// instruction 为本轮干净指令(前端透传):首次成功固化后用它异步给项目自动起名(best-effort+幂等)。
// overrides(可选,per-file/per-hunk):relPath→最终正文(前端在 diff 编辑器里可能删掉了部分 hunk)。
//   非空 → 只固化 overrides 列出的文件、用其正文(用户选择性接受);为空 → 固化 cwd 全部改动(整轮应用)。
func (s *Service) ApplyRound(ctx context.Context, userID, projectID uint, instruction string, overrides map[string]string) (int, error) {
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
	// struct 轨:读回 cwd document.md → parse → 合并进结构体(不走文件版本固化)。
	if proj.SchemaVersion == SchemaStruct {
		return s.applyStructRound(ctx, projectID, sessionID)
	}
	changes, err := s.collectWorkspaceChanges(ctx, projectID, sessionID)
	if err != nil {
		return 0, err
	}
	if len(changes) == 0 {
		return 0, nil
	}

	byPath := make(map[string]changedFile, len(changes))
	for _, c := range changes {
		byPath[c.relPath] = c
	}
	var existing []VersionWrite
	var created []NewFileWrite
	add := func(c changedFile, body string) {
		if c.isNew {
			created = append(created, NewFileWrite{
				RelPath: c.relPath, Kind: c.kind, Mime: mimeFor(c.relPath), Body: body, SHA: sha256Hex(body),
			})
			return
		}
		if body == c.oldBody {
			return // 用户把改动全部还原 → 无实质变化,跳过(不写空版本)
		}
		existing = append(existing, VersionWrite{FileID: c.fileID, Body: body, SHA: sha256Hex(body), BaseVersionID: c.baseVer})
	}
	if len(overrides) > 0 {
		for relPath, body := range overrides {
			if c, ok := byPath[relPath]; ok {
				add(c, body)
			}
		}
	} else {
		for _, c := range changes {
			add(c, c.newBody)
		}
	}
	if len(existing) == 0 && len(created) == 0 {
		return 0, nil
	}
	if err := s.repo.ApplyRoundTx(projectID, existing, created, AuthorAgent); err != nil {
		return 0, err
	}
	appliedCount := len(existing) + len(created)
	_ = s.repo.TouchProject(projectID)
	// 项目自动起名已移到 agent 容器:前端发编辑指令时随 user_message 帧带干净 titleSeed,agent 跑
	// 廉价标题模型生成项目名经 session_title_updated 帧回传,backend 在 agentbridge pipe 里 tap →
	// handleAgentTitle 落库(见 autoname.go)。此处不再触发后端起名 LLM(instruction 留作他用 / 审计)。
	_ = instruction
	return appliedCount, nil
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
