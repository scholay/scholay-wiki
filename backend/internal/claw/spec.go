// ============================================================================
// Scholay 智能助手 (Claw) — FeatureSpec
//
// 与 smart_search 的差异:
//   smart_search 是受限的"找论文"机器人, 只允许 mcp__minicod__*, 强约束输出格式;
//   Claw 是通用研究助手 — 用户可以问任何科研问题、上传 PDF/图片、让它做总结/
//   解释/翻译/写作建议, 同时也能调 mcp__minicod__* 查文献期刊。
//
// prompt 演进:
//   v3 曾把 systemPrompt 从 Go const 迁到 feature_prompts 表 (走 BySlugPicker), 让 admin
//   后台不重启改 prompt。后又决定: 这类"单条简单提示词"不必用 DB 表, 统一回到代码静态管理
//   (internal/prompts), 复杂逻辑交给 skills。故现在 systemPrompt = prompts.ClawSystemPrompt
//   const, 通过 agentbridge.StaticPicker 注入, 不再依赖 promptregistry / feature_prompts。
//   代价: 改 prompt = 改代码 + 重新部署 (无 admin 热改 / 版本回滚)。
// ============================================================================

package claw

import (
	"context"
	"errors"
	"os"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/prompts"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
)

// clawSkillAddDir —— 传给 agent --add-dir 的目录(agent 加载 <dir>/.claude/skills 与 <dir>/CLAUDE.md)。
// claw 专属:放 library-reference skill(教 agent 用「引用文献」物化进 cwd 的 references/)+ CLAUDE.md
// (始终生效的渲染约束:聊天界面渲染 mermaid/svg/表格,禁 ASCII 画图 / 禁为渲染生成 HTML)。
// CLAUDE.md 经 --add-dir 加载需容器 env CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1(见 compose)。
// 与 prism /prism-add、peerreview /peerreview-add 同模式,互不可见。compose 把
// ./agent/data/claude/claw-add 整目录挂到 /claw-add。
func clawSkillAddDir() string {
	if d := os.Getenv("CLAW_SKILL_ADDDIR"); d != "" {
		return d
	}
	return "/claw-add"
}

// clawPermissionMode —— C14 审批轴。默认 auto(backend 自动裁决,不透传前端);
// 仅当 env CLAW_PERMISSION_PASSTHROUGH=1 时切 passthrough —— 这是**测试 / 未来 HITL 的验证开关**,
// 让客户端能收到 permission_request 并回 permission_response 解锁工具。生产不设此 env,行为 = auto。
// 安全:claw 的 AllowBash=true(能力轴本就放开)+ agent 端 --disallowed-tools 是独立第一道防线,
// 故 passthrough 不放大 claw 权限面。其它靠 cwd 围栏的 feature 绝不可这样开。
func clawPermissionMode() agentbridge.PermissionMode {
	if os.Getenv("CLAW_PERMISSION_PASSTHROUGH") == "1" {
		return agentbridge.PermissionPassthrough
	}
	return agentbridge.PermissionAuto
}

const FeatureKey = "claw"
const agentName = "scholay-claw"

// PromptSlug / PromptName — 仅作 PromptChoice 的元信息标签 (审计 / 日志展示);
// 已不再对应任何 DB 行。
const PromptSlug = "scholay-claw-v1"
const PromptName = "Scholay 智能助手 · 默认 prompt"

// usageRecorder 由 SetUsageRecorder 注入; PreUserMessage 闭包在每次消息触发时
// **懒读取**这个 package var, 因此 SetUsageRecorder 不必赶在 BuildSpec 之前
// 调用 —— BuildSpec 拿到的是闭包, 闭包指向当前的 package var。
var usageRecorder usagestat.Recorder

// SetUsageRecorder 注入使用统计录入器 —— 用户每次"对话"(发 user_message)且通过
// 配额时记一条 claw / message。允许 nil 表示禁用。
func SetUsageRecorder(r usagestat.Recorder) {
	usageRecorder = r
}

