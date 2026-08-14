// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// Package statlab 是 scholay「数据分析」feature 的 thin wrapper —— 在「智能助手」页里以
// 模板卡形态出现,后端是独立的 agentbridge feature(独立 session 池 / system prompt / 工具闸门 / 配额),
// 集成范式完全仿 boltslides(制作PPT)与 scidraw(科研绘图)。
//
// ## 与前两张卡的根本差异:算数的不是模型
//
// boltslides / scidraw 的产物由模型直接产出(写 deck 源码 / 写 SVG)。
// 数据分析**不能这样**:实证显示模型在真实数据上**选错统计方法 38.4%**(JCO CCI 2025-12),
// 而 StatQA 进一步指出主错型是 applicability error(「知道该做 t 检验,但没意识到数据不满足前提」)
// —— 恰恰是 100% 可机械判定的那一类。
//
// 故本 feature 的架构是「**引擎算数、模型问诊**」:
//   - 前提检验、方法选择白名单、报告里的每个数字 → 确定性引擎 statkit(agent/stat-kit/);
//   - 问诊(AskUserQuestion)、数据清洗、结果的定性解读与对话 → 模型。
//
// ## 两道与本 feature 强相关的物理闸(不是提示词约束)
//
//   - **D1 数字锁**:`analysis/`(bundle 目录)是引擎独占保留区(agent/src/sandbox/reserved.ts)。
//     模型的 Write/Edit 被 confinePath 拒、jail 内 Bash 被 bwrap 只读覆盖层拒;
//     唯一写入通道是 executor 侧 `StatRun` 工具(全仓唯一带 writableReserved 的 spawn)。
//     ⇒ 模型可以**调用**引擎,没有任何路径能**绕过**它伪造数据源。
//   - **D2 交付闸**:交付物里的数字若在 bundle 里找不到源,文件被物理移出 `out/`
//     (agent/src/turn/deliveryGate.ts)。压 artifact 帧是假闸 —— backend 收割走
//     `ListWorkspaceFiles(out/)`,与帧无关。**默认 observe 只记录**,先采假阳性率再开硬拦。
//
// ## 红线(system prompt + skill 写明,引擎层兜底)
//
//   - **拒绝 p-hacking**:「帮我把 p 调显著」「只报显著的」一律拒,并给出合规替代
//     (报告效应量与 CI、如实写「未发现显著差异」)—— 静默拒绝只会把用户推去代做。
//   - **PHI 提醒**:行级数据不进模型上下文(引擎 stdout 只回聚合摘要),但仍提示用户先去标识化。
package statlab

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
const FeatureKey = "stat_lab"

// agentName —— agent 容器内 subagent 名(UpsertSkill 推一份当前 prompt 过去;主流路仍是主 agent + WS 注入)。
const agentName = "scholay-stat-lab"

// PromptSlug / PromptName —— 仅作 PromptChoice 元信息标签(审计/日志),不对应任何 DB 行
// (prompt 内容 = prompts.StatLabSystemPrompt const)。
const PromptSlug = "scholay-stat-lab-v1"
const PromptName = "Scholay 数据分析 · 默认 prompt"

// usageRecorder 由 SetUsageRecorder 注入;PreUserMessage 闭包每次提问时懒读取。
var usageRecorder usagestat.Recorder

// SetUsageRecorder 注入使用统计录入器 —— 每次用户发消息(通过配额)记一条 stat_lab / message。允许 nil。
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
		Feature: usagestat.FeatureStatLab,
		Action:  "message",
	})
}

// statLabSkillAddDir —— 传给 agent --add-dir 的目录(agent 加载 <dir>/.claude/skills:数据分析 skill)。
// compose 把 ./agent-skills/stat-lab-skills 挂到 <dir>/.claude/skills;只有本 feature 会话装。
func statLabSkillAddDir() string {
	if d := strings.TrimSpace(os.Getenv("STAT_LAB_SKILL_ADDDIR")); d != "" {
		return d
	}
	return "/stat-lab-add"
}

