// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package smartsearch 是 scholay 智能搜索 feature 的 thin wrapper:
// 把 agentbridge.FeatureSpec 声明出来 + 把 gin 路由绑到 agentbridge.FeatureBridge 上。
// 业务逻辑 (session 生命周期 / WS 桥接 / 心跳 / system prompt 注入) 都在 agentbridge,
// 本包只做 "这个 feature 长这样" 的声明 + 极薄的 HTTP 翻译层。
//
// prompt 演进:
//   原本 systemPrompt 是 Go const 写死在本文件; v3 一度迁到 feature_prompts 表 (走
//   BySlugPicker) 以支持 admin 热改。后又决定这类"单条简单提示词"不必用 DB 表, 回到代码
//   静态管理 (internal/prompts), 复杂逻辑交给 skills。现 systemPrompt = prompts.
//   SmartSearchSystemPrompt const, 通过 agentbridge.StaticPicker 注入, 不再走 promptregistry。
//   代价: 改 prompt = 改代码 + 重新部署。
package smartsearch

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

// FeatureKey 是 agent_sessions.feature_key 的取值, 也用作路由前缀的语义标签,
// 同时是 feature_prompts.feature_key 的取值。
// 改动会让 (1) 历史 mapping 失效 (用户拿不回上轮对话), (2) feature_prompts 表里
// 的种子 row 找不到对应 prompt, 慎改。
const FeatureKey = "smart_search"

// agentName 是 agent 容器内 ~/.claude/agents/scholay-smart-search.yaml 对应的
// subagent。bootstrap 时会 UpsertSkill 推一份当前 prompt 过去, 即便目前主流路
// 还是创建主 agent + WS 注入 prefix。
const agentName = "scholay-smart-search"

// PromptSlug / PromptName — 仅作 PromptChoice 的元信息标签 (审计 / 日志展示);
// 已不再对应任何 DB 行 (prompt 内容是 prompts.SmartSearchSystemPrompt const)。
const PromptSlug = "scholay-smart-search-v1"
const PromptName = "Scholay 文献智能搜索 · 默认 prompt"

// usageRecorder 由 SetUsageRecorder 注入; preUserMessageChain 每次提问时懒读取。
var usageRecorder usagestat.Recorder

// SetUsageRecorder 注入使用统计录入器 —— 用户每次"提问"(发 user_message)且通过
// 配额时记一条 smart_search / question。允许 nil 禁用。
func SetUsageRecorder(r usagestat.Recorder) {
	usageRecorder = r
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
// 闭包结构保证 vipChecker/usageRecorder 在**调用时**懒读包级 var(而非 BuildSpec 注册时),
// 故 SetVIPChecker/SetUsageRecorder 可后于 BuildSpec 调用,顺序无关。
func checkQuota(ctx context.Context, userID uint) error {
	if vipChecker == nil {
		return nil
	}
	// tier-aware 会员限额。vip.ErrQuotaExceeded → 转成 agentbridge 的 quota_exceeded(干净文案),
	// 让 WS pipe 回前端 code=quota_exceeded + retryable=false。
	// 起点闸:窗口额度一到上限即拦(透支带已于 2026-07-30 取消);已在跑的那一轮仍自然跑完。
	if err := vipChecker.CheckDailyQuotaOverdraft(ctx, userID); err != nil {
		if errors.Is(err, vip.ErrQuotaExceeded) {
			return agentbridge.NewQuotaErrorFrom(err) // 保链:error 帧带结构化 quota 字段
		}
		return err
	}
	return nil
}

// budgetProvider(SS#2)给 hub 每轮盖「单轮预算」用;懒读包级 vipChecker(可后于 BuildSpec 注入)。
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
		Feature: usagestat.FeatureSmartSearch,
		Action:  "question",
	})
}

// smartSearchSkillAddDir —— 传给 agent --add-dir 的目录(agent 加载 <dir>/.claude/skills:检索策略 skill)。
// 同 prism 的 prismSkillAddDir / claw 的 clawSkillAddDir:独立目录,只有 smart_search 会话装,
// 其它 feature 看不到。compose 把 ./agent-skills/smart-search-skills 挂到 <dir>/.claude/skills。
func smartSearchSkillAddDir() string {
	if d := strings.TrimSpace(os.Getenv("SMART_SEARCH_SKILL_ADDDIR")); d != "" {
		return d
	}
	return "/smart-search-add"
}

