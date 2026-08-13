// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// Package scidraw 是 scholay「科研绘图」feature 的 thin wrapper —— 在「智能助手」页里以
// 模板卡/mode 形态出现,但后端是一个独立的 agentbridge feature(独立 session 池 / system prompt /
// 工具闸门 / 配额),完全仿 boltslides(制作PPT)的集成范式。
//
// 与 boltslides 的差异:
//   - boltslides 产物是「单文件 HTML 演示稿」(经 BuildDeck 工具编译,需 node 脚手架 TemplateKind);
//   - scidraw 产物是「原创矢量图(SVG,后续 PNG/PDF)」—— L2 示意图 agent 直接用 Write 把 .svg 写进
//     ./out/;L1 数据图 agent 用 Bash 跑 matplotlib savefig 落 ./out/。无脚手架、无 BuildDeck,故
//     SessionOptions 无 TemplateKind。
//
// 分期(见 docs/research/sci-figure-2026-07/PLAN.md):
//   - P0:L2「生成原创矢量」——流程/机制/概念示意,agent 写通用画风 SVG,零新容器依赖。
//   - P1(本期):L1「确定性渲染」——数据图/临床统计图(KM/森林/ROC)走 matplotlib 代码执行,
//     AllowBash=true(jail 内跑 python)+ 镜像构建期烧入 matplotlib/numpy/pandas(见 agent/Dockerfile)。
//     模型只选数据列/参数、绝不发明数字;数据由用户提供。
//
// 关键约束(写在 system prompt + skill 里,backend 工具闸门兜底):
//   - IP 铁律:生成通用科学画风的原创矢量,禁模仿任何指定受版权作品(某张图版/某个具体图标)。
//   - (d) 红线:绝不合成或修改病理/组织学/显微/放射/凝胶blot 等原始一手证据图。
package scidraw

import (
	"context"
	"errors"
	"os"
	"strings"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/prompts"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
)

// FeatureKey 是 agent_sessions.feature_key 取值 + 路由前缀语义标签。改动会让历史 mapping 失效。
const FeatureKey = "sci_draw"

// agentName —— agent 容器内 subagent 名(UpsertSkill 推一份当前 prompt 过去;主流路仍是主 agent + WS 注入)。
const agentName = "scholay-sci-draw"

// PromptSlug / PromptName —— 仅作 PromptChoice 元信息标签(审计/日志),不对应任何 DB 行
// (prompt 内容 = prompts.SciDrawSystemPrompt const)。
const PromptSlug = "scholay-sci-draw-v1"
const PromptName = "Scholay 科研绘图 · 默认 prompt"

// usageRecorder 由 SetUsageRecorder 注入;PreUserMessage 闭包每次提问时懒读取。
var usageRecorder usagestat.Recorder

// SetUsageRecorder 注入使用统计录入器 —— 每次用户发消息(通过配额)记一条 sci_draw / message。允许 nil。
func SetUsageRecorder(r usagestat.Recorder) { usageRecorder = r }

// vipChecker 由 SetVIPChecker 注入 —— 按用户等级做 tier-aware 日额度(与 claw/smart_search 同一链路)。
var vipChecker *vip.Service

// SetVIPChecker 注入会员限额服务。允许 nil(不限额)。
func SetVIPChecker(v *vip.Service) { vipChecker = v }

// VIPCheckerWired 报告配额校验器是否已注入。bootstrap 启动末尾据此断言付费功能已接线,
// 防「新增付费 feature 忘记调 SetVIPChecker → 静默免费(收入泄漏)」。
func VIPCheckerWired() bool { return vipChecker != nil }

// checkQuota / recordQuestion / budgetProvider —— 给 agentbridge.StandardHooks 的适配闭包:
// 结构保证在**调用时**懒读包级 var,故 Set* 可后于 BuildSpec 调用,顺序无关。
func checkQuota(ctx context.Context, userID uint) error {
	if vipChecker == nil {
		return nil
	}
	// 起点闸:窗口额度一到上限即拦(透支带已于 2026-07-30 取消);已在跑的那一轮仍自然跑完。
	if err := vipChecker.CheckDailyQuotaOverdraft(ctx, userID); err != nil {
		if errors.Is(err, vip.ErrQuotaExceeded) {
			return agentbridge.NewQuotaErrorFrom(err) // 保链:error 帧带结构化 quota 字段
		}
		return err
	}
	return nil
}

func budgetProvider(ctx context.Context, userID uint) (soft, hard int64, unlimited bool) {
	if vipChecker == nil {
		return 0, 0, true
	}
	return vipChecker.RemainingBudget(ctx, userID)
}

// turnCostCapProvider(逐帧硬闸)给 hub 在**轮起点**取一次本轮成本硬顶(微元真实成本)。
// 与 budgetProvider 同源但刻意各取一次:vip 侧 RemainingBudget = TurnCostCap × 收尾比例,
// 那个比例是留给 agent 优雅收尾的尾巴,与硬闸没有语义关系 —— 在这里反推会让硬顶随它悄悄漂移。
func turnCostCapProvider(ctx context.Context, userID uint) (int64, bool) {
	if vipChecker == nil {
		return 0, true
	}
	return vipChecker.TurnCostCap(ctx, userID)
}