// statLabDisallowedTools —— 数据分析的工具面。
//
// **保留**:Read/Write/Edit/Glob/Grep(读上传数据、写清洗脚本与交付物)、Bash(数据清洗与重塑 ——
// 「车道 B」,模型自由写 pandas 是被允许的,因为清洗错了容易被下游断言抓到,且 B4 实证显示
// 模型在数据修复上强于 baseline)、ReadDocument(读用户传的 SPSS 输出/文献)、
// ExportDocument(导出 docx/pdf)、AskUserQuestion(**问诊主工具** —— 「把研究设计问出来」这一步
// 全行业没有一家在做,是本 feature 的核心差异化)、StatRun(唯一的统计计算通道)。
//
// **禁掉**:联网(WebFetch/WebSearch —— 纯统计不触检索,且用户未发表数据不该有出网机会)、
// 子任务(Task/Agent)、MultiEdit/NotebookEdit/LS、BuildDeck(那是 PPT 的)。
//
// ⚠️ 注意这里**不禁 Bash**:统计计算虽然只能走 StatRun,但清洗需要 shell。
// 「模型不能自己算统计」不是靠禁 Bash 实现的(那也挡不住 python 直接算),
// 而是靠 D1/D2 两道物理闸 —— 它算了也进不了 bundle、写进交付物会被闸拦。
// 用工具面收窄来做安全边界是脆的,用物理边界才结实。
var statLabDisallowedTools = []string{
	"MultiEdit", "NotebookEdit", "LS", "BuildDeck",
	"WebFetch", "WebSearch", "Task", "Agent",
}

// statLabAllowedMcpTools —— 对 minicod MCP 的**正向白名单**(去 mcp__minicod__ 前缀原始名)。
//
// 🔴 2026-08-08 补。缺这一项的后果是**每轮**把 minicod 全部 76 个检索工具塞进 tools[]:
//    容器内实测本 feature 的每轮工具面 = 92 个工具 / 142,471 字节,冷起轮 input_tokens 落在
//    40,623~43,411(对照配了白名单的 claw 16,615、prism 15,077)。而线上该 feature 的
//    MCP 调用次数是 **0**(stat_lab 尚未放量,线上 0 次)—— 约 36,800 tokens/轮是纯死重,还稀释注意力。
//    smart_search/spec.go 的注释早就警告过这一点,三个新 feature 全部漏配。
//
// 收敛到「引用接地」最小集:要给图/稿/报告标一条真实文献时够用,泛检索不给。
var statLabAllowedMcpTools = []string{"search_papers", "get_paper", "get_paper_by_doi"}

// BuildSpec 构造 stat_lab 的 FeatureSpec。
func BuildSpec() agentbridge.FeatureSpec {
	pre, onComplete := agentbridge.StandardHooks(agentbridge.StandardHooksConfig{
		FeatureKey:     FeatureKey,
		CheckQuota:     checkQuota,
		RecordQuestion: recordQuestion,
	})
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 数据分析:实测前提 + 决策表守门 + 出可投稿的三线表与统计段",
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, prompts.StatLabSystemPrompt),
		Color:                  "teal",
		InjectPromptOnFirstMsg: true, // 主 agent 默认 prompt 强,「引擎算数、模型不自己算」的身份要每首条消息前覆盖
		// 默认模型走 chat_default.stat_lab 绑定(admin 模型目录页可改;未绑定 → 执行器全局兜底)。
		PermissionMode: agentbridge.PermissionAuto,
		// 开 Bash:数据清洗与重塑走 pandas(断网 bwrap jail 内)。统计计算另走 StatRun 工具,
		// 边界不靠禁 Bash 维持(禁不住),靠 D1/D2 两道物理闸 —— 见包头。
		AllowBash:         true,
		PreUserMessage:    pre,
		OnMessageComplete: onComplete,
		BudgetProvider:    budgetProvider,
		TurnCostCap:       turnCostCapProvider,
		SessionOptions: &agent.CreateSessionOptions{
			// 放开文件工具 + Bash(清洗)+ StatRun(统计);禁网/子任务。
			DisallowedTools: agentbridge.SessionDisallowedTools(statLabDisallowedTools, true),
			// MCP 正向白名单:收敛 minicod 76 工具到引用接地最小集(见 statLabAllowedMcpTools)。
			AllowedMcpTools: statLabAllowedMcpTools,
			// 每个会话加载数据分析 skill(--add-dir /stat-lab-add)。
			AddDirs: []string{statLabSkillAddDir()},
		},
	}
}