// smartSearchDisallowedTools —— smart_search 是纯只读检索,只该用 mcp__minicod__*(+ TodayDate 做
// 年份换算)。显式禁掉执行器 registry 里的文件工具(Read/Write/Edit/Glob/Grep)与潜在的联网/笔记本/
// 子任务工具,把「MCP-only」从**提示词软约束**升级成 backend + 执行器**双向硬约束**(评审 #5:
// 此前 DisallowedTools=nil 只并入 Bash 三件套,Read/Write/Edit/Glob/Grep 实际放行且被 PermissionAuto
// 自动批准,提示词里的「绝对禁令」形同虚设)。Bash 三件套由 SessionDisallowedTools(allowBash=false)
// 另行并入。MultiEdit/NotebookEdit/LS/WebFetch/WebSearch/Task/Agent 当前不在 registry,列出是防御性
// 兜底:一旦将来 registry 新增,smart_search 仍默认锁死,不必回来补。
// 2026-07 输入框统一:接入文件上传与文献集引用(附件落会话隔离 cwd、引用物化 references/)
// → **最小放开 Read**(否则模型对 @"path" 附件与 references/INDEX.md 全读不了,上传/引用是
// 空头支票)。安全面不变:Read 在 backend permissionAllowed 按会话 cwd 做路径校验(越界一律拒),
// 写类/检索类文件工具与联网/子任务仍全禁,MCP-only 检索纪律靠提示词 + 其余 denylist 维持。
var smartSearchDisallowedTools = []string{
	// 🔴 2026-08-08:StatRun / StatReport(2026-08 新增的 builtin)必须显式列出。
	// builtin 工具走 **deny-list** 模式 ⇒ 任何新增 builtin 对**所有老 feature 默认开放**:
	// 它们发版当天就被本 feature 继承了,而 backend permissionAllowed(ws.go:387/400)对二者
	// 无条件 return true。线上调用次数目前是 0(stat_lab 未放量),所以这是已成立的**暴露面**
	// 与每轮 6.7KB 的 tools[] 浪费,不是已发生的事故。统计能力属于 stat_lab,别处不要继承。
	"StatRun", "StatReport",
	// ExportDocument 写交付物到 ./out/ 不属只读检索职责,禁用(ReadDocument 保留:读用户上传的稿件)。
	"Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS", "ExportDocument",
	"WebFetch", "WebSearch", "Task", "Agent", "Skill",
	// 注:AskUserQuestion(交互提问)P1 起对 smart_search 放开(用户可在检索方向不明时被问清一个关键点),
	// 故**不**列入禁用 —— 见 prompts.SmartSearchSystemPrompt 的「检索方向不明时」一节。
}

// smartSearchAllowedMcpTools —— smart_search 对 minicod MCP 的**正向白名单**(去 mcp__minicod__ 前缀的原始名)。
// minicod 0.4.1 暴露 76 个工具(含 28 个 OpenAlex 实体、5 个高校、期刊投稿/评论/时间线等),不收敛会灌满
// 每轮 tools[](≈15-25K tokens)且全自动批准(见 minicod 对齐审计 #2)。smart_search 只做「找论文」,只需
// 论文/作者/片段/近邻检索这一子集;期刊仅留 get_journal(查详情)。executor featurePolicy 据此在
// 可见性 + 执行二道墙两处过滤。新增/改工具时在此增删即可,无需动 executor。
var smartSearchAllowedMcpTools = []string{
	// 论文检索与解引用
	"search_papers", "get_paper", "get_paper_by_doi", "get_paper_authors",
	"get_paper_citations", "get_paper_references", "get_papers_batch",
	"search_papers_bulk", "match_paper", "get_related_works", "group_works",
	// 作者枢纽反查
	"search_authors", "get_author", "get_author_papers",
	// 片段接地 + 近邻推荐
	"search_snippets", "recommend_paper", "recommend_from_pool",
	// 期刊详情(用户偶尔问某篇论文发在哪个期刊 / 期刊分区)
	"get_journal",
}