// skillsProvider 由 SetSkillsProvider 注入(bootstrap)—— skill 市场:按 userID 现算该用户启用的
// 市场 skill(≤5 份内联内容)。lazy 包级 var,BuildSpec 拿到的是闭包 sessionSkills 指向它,故注入顺序无关。
// nil = 无用户 skill(市场未接线)。
var skillsProvider agentbridge.SessionSkillsProviderFn

// SetSkillsProvider 注入 skill 市场的 per-session 物化器。允许 nil(不加载用户 skill)。
func SetSkillsProvider(fn agentbridge.SessionSkillsProviderFn) { skillsProvider = fn }

// sessionSkills 是给 FeatureSpec.SessionSkillsProvider 的适配闭包(懒读包级 skillsProvider)。
func sessionSkills(ctx context.Context, userID uint) ([]agent.SessionSkill, error) {
	if skillsProvider == nil {
		return nil, nil
	}
	return skillsProvider(ctx, userID)
}

// vipChecker 由 SetVIPChecker 注入(bootstrap)—— 按用户等级(free/pro)做 tier-aware 日额度。
// vip.Service 自带「未配额→不限额 + Redis 挂→fail-open」,故无需再保留旧的 env 日额度回落。
var vipChecker *vip.Service

// SetVIPChecker 注入会员限额服务。允许 nil(不限额)。
func SetVIPChecker(v *vip.Service) { vipChecker = v }

// VIPCheckerWired 报告配额校验器是否已注入。bootstrap 启动末尾据此断言付费功能已接线,
// 防「新增付费 feature 忘记调 SetVIPChecker → 静默免费(收入泄漏)」的回归。
func VIPCheckerWired() bool { return vipChecker != nil }

// checkQuota / recordQuestion 是给 agentbridge.StandardHooks 的适配闭包:
//  1. checkQuota: 先查 vip 配额, 超额转 quota_exceeded(干净文案)直接 error 出去。
//  2. recordQuestion: 配额过了 → 记一条 usage_events (claw/message)。
//
// 闭包结构保证 vipChecker/usageRecorder 在**调用时**读取(而非注册时),所以
// BuildSpec 可在 SetUsageRecorder/SetVIPChecker 之前调用,顺序无关。
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

// budgetProvider(SS#2)给 hub 每轮盖「有界透支预算」用;懒读包级 vipChecker(可后于 BuildSpec 注入)。
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
		Feature: usagestat.FeatureClaw,
		Action:  "message",
	})
}

// BuildSpec 构造 claw 的 FeatureSpec。
//
// 关键选择:
//   - InjectPromptOnFirstMsg=true: agent 默认 prompt 强, 我们的助手身份要在每个
//     首条消息前覆盖一次 (与 smart_search 一致); 否则 agent 可能不知道自己在
//     Scholay 平台、不知道有 Minicod MCP 可用。
//   - AutoApprovePermission=true: Minicod MCP 全是只读检索, 自动批准让用户体验
//     流畅; 后续如果允许 agent 写代码 / 改文件再调整。
// clawAllowedMcpTools —— claw(智能助手)对 minicod MCP 的**正向白名单**(去 mcp__minicod__ 前缀原始名)。
// claw 是全能助手,除论文检索外还做「期刊推荐 / 投稿建议」,故比 smart_search 多放期刊一套(搜索/补全/
// 对比/真实投稿评价/投稿须知)。仍收敛掉 28 个 OpenAlex 实体、高校库、bulk/export/group 等重/冷工具,
// 避免 minicod 0.4.1 的 76 工具灌满每轮(见 minicod 对齐审计 #2、#9)。
var clawAllowedMcpTools = []string{
	// 论文检索与解引用
	"search_papers", "get_paper", "get_paper_by_doi", "get_paper_authors",
	"get_paper_citations", "get_paper_references", "get_papers_batch",
	"match_paper", "get_related_works", "group_works",
	// 作者
	"search_authors", "get_author", "get_author_papers",
	// 期刊(推荐 / 投稿建议:搜索 + 补全 + 对比 + 真实投稿评价 + 投稿须知)
	"search_journals", "get_journal", "suggest_journals", "compare_journals",
	"get_journal_comments", "get_journal_submission_guideline",
	// 片段接地 + 近邻推荐(topic-selection 用 group_works 看趋势、recommend_from_pool 由种子扩展)
	"search_snippets", "recommend_paper", "recommend_from_pool",
}

