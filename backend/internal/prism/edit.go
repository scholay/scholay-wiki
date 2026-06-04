// ============================================================================
// Prism AI 编辑 —— agent 出 [PRISM_PATCH] → 后端应用到 DB current → 提案(proposed_body)
// → 前端内联 diff → accept(乐观并发)。agent 永不落盘(锁定架构 D2)。
//
// 两种入口共用一条执行路径 runStream:
//   - 异步(StartEdit/StartFix):后台 goroutine 跑,前端轮询 GetEdit(保留,非流式回退)
//   - 流式(StreamEdit/StreamFix):SSE handler 同步跑 + onDelta/onStatus 推进度(对话面板用)
// 配额在 prep 阶段预扣;失败 runStream 退还。
// ============================================================================

package prism

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/agent"
)

// projectSessionMu 取某项目的会话锁(同进程内串行化取/建,避免并发编辑双建会话 + 丢写 review F2)。
func (s *Service) projectSessionMu(projectID uint) *sync.Mutex {
	m, _ := s.sessionMu.LoadOrStore(projectID, &sync.Mutex{})
	return m.(*sync.Mutex)
}

// ensureProjectSession 取/建该项目的**独立** agent 会话(每项目隔离,存 prism_projects.agent_session_id),
// 消除跨项目上下文串味(review 高危项)。无会话时持项目锁创建,持锁后重读避免双建。
func (s *Service) ensureProjectSession(ctx context.Context, projectID, userID uint) (string, error) {
	p, err := s.repo.GetProject(projectID, userID)
	if err != nil {
		return "", err
	}
	if p == nil {
		return "", ErrProjectNotFound
	}
	if p.AgentSessionID != nil && *p.AgentSessionID != "" {
		return *p.AgentSessionID, nil
	}
	mu := s.projectSessionMu(projectID)
	mu.Lock()
	defer mu.Unlock()
	// 持锁后重读:同进程并发已被串行化,可能已被前一个请求建好。
	if cur, _ := s.repo.GetProjectSession(projectID); cur != "" {
		return cur, nil
	}
	return s.createProjectSession(ctx, projectID)
}

// createProjectSession 建新 agent 会话并原子认领写库。认领失败(跨进程并发抢先)或写库失败时,
// 删掉本次多建的会话避免泄漏(review F2/F8)。调用方需已持有 projectSessionMu(或接受跨进程兜底)。
func (s *Service) createProjectSession(ctx context.Context, projectID uint) (string, error) {
	if s.agent == nil {
		return "", errors.New("AI 编辑暂不可用")
	}
	created, err := s.agent.CreateSession(ctx, &agent.CreateSessionOptions{DisallowedTools: prismDisallowedTools})
	if err != nil {
		return "", err
	}
	won, err := s.repo.ClaimProjectSession(projectID, created.SessionID)
	if err != nil {
		slog.Error("prism: persist agent session failed", "project_id", projectID, "session_id", created.SessionID, "err", err)
		s.deleteSessionBestEffort(created.SessionID) // 写库失败 → 别留孤儿会话
		return "", err
	}
	if !won {
		// 跨进程并发抢先建好 → 删本次多建的,改用既存的。
		s.deleteSessionBestEffort(created.SessionID)
		if cur, e := s.repo.GetProjectSession(projectID); e == nil && cur != "" {
			return cur, nil
		}
	}
	return created.SessionID, nil
}

// recreateProjectSession 会话被 agent 端清掉(404/重启)后重建。持项目锁 + 先校验当前仍是那个 gone 会话,
// 避免并发重试各自重建导致泄漏(review F2 同源)。
func (s *Service) recreateProjectSession(ctx context.Context, projectID uint, goneID string) (string, error) {
	if s.agent == nil {
		return "", errors.New("AI 编辑暂不可用")
	}
	mu := s.projectSessionMu(projectID)
	mu.Lock()
	defer mu.Unlock()
	if cur, _ := s.repo.GetProjectSession(projectID); cur != "" && cur != goneID {
		return cur, nil // 已被并发请求重建
	}
	if err := s.repo.SetProjectSession(projectID, ""); err != nil { // 清空让 claim 能写入
		return "", err
	}
	return s.createProjectSession(ctx, projectID)
}

// deleteSessionBestEffort 删 agent 会话(清理多建/孤儿),失败仅告警。
func (s *Service) deleteSessionBestEffort(sessionID string) {
	if s.agent == nil || sessionID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.agent.DeleteSession(ctx, sessionID); err != nil {
		slog.Warn("prism: delete orphan agent session failed", "session_id", sessionID, "err", err)
	}
}

// isSessionGone 判断 agent 会话是否已不存在(404/重启),用于重建重试。
func isSessionGone(err error) bool {
	if errors.Is(err, agent.ErrSessionNotFound) {
		return true
	}
	var he *agent.HTTPError
	if errors.As(err, &he) {
		return he.StatusCode == 404
	}
	return strings.Contains(err.Error(), "404")
}

const agentNativeProtocol = `你是 Scholay 智能写作(Prism)的 LaTeX 编辑助手。用户在写一篇 LaTeX 论文,项目的所有文件就在你的当前工作目录里。

【工作方式】
- 先用 Read 读取你要修改的文件(以及为保持一致需要参考的其它文件),理解上下文。
- 用 Edit / Write 工具**直接修改**工作目录里的文件来完成指令。Edit 做定点最小替换,绝不重写整篇,不要改与指令无关的部分,不要动 \documentclass / 导言区(除非指令明确要求)。
- 改完后用 1-2 句中文简短说明你做了什么(给用户看,会显示在对话里)。

【约束】只修改完成本指令所必需的文件与内容。不要执行 shell 命令、不要尝试自己编译(编译由系统负责)。`
