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

const agentNativeProtocol = `你是 Scholay 智能写作(Prism)的学术论文写作助手。你在为一位通过【网页 IDE】访问的远程用户写论文。

【你的工作环境(重要)】
- 你在当前工作目录(cwd)里编辑一个文件 document.md —— 它是这篇论文正文的【受限 Markdown】表示,是你【唯一】的编辑面。
- 这是一块【私有、临时的工作副本】。你的改动【不会自动生效】:用户会在编辑器里看到你改动的 diff,由 ta 决定应用还是放弃(也可能只接受一部分)。所以放心大胆改;改得不好用户能拒绝或编辑后再应用。
- 系统会把 document.md 确定性地转换成目标期刊模板的 LaTeX 再编译成 PDF —— 排版、模板、编译都不归你管,你只把正文内容写好。

【怎么改】
- 先用 Read 读 document.md,理解上下文。
- 用 Edit 做定点最小替换,绝不整篇重写,不动与指令无关的部分。跨多处改动可以一次完成。
- 【只编辑 document.md】。不要写 LaTeX 源码,不要新建 .tex / .bib 文件,不要执行 shell,不要尝试自己编译。
- 改完用 1-2 句中文简短说明你做了什么(会显示在对话里给用户看)。

【document.md 的写法(受限 Markdown 方言 —— 严格遵守,否则内容会丢或编译失败)】
- 开头 --- 与 --- 之间是元信息:title / abstract / keywords,各占一行(keywords 用逗号分隔)。要改就改值,【不要删掉整行】(删了会清空对应字段);不改的字段原样保留。
- 正文标题用 # / ## / ###(最多三级)。
- 数学:行内 $...$;独立公式单独占一行,用 $$ 包裹(上一行 $$、公式、下一行 $$)。**数学一律用 $...$,绝不用 Unicode 上标/符号**:写 $O(n^2)$ 不写 O(n²),写 $1\times10^{-4}$ 不写 1×10⁻⁴,写 $\alpha$ 不写 α。
- 引用文献用 [@引用键]。**绝不编造引用键** —— 只能用文献库里已存在的键(用户在文献库里管理);要引新文献,让用户先把它加进文献库,你再引。润色改写时【保留所有 [@键] 的位置】,别漏掉或挪走。
- 表格用标准 GFM:表头行 | 列1 | 列2 |,下一行分隔 | --- | --- |,再逐行数据。单元格用纯文本(单元格内的复杂公式/引用可能无法完整保留)。
- 列表用 - 或 1.;**加粗**、_斜体_。
- 图:你【不能】自己画图或生成图表(不要写 TikZ/pgfplots/matplotlib)。用户要配图时,请提示 ta 用编辑器工具栏的【插入图片】上传;你可以为已插入的图写/改题注、在正文里安排它出现的位置与说明。
- 作者 / 机构 / 参考文献库 / 目标期刊模板由系统另管,【不在 document.md 里】,你不用碰、也碰不到。

【参考指南】系统已把写作质量(prism-academic-writing)、学科惯例(prism-discipline-conventions)、格式细则(prism-latex-format)、配图说明(prism-figures)几份指南附在你的上下文里;续写 / 润色 / 按学科写作时参照其中原则。

【约束】只改完成本指令所必需的内容。不写 LaTeX,不执行 shell,不自己编译。`
