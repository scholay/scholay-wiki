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
	"sync"
	"time"
)

// projectSessionMu 取某项目的会话锁(同进程内串行化取/建,避免并发编辑双建会话 + 丢写 review F2)。
func (s *Service) projectSessionMu(projectID uint) *sync.Mutex {
	m, _ := s.sessionMu.LoadOrStore(projectID, &sync.Mutex{})
	return m.(*sync.Mutex)
}

// resolveConversation 解析「本次请求要操作的对话会话」并【校验归属】(多对话核心接缝,鉴权敏感)。
//   - sessionID 非空:必须确属 (project=projectID, user=userID),否则拒(ErrConversationNotFound)——
//     铁律:绝不信前端裸传的 sessionId 直接用,否则跨项目/越权。
//   - sessionID 空:回落「当前对话」= 该项目 last_accessed_at 最新的一条。
//   - owner 查空但项目指针有会话(存量单会话项目 owner 绑定缺失/迟写)→ 补绑 owner 并用指针会话,
//     绝不另建空会话(防「真会话被顶成孤儿、历史失联」的数据事故)。
//   - create=true(写路径 ticket/prepare)且【连指针都没有】时才新建首条(持项目锁防并发重复建);
//     create=false(读路径 pending/history/context)无对话时返回 ""(不产生副作用)。
//   - s.feature 缺失(未接 agentbridge)→ 回落旧的单会话逻辑。
// 调用方须已 GetProject 校验项目属本人(本方法不重复校项目归属,只校会话↔项目↔人)。
func (s *Service) resolveConversation(ctx context.Context, projectID, userID uint, sessionID string, create bool) (string, error) {
	if s.feature == nil {
		if create {
			return s.ensureProjectSession(ctx, projectID, userID)
		}
		sid, _ := s.repo.GetProjectSession(projectID)
		return sid, nil
	}
	if sessionID != "" {
		ok, err := s.feature.VerifyOwnerSession(userID, "project", uint64(projectID), sessionID)
		if err != nil {
			return "", err
		}
		if !ok {
			return "", ErrConversationNotFound
		}
		return sessionID, nil
	}
	cur, err := s.feature.CurrentOwnerSession("project", uint64(projectID))
	if err != nil {
		return "", err
	}
	if cur != "" {
		return cur, nil
	}
	// 存量兜底(防孤儿,proj105 类事故根因):CurrentOwnerSession 空,但项目指针
	// (prism_projects.agent_session_id)仍指着一条会话 —— 旧单会话项目的 owner 绑定缺失/迟写时会走到这。
	// 补绑 owner 后【用这条指针会话】,绝不另建空会话把带历史的真会话顶成孤儿(它的历史仍在 journal,
	// 补绑后重开即恢复)。上线前普查过存量 39 个项目指针都已 owner-bound,这里是防边角 / 未来回归的安全网。
	if ptr, _ := s.repo.GetProjectSession(projectID); ptr != "" {
		s.bindOwnerSession(projectID, userID, ptr) // 幂等:撞 uk_agent_session_id → UPDATE owner
		return ptr, nil
	}
	if !create {
		return "", nil
	}
	// 建首条对话:持项目锁 + 锁后重查(对齐 ensureProjectSession),防两个并发 open(多 tab / ws-ticket
	// 与 prepare 同时)各建一条重复对话。
	mu := s.projectSessionMu(projectID)
	mu.Lock()
	defer mu.Unlock()
	if cur, _ := s.feature.CurrentOwnerSession("project", uint64(projectID)); cur != "" {
		return cur, nil
	}
	if ptr, _ := s.repo.GetProjectSession(projectID); ptr != "" {
		s.bindOwnerSession(projectID, userID, ptr)
		return ptr, nil
	}
	return s.newConversation(ctx, projectID, userID)
}

// newConversation 新建一条对话(agent 会话 + 绑定 owner=project;多对话下 owner 唯一约束已放开 → INSERT 新行)。
// 与单会话 createProjectSession 的区别:不做「仅当空才认领」的 ClaimProjectSession(那是单会话去重),而是无条件
// 新建 + 把它设为「当前对话」指针(prism_projects.agent_session_id 兼容留存;真源已是 agent_sessions 行)。
func (s *Service) newConversation(ctx context.Context, projectID, userID uint) (string, error) {
	if s.agent == nil {
		return "", errors.New("AI 编辑暂不可用")
	}
	// 必须用 prismSessionOptions()(含 DisallowedTools + 写作 skill 的 AddDirs),与单会话同一构造器。
	created, err := s.agent.CreateSession(ctx, prismSessionOptions())
	if err != nil {
		return "", err
	}
	// 绑定归属 owner_kind=project:UpsertByOwnerEntity 在 owner 唯一放开后,新 session_id 无冲突 → INSERT 新对话行。
	s.bindOwnerSession(projectID, userID, created.SessionID)
	_ = s.repo.SetProjectSession(projectID, created.SessionID) // 当前对话指针(兼容)
	return created.SessionID, nil
}

// ensureProjectSession 取/建该项目的**独立** agent 会话(每项目隔离,存 prism_projects.agent_session_id),
// 消除跨项目上下文串味(review 高危项)。无会话时持项目锁创建,持锁后重读避免双建。
// 注(多对话):新代码走 resolveConversation;本方法保留作 s.feature 缺失时的单会话兜底 + 存量兼容。
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

