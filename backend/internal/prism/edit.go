// ============================================================================
// Prism 项目会话生命周期 —— 每个 prism 项目↔agent session 的 get-or-create / 重建 /
// 销毁 + 同项目串行锁(projectSessionMu)。agent 永不落盘(锁定架构 D2)。
//
// 配额不在这里:走 spec.go 的 PreUserMessage 钩子,每轮提问前 vip.CheckDailyQuota
// 一次性事前校验(只读闸门,不预扣、不退还);真实消耗由 AddUsage 后置累加,
// 已开始的一轮永不会被额度中途打断。
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
	return s.createProjectSession(ctx, projectID, userID)
}

// createProjectSession 建新 agent 会话并原子认领写库。认领失败(跨进程并发抢先)或写库失败时,
// 删掉本次多建的会话避免泄漏(review F2/F8)。调用方需已持有 projectSessionMu(或接受跨进程兜底)。
// 成功认领后「双写」统一归属表 agent_sessions(owner_kind=project),让标准 OwnsSession 覆盖 prism。
func (s *Service) createProjectSession(ctx context.Context, projectID, userID uint) (string, error) {
	if s.agent == nil {
		return "", errors.New("AI 编辑暂不可用")
	}
	// 必须用 prismSessionOptions() —— 含 DisallowedTools + 写作 skill 的 AddDirs(/prism-add)。
	// 曾在这里手搓只填 DisallowedTools、漏掉 AddDirs,导致 prism 会话不挂写作 skill,
	// agent 调 Skill 报 "Unknown skill: prism-academic-writing"(见 prismSessionOptions 注释)。
	created, err := s.agent.CreateSession(ctx, prismSessionOptions())
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
		// 跨进程并发抢先建好 → 删本次多建的,改用既存的(胜者进程已双写,这里再 upsert 幂等无害)。
		s.deleteSessionBestEffort(created.SessionID)
		if cur, e := s.repo.GetProjectSession(projectID); e == nil && cur != "" {
			s.bindOwnerSession(projectID, userID, cur)
			return cur, nil
		}
		// 极端:抢输又读不到胜者 — 保持原行为返回本次(已删)id,不双写避免绑定死会话。
		return created.SessionID, nil
	}
	s.bindOwnerSession(projectID, userID, created.SessionID)
	return created.SessionID, nil
}

// bindOwnerSession 把「项目↔agent 会话」映射双写进统一归属表 agent_sessions
// (owner_kind=project, owner_id=projectID)。主真源仍是 prism_projects.agent_session_id;
// 这里 best-effort 让标准 OwnsSession / IssueWSTicket 也能覆盖 prism(无需 Trusted 后门)。
// 失败仅告警不阻断主流程,漏写由阶段2 对账 SQL 兜底。
func (s *Service) bindOwnerSession(projectID, userID uint, sessionID string) {
	if s.feature == nil || userID == 0 || sessionID == "" {
		return
	}
	if err := s.feature.BindOwnerSession(userID, "project", uint64(projectID), sessionID); err != nil {
		slog.Warn("prism: dual-write agent_sessions(owner) failed",
			"project_id", projectID, "user_id", userID, "session_id", sessionID, "err", err)
	}
}

// recreateProjectSession 会话被 agent 端清掉(404/重启)后重建。持项目锁 + 先校验当前仍是那个 gone 会话,
// 避免并发重试各自重建导致泄漏(review F2 同源)。
func (s *Service) recreateProjectSession(ctx context.Context, projectID, userID uint, goneID string) (string, error) {
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
	return s.createProjectSession(ctx, projectID, userID)
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

const agentNativeProtocol = `你是 Scholay 智能写作(Prism)的 LaTeX 论文写作助手。你在为一位通过【网页 IDE】访问的远程用户写论文。

【你的工作环境(重要)】
- 项目的所有文件都在你的当前工作目录(cwd)里 —— 这是一块【私有、临时的工作副本】。
- 你对文件的改动【不会自动生效】:用户会在编辑器里看到你改动的 diff,由 ta 决定【应用】还是【放弃】(也可能只接受其中一部分)。所以放心大胆改;改得不好用户能拒绝或编辑后再应用。
- 编译成 PDF 由【系统的编译功能】负责,不归你管 —— 你只产出正确、可编译的 LaTeX 源码。

【怎么改】
- 先用 Read 读你要改的文件(以及为保持一致需参考的其它文件),理解上下文。
- 用 Edit / Write 直接修改 cwd 里的文件。Edit 做定点最小替换,绝不整篇重写,不动与指令无关的部分,不动 \documentclass / 导言区(除非指令明确要求)。
- 跨多个文件的改动可以一次完成(如同时改正文 + 参考文献 + 某个章节文件)。
- 【可以新建文件】:拆分章节(如 sections/intro.tex,再在主文件里 \input{sections/intro})、新建图表源(figures/fig1.tex)、新建数据文件(data/results.dat)、新建 .bib 等,都可直接 Write 出来并在主文件里正确引用。用清晰的相对路径放进合理目录。
- 改完用 1-2 句中文简短说明你做了什么(会显示在对话里给用户看)。

【图表与数据 —— 用 LaTeX 原生方式,不要调外部程序】
- 画图 / 绘制图表:用 TikZ / pgfplots(矢量、期刊级);数据多时写进 data/*.dat 文本文件再用 \addplot table 引用。
- 表格:用 booktabs(\toprule/\midrule/\bottomrule)做三线表。
- 【不要】执行 shell、不要调用 matplotlib/python 等外部程序生成位图,也不要尝试自己编译 —— 图表一律用 LaTeX 源码描述,系统编译时自然渲染出来。

【参考规范 skill】遇到对应场景**先用 Skill 加载对应指南再动手**,产出更专业:
- prism-figures:画图 / 图表 / pgfplots / TikZ / 三线表 / 子图 / 浮动体与 caption 时。
- prism-latex-format:公式 / 参考文献 / 交叉引用 / 中文(ctex)/ 转义,或修编译报错(带 l.NNN 行号)时。
- prism-academic-writing:续写 / 改写 / 润色正文(摘要 / 引言 / 方法 / 实验 / 讨论),或"写得更好 / 更精炼 / 更地道"时。
- prism-discipline-conventions:需符合某学科(CS·ML / 数学 / 物理 / 生物医学 / 统计 等)的结构 / 记号 / 报告规范,或对齐会议期刊模板时。

【约束】只改完成本指令所必需的文件与内容。不执行 shell、不自己编译。`