func recordQuestion(uid *uint) {
	if usageRecorder == nil {
		return
	}
	usageRecorder.Record(usagestat.Event{
		UserID:  uid,
		Feature: usagestat.FeatureSciDraw,
		Action:  "message",
	})
}

// sciDrawSkillAddDir —— 传给 agent --add-dir 的目录(agent 加载 <dir>/.claude/skills:绘图创作 skill)。
// compose 把 ./agent-skills/sci-draw-skills 挂到 <dir>/.claude/skills;只有本 feature 会话装。
func sciDrawSkillAddDir() string {
	if d := strings.TrimSpace(os.Getenv("SCI_DRAW_SKILL_ADDDIR")); d != "" {
		return d
	}
	return "/sci-draw-add"
}

// sciDrawDisallowedTools —— 科研绘图需读输入 + 写 SVG 进 ./out/ + 跑 python 渲数据图。保留
// Read/Write/Edit/Glob/Grep(写矢量文件、读参考)+ Bash(P1 起用 matplotlib 渲数据/统计图,见 AllowBash);
// 禁掉联网/子任务/notebook/多编辑/pandoc 导出(直接写 SVG 或 matplotlib savefig,不用 ExportDocument)。
// ReadDocument 保留(用户上传数据/参考稿时读它)。
var sciDrawDisallowedTools = []string{
	// 🔴 2026-08-08:StatRun / StatReport(2026-08 新增的 builtin)必须显式列出。
	// builtin 工具走 **deny-list** 模式 ⇒ 任何新增 builtin 对**所有老 feature 默认开放**:
	// 它们发版当天就被本 feature 继承了,而 backend permissionAllowed(ws.go:387/400)对二者
	// 无条件 return true。线上调用次数目前是 0(stat_lab 未放量),所以这是已成立的**暴露面**
	// 与每轮 6.7KB 的 tools[] 浪费,不是已发生的事故。统计能力属于 stat_lab,别处不要继承。
	"StatRun", "StatReport",
	"MultiEdit", "NotebookEdit", "LS", "ExportDocument",
	"WebFetch", "WebSearch", "Task", "Agent",
	// 注:AskUserQuestion(交互提问)P1 起放开(绘图前问清图类型/配色/数据来源很自然;UI 复用 claw 的
	// ConversationWorkspace 自动获得输入框上方分步面板),故**不**列入禁用。见 docs/research/ask-mode-2026-07。
}

// sciDrawAllowedMcpTools —— 对 minicod MCP 的**正向白名单**(去 mcp__minicod__ 前缀原始名)。
//
// 🔴 2026-08-08 补。缺这一项的后果是**每轮**把 minicod 全部 76 个检索工具塞进 tools[]:
//    容器内实测本 feature 的每轮工具面 = 92 个工具 / 142,378 字节,冷起轮 input_tokens 落在
//    40,623~43,411(对照配了白名单的 claw 16,615、prism 15,077)。而线上该 feature 的
//    MCP 调用次数是 **0**(sci_draw 61 次工具调用里 MCP 0 次)—— 约 36,800 tokens/轮是纯死重,还稀释注意力。
//    smart_search/spec.go 的注释早就警告过这一点,三个新 feature 全部漏配。
//
// 收敛到「引用接地」最小集:要给图/稿/报告标一条真实文献时够用,泛检索不给。
var sciDrawAllowedMcpTools = []string{"search_papers", "get_paper", "get_paper_by_doi"}

// BuildSpec 构造 sci_draw 的 FeatureSpec。
func BuildSpec() agentbridge.FeatureSpec {
	pre, onComplete := agentbridge.StandardHooks(agentbridge.StandardHooksConfig{
		FeatureKey:     FeatureKey,
		CheckQuota:     checkQuota,
		RecordQuestion: recordQuestion,
	})
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 科研绘图:生成原创矢量科研图(SVG,示意/流程/机制)",
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, prompts.SciDrawSystemPrompt),
		Color:                  "violet",
		InjectPromptOnFirstMsg: true, // 主 agent 默认 prompt 强,绘图身份 + IP/合规约束要每首条消息前覆盖
		// 默认模型走 chat_default.sci_draw 绑定(admin 模型目录页可改;未绑定 → 执行器全局兜底)。
		PermissionMode: agentbridge.PermissionAuto,
		// P1 起开 Bash:L1 数据图/统计图走 matplotlib 代码执行(在断网 bwrap jail 内跑,任意 python 的
		// 安全边界靠容器沙箱,同 claw)。L2 生成矢量仍可直接 Write SVG,不必用 shell。
		AllowBash:         true,
		PreUserMessage:    pre,
		OnMessageComplete: onComplete,
		BudgetProvider:    budgetProvider,
		TurnCostCap:       turnCostCapProvider,
		SessionOptions: &agent.CreateSessionOptions{
			// 放开文件工具(写 SVG)+ Bash(跑 matplotlib);禁网/子任务/pandoc 导出(allowBash=true)。
			DisallowedTools: agentbridge.SessionDisallowedTools(sciDrawDisallowedTools, true),
			// MCP 正向白名单:收敛 minicod 76 工具到引用接地最小集(见 sciDrawAllowedMcpTools)。
			AllowedMcpTools: sciDrawAllowedMcpTools,
			// 每个会话加载绘图创作 skill(--add-dir /sci-draw-add)。
			AddDirs: []string{sciDrawSkillAddDir()},
		},
	}
}