func BuildSpec() agentbridge.FeatureSpec {
	pre, onComplete := agentbridge.StandardHooks(agentbridge.StandardHooksConfig{
		FeatureKey:     FeatureKey,
		CheckQuota:     checkQuota,
		RecordQuestion: recordQuestion,
	})
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 智能助手:基于 Minicod MCP 的科研对话助手, 支持上传文件 / 图片",
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, prompts.ClawSystemPrompt),
		Color:                  "purple",
		InjectPromptOnFirstMsg: true,
		// 默认模型走 chat_default.claw 能力绑定(admin 模型目录页可改;迁移初值=主档)。
		// C14: 审批轴。默认 auto;CLAW_PERMISSION_PASSTHROUGH=1 时 passthrough(测试/HITL 验证)。
		PermissionMode: clawPermissionMode(),
		// C1 (2026-06): claw 是唯一允许 Bash 的 feature —— 要跑 pdftotext/python 把 PDF / docx/xlsx
		// 等任意格式转成可读文本(能力交给 agent 自己控 tool 调用,不在 backend 预处理)。AllowBash=true
		// 让 backend 权限门放行 Bash;agent 端全局 denylist 本就不含 Bash, claw 又不追加禁用, 故 agent
		// 侧天然有 Bash, 无需 SessionOptions。
		// ⚠️ 多租户隔离:Bash 是 shell,backend 权限门无法做路径限制,跨会话文件隔离**依赖 agent 容器
		// 的 bwrap 沙箱**(--unshare-all + 唯一可写=本会话 cwd → 其它会话 cwd 物理不在命名空间里)。
		// bwrap 需生产内核放开 unprivileged userns;设 EXECUTOR_SANDBOX_MODE=bwrap 启用。在 bwrap 生效
		// 之前,SANDBOX_MODE=none 下 Bash 裸跑,claw 用户可跨会话读他人文件 —— 隔离靠 bwrap 兜,不靠关 Bash。
		AllowBash:         true,
		PreUserMessage:    pre,
		OnMessageComplete: onComplete,
		// SS#2:有界透支预算 —— hub 每轮盖章,执行器让 agent 自我配速 + 到界优雅收尾。
		BudgetProvider: budgetProvider,
		// claw 会话加载 library-reference skill(--add-dir /claw-add)。DisallowedTools 留空
		// (claw 不裁工具,Bash 由 AllowBash 单独管),仅借 SessionOptions 挂 AddDirs。
		SessionOptions: &agent.CreateSessionOptions{
			AddDirs: []string{clawSkillAddDir()},
			// MCP 正向白名单:收敛 minicod 76 工具到 claw 需要的论文/作者/期刊/片段子集(见 clawAllowedMcpTools)。
			AllowedMcpTools: clawAllowedMcpTools,
			// W2 P0-C 诚实性核验:claw 是 2026-07 审计的事故重灾区(编造 DOI 55 会话 / 幻影交付 17 会话),
			// 先行开启;prism/peerreview 交付形态不同(项目文件 / 有界 JSON)会被误伤,保持默认 false,
			// 观测 claw 两周数据后再评估。急停阀:agent env EXECUTOR_HONESTY_GUARD=off(免 rebuild)。
			HonestyGuard: true,
		},
		// skill 市场:按 userID 现算该用户启用的市场 skill,内联下发给 executor 物化到 guides 按需层。
		// tier-1 安全:内容只走 guides(不进常驻 system)、Bash 仍由 AllowBash 上方管、无出网工具。
		SessionSkillsProvider: sessionSkills,
	}
}
