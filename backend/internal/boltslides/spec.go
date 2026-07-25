// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// Package boltslides 是 scholay「制作PPT」feature 的 thin wrapper —— 在「智能助手」页里以选项卡
// 形态出现,但后端是一个独立的 agentbridge feature(独立 session 池 / system prompt / 工具闸门 / 配额)。
//
// 与 claw 的差异:claw 是通用对话助手;boltslides 专做一件事 —— 用预置的 bolt-slides 脚手架
// (Vite+React 演示引擎)创作演示稿,产物是**单文件 HTML**(经 BuildDeck 工具编译),走 claw 同款
// ./out → MinIO 产物管线交付(见 artifact.go / artifact_harvest.go,照 internal/claw 抄)。
//
// 关键选择:
//   - 会话建好时往可写 cwd 铺一份镜像预装的 bolt-slides 脚手架(SessionOptions.TemplateKind),
//     agent 只编辑 src/App.tsx + tokens.css + index.html,再调 BuildDeck 编译成单文件 HTML。
//   - 不给 Bash(AllowBash=false):构建走 BuildDeck 工具(执行器进程内、bwrap 外,能访问 /opt
//     预装依赖),模型无需 shell;放开 Read/Write/Edit/Glob/Grep/BuildDeck 编辑脚手架。
package boltslides

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
const FeatureKey = "boltslides"

// agentName —— agent 容器内 subagent 名(UpsertSkill 推一份当前 prompt 过去,主流路仍是主 agent + WS 注入)。
const agentName = "scholay-boltslides"

// PromptSlug / PromptName —— 仅作 PromptChoice 元信息标签(审计/日志),不对应任何 DB 行
// (prompt 内容 = prompts.BoltSlidesSystemPrompt const)。
const PromptSlug = "scholay-boltslides-v1"
const PromptName = "Scholay 制作PPT · 默认 prompt"

// TemplateKind —— 建会话时让执行器往可写 cwd 铺的脚手架种类(见 agent/src/server/sessions.ts seedTemplate)。
const TemplateKind = "bolt-slides"

// usageRecorder 由 SetUsageRecorder 注入;PreUserMessage 闭包每次提问时懒读取。
var usageRecorder usagestat.Recorder

// SetUsageRecorder 注入使用统计录入器 —— 每次用户发消息(通过配额)记一条 boltslides / message。允许 nil。
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
	// SS#2:有界透支版起点闸 —— 跨过日上限那轮总能起跑,只有透支带也用完才拦。
	if err := vipChecker.CheckDailyQuotaOverdraft(ctx, userID); err != nil {
		if errors.Is(err, vip.ErrQuotaExceeded) {
			return agentbridge.NewQuotaError(err.Error())
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

func recordQuestion(uid *uint) {
	if usageRecorder == nil {
		return
	}
	usageRecorder.Record(usagestat.Event{
		UserID:  uid,
		Feature: usagestat.FeatureBoltSlides,
		Action:  "message",
	})
}

// boltSlidesSkillAddDir —— 传给 agent --add-dir 的目录(agent 加载 <dir>/.claude/skills:slides 创作 skill)。
// compose 把 ./agent-skills/bolt-slides-add 挂到 <dir>/.claude/skills;只有本 feature 会话装。
func boltSlidesSkillAddDir() string {
	if d := strings.TrimSpace(os.Getenv("BOLT_SLIDES_SKILL_ADDDIR")); d != "" {
		return d
	}
	return "/bolt-slides-add"
}

// boltSlidesDisallowedTools —— 制作PPT 只需编辑脚手架 + BuildDeck 编译。放开 Read/Write/Edit/Glob/Grep/
// BuildDeck/TodayDate/Skill;禁掉联网/子任务/notebook/pandoc 导出(交付走 BuildDeck 单文件,不用 ExportDocument)。
// Bash 三件套由 SessionDisallowedTools(allowBash=false)另行并入 —— 构建走 BuildDeck(执行器进程内),
// 模型无需 shell。ReadDocument 名义上保留,但制作PPT 当前无文件上传通道(前端 enableAttachments=false),
// 实际不会触发;用户要用文档内容作 deck 依据需把关键内容粘贴到对话(prompt 已如实告知)。
var boltSlidesDisallowedTools = []string{
	"MultiEdit", "NotebookEdit", "LS", "ExportDocument",
	"WebFetch", "WebSearch", "Task", "Agent",
	// 注:AskUserQuestion(交互提问)P1 起放开(制作PPT 前问清听众/篇幅/风格很自然;UI 复用 claw 的
	// ConversationWorkspace 自动获得输入框上方分步面板),故**不**列入禁用。见 docs/research/ask-mode-2026-07。
}

// BuildSpec 构造 boltslides 的 FeatureSpec。
func BuildSpec() agentbridge.FeatureSpec {
	pre, onComplete := agentbridge.StandardHooks(agentbridge.StandardHooksConfig{
		FeatureKey:     FeatureKey,
		CheckQuota:     checkQuota,
		RecordQuestion: recordQuestion,
	})
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 制作PPT:用 bolt-slides 引擎创作单文件 HTML 演示稿",
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, prompts.BoltSlidesSystemPrompt),
		Color:                  "amber",
		InjectPromptOnFirstMsg: true, // 主 agent 默认 prompt 强,创作身份要每首条消息前覆盖
		// 默认模型走 chat_default.boltslides 绑定(admin 模型目录页可改;未绑定 → 执行器全局兜底)。
		PermissionMode: agentbridge.PermissionAuto,
		// 构建走 BuildDeck 工具(执行器进程内、bwrap 外),模型无需 Bash;AllowBash 保持零值 false。
		AllowBash:         false,
		PreUserMessage:    pre,
		OnMessageComplete: onComplete,
		BudgetProvider:    budgetProvider,
		SessionOptions: &agent.CreateSessionOptions{
			// 放开脚手架编辑 + BuildDeck;禁网/子任务/pandoc 导出 + Bash 三件套(allowBash=false)。
			DisallowedTools: agentbridge.SessionDisallowedTools(boltSlidesDisallowedTools, false),
			// 每个会话加载 bolt-slides 创作 skill(--add-dir /bolt-slides-add)。
			AddDirs: []string{boltSlidesSkillAddDir()},
			// 建会话时把镜像预装的 bolt-slides 脚手架铺进可写 cwd(node_modules 软链只读预装依赖),供 BuildDeck 构建。
			TemplateKind: TemplateKind,
		},
	}
}