// 注(2026-07-18):原 recreateProjectSession(agent 404/重启 → 另建新会话 + 移动项目指针)已删除。
// 它是「真会话被顶成孤儿、历史失联」事故的根因(见 proj105:一次 agent 重启把带 5 轮历史的会话甩成孤儿,
// 换上空会话)。当前架构 = executor 无状态 + 历史真源在 backend journal:agent 404 时应【重连同一 session_id】,
// 由 hub.seedHistoryFromJournal 回灌历史,绝不换新会话。resolveConversation 的指针兜底也只补绑、不新建。

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

// agentNativeProtocol —— prism 会话的系统级编辑契约(经 Picker→AppendSystemPrompt/seed 下发,每轮在场)。
// V4-P0 四合一重写:①删幻影指南引用(旧 4 份 skill 已在阶段0拆并,指向真实在场的 3 内核+lens 菜单);
// ②统一 bib 规则 = citation-grounding(自己 minicod 检索→写 references.bib,消灭「只能用已有键」的正面冲突);
// ③规则优先序声明(防「两套指令并存」以工作流形式复发);④cwd 文件政策一次写清(后续工作流不再各改一次协议)。
const agentNativeProtocol = `你是 Scholay 智能写作(Prism)的学术论文写作助手。你在为一位通过【网页 IDE】访问的远程用户写论文。

【你的工作环境(重要)】
- 你在当前工作目录(cwd)里编辑 document.md —— 这篇论文正文的【受限 Markdown】表示,是你的主编辑面。
- 这是一块【私有、临时的工作副本】。你的改动【不会自动生效】:用户会看到 diff,由 ta 决定应用还是放弃。放心大胆改;改得不好用户能拒绝。
- 系统会把 document.md 确定性地转换成目标期刊模板的 LaTeX 再编译成 PDF —— 排版、模板、编译都不归你管,你只把正文内容写好。

【cwd 文件政策(你能读写什么)】
- document.md —— 论文正文,主编辑面(方言细则见常驻的 prism-edit-discipline)。
- references.bib —— 参考文献(BibTeX),你【可以且应该】编辑它:要引证时先用 minicod 检索真实论文,把真实元数据写成条目追加进来,正文用 [@键] 引用;绝不凭记忆编造文献/DOI/年份(铁律见常驻的 prism-citation-grounding)。
- 系统可能在 cwd 放辅助文件(如 plan.md 大纲账 / terminology.md 术语表 / evidence/ 证据摘录 / data/ 用户数据):按其内注释使用,【只读为主】,除非该文件说明允许你写。
- 除上述外不要新建文件;不要写 .tex/.cls、不执行 shell、不自己编译、不画图(TikZ/matplotlib 等一律不写;配图让用户经工具栏【插入图片】上传,你负责题注与正文接读)。
- 作者 / 机构 / 目标期刊模板由系统另管,不在你的编辑面里。

【怎么改】
- 先 Read 理解上下文(大文件可用 offset/limit 只读目标节)。
- 用 Edit 做定点最小替换,绝不整篇重写,不动与指令无关的部分;跨多处改动可以一次完成。
- 改完用 1-2 句中文简短说明你做了什么(会显示在对话里给用户看)。【用内容化表述】——说「补充了方法部分的实验设置」「新增了 3 条参考文献」,不要念 document.md / references.bib / cwd / 路径 等内部文件名(用户看到的是所见即所得的编辑器,没有这些文件的概念)。
- 导出 Word / PDF 是用户点工具栏按钮的事,你不自己导出、不新建交付文件、不宣称「已生成可下载文件」。

【正文写法速览(细则以常驻的 prism-edit-discipline 为准)】
- frontmatter 三行(title/abstract/keywords)改值不删行;标题 #/##/###(≤三级);数学一律 $...$ / $$,绝不用 Unicode 上标符号;要被引用的公式在闭合 $$ 后加 {#eq:键};图/表/节交叉引用 = 打锚 {#fig:/tbl:/sec:键} + 正文 [@键];表格 GFM、单元格纯文本;润色时保留所有既有 [@键] 的位置。

【你的写作能力栈(如何使用)】
- 常驻三内核:prism-writing-core(通用写作声音)/ prism-edit-discipline(方言与编辑纪律)/ prism-citation-grounding(引用反幻觉)—— 始终遵守。
- 本项目的【写作画像】(文体/学科底座)已注入上下文:全程据此定调结构、时态、引用风格与该领域严谨底线。
- 深度技能按需加载:系统上下文里有一份按 craft/rigor 分组的【技能菜单】;遇到对应症状/任务,先用 Skill 工具按名字把指南读进来再动手。

【规则优先序(冲突时依此裁决)】
1. 三内核铁律与本协议(最高,任何时候不被覆盖 —— 尤其引用反幻觉与「不写 LaTeX/不执行 shell」);
2. 阶段性任务指令的临时收紧(仅当其显式声明了生效范围,如「本轮只处理 §2」「本阶段暂不新增引用」,且不与内核铁律冲突);
3. 按需加载的技能指南(方法建议,服务于当前任务)。

【约束】只改完成本指令所必需的内容。`