// smartSearchRetrievalDiscipline —— 2026-07 线上审计:11% 完成轮零检索工具调用(用户明确要求
// 「用查询论文的工具来找」仍不查),且出现伪造「我刚检索过/检索来源」表述。硬约束前置到系统提示
// 最前(prompts.SmartSearchSystemPrompt 本体不动)。
//
// 🔴 2026-08 证据账本 P1(终稿 §四①-1):删掉原本的第二句 ——
//    「未调用任何检索工具时,回答必须以『以下内容基于模型知识,未经本平台检索验证』开头」。
//    那是**我们自己写进提示词的逃生门**:前半句要求必须检索,后半句当场把"不检索"标价成一条
//    合法路径(标注即可),规则自己把病灶合法化了。删它的替代路径不是另一段文字,而是引擎侧的
//    证据账本 + 交付边界 resolve 闸(编造的引用在交付物层面展不开)。
//    只做减法:剩下的两句都是**无条件**的,没有任何"否则就标注一下"的分支。
//
// 🔴 第三句是 2026-08-01 补的**形态契约**(与 prompts/claw.go 铁律 1 同款,口径必须对称):
//    删掉逃生门后 smart_search 一度只剩无条件祈使句,而 claw 侧已经换成了可验证的形态约束 ——
//    两个 feature 对同一件事给不同口径,模型会挑更宽松的那个(线上「~12 次预算」与 skill 的
//    12-18 次滚雪球对撞时,它就挑了定量的那条)。形态契约的好处是**可验证**:
//    「有没有出现书目形态」是看得见的事实,不是「有没有诚实标注」这种自由裁量的承诺。
const smartSearchRetrievalDiscipline = "【检索纪律 — 每轮硬约束】\n" +
	"每一轮回答前必须先调用检索工具获取本轮证据;" +
	"不得使用「我刚检索」「检索来源」等任何暗示已检索的表述,除非本轮真的调用过检索工具并拿到了结果。\n" +
	"本会话证据账本为空时,回答里不得出现任何书目形态 —— 具体指:带标题+作者+年份+期刊的文献条目、" +
	"DOI、参考文献列表、以及「共找到 N 篇」这类计数。没有证据就直说没有,不要把记忆里的东西排版成检索结果。\n\n"

// BuildSpec 构造 smart_search 的 FeatureSpec。
func BuildSpec() agentbridge.FeatureSpec {
	pre, onComplete := agentbridge.StandardHooks(agentbridge.StandardHooksConfig{
		FeatureKey:     FeatureKey,
		CheckQuota:     checkQuota,
		RecordQuestion: recordQuestion,
	})
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 智能搜索:基于 Minicod MCP 的学术文献检索助手",
		// 2026-07 线上审计:检索纪律硬约束前缀(零检索轮 + 伪造检索表述),见 smartSearchRetrievalDiscipline。
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, smartSearchRetrievalDiscipline+prompts.SmartSearchSystemPrompt),
		Color:                  "green",
		InjectPromptOnFirstMsg: true, // 主 agent 默认带 Bash/Read, 必须强约束
		// 默认模型走 chat_default.smart_search 能力绑定(admin 模型目录页可改;迁移初值=便宜档)。
		// C14: 审批轴 = auto (backend 自动裁决, 不透传前端)。仅暴露 mcp__minicod__*(+ TodayDate)只读检索,
		// 文件/联网工具已在 SessionOptions.DisallowedTools 显式禁掉(见 smartSearchDisallowedTools),无破坏性操作。
		PermissionMode: agentbridge.PermissionAuto,
		// PingInterval: 0 → 走 agentbridge 默认 25s (< agent idleTimeout 60s)
		// C1 (2026-06): smart_search 是只读检索, 不需要 Bash。AllowBash 保持零值 false。
		// DisallowedTools = 文件/联网工具(smartSearchDisallowedTools)+ Bash 三件套(SessionDisallowedTools
		// 据 allowBash=false 并入)—— 执行器端工具池硬移除;backend 门由 specDeny 同源二道防线补禁。
		SessionOptions: &agent.CreateSessionOptions{
			DisallowedTools: agentbridge.SessionDisallowedTools(smartSearchDisallowedTools, false),
				// MCP 正向白名单:把 minicod 76 工具收敛到 smart_search 真正需要的论文/作者/片段子集(见上)。
				AllowedMcpTools: smartSearchAllowedMcpTools,
			// 每个 smart_search 会话加载检索策略 skill(--add-dir /smart-search-add):查询拆解 / 引文滚雪球 /
			// 作者枢纽 / 覆盖度自检。系统提示管纪律边界,skill 补检索手艺。独立目录,只有本 feature 会话装。
			AddDirs: []string{smartSearchSkillAddDir()},
		},
		// 配额检查 + 提问统计 + slog 用量 收口到 agentbridge.StandardHooks(三 feature 共用)。
		PreUserMessage:    pre,
		OnMessageComplete: onComplete,
		// SS#2:单轮预算 —— hub 每轮盖章,执行器让 agent 自我配速 + 到界优雅收尾。
		BudgetProvider: budgetProvider,
		TurnCostCap:    turnCostCapProvider,
	}
}
