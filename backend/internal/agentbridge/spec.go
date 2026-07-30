// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package agentbridge 把 scholar_agent (Scholay 科研助手 daemon) 的会话/WS 接入能力收成一个通用桥。
//
// 设计动机:
//
//	smartsearch 是 agent 的第一个消费者; 后续 paper-review / latex-writer 等
//	feature 都会重写一遍 "用户↔session 映射 + WS upgrade + JWT 校验 + 心跳 +
//	首条 user_message 注入 system prompt + 自动 approve permission" 这套样板代码。
//	本包把这些抽出来, 每个 feature 只声明一份 FeatureSpec, handler 就是 3-4 行
//	thin wrapper, 业务模块零样板。
//
// 使用方式:
//  1. feature 定义一份 FeatureSpec (key/agent name/system prompt/选项)
//  2. bootstrap: bridge := agentbridge.New(agentClient, repo);
//     fb := bridge.For(featureSpec)
//  3. feature handler 持有 *FeatureBridge, gin 路由直接挂 fb.HandleWS 等方法
//
// 数据流:
//
//	POST /<feature>/session         → FeatureBridge.GetOrCreateSession → repo + agent
//	POST /<feature>/session/reset   → FeatureBridge.ResetSession
//	GET  /<feature>/session/messages → FeatureBridge.GetSessionMessages
//	GET  /<feature>/session/context → FeatureBridge.GetContextEstimate
//	GET  /<feature>/ws/:sessionId   → FeatureBridge.HandleWS (JWT query + ownership)
package agentbridge

import (
	"context"
	"time"

	"scholar-backend/internal/agent"
)

// AgentUsage 是 agent message_complete 事件里 usage 字段的 Go 视图,
// 由 OnMessageComplete hook 接收, 供 quota / billing / analytics 消费。
type AgentUsage struct {
	InputTokens         int    `json:"input_tokens"`
	OutputTokens        int    `json:"output_tokens"`
	CacheReadTokens     int    `json:"cache_read_tokens,omitempty"`
	CacheCreationTokens int    `json:"cache_creation_tokens,omitempty"`
	Model               string `json:"model,omitempty"` // 由 pipe 缓存最近一帧 assistant.model 注入
}

// PreUserMessageFn 在每条 user_message 转发到 agent 前同步调用。
// 返回非 nil error → pipe 不转发, 给前端回一个 {type:error,code,message} 帧,
// WS 保持打开 (用户可以下一轮再试)。典型用途: 每日额度卡。
//
// content 是 user_message.content 的原始字符串 (注入 prefix 之前); userID 已经过 JWT 校验。
type PreUserMessageFn func(ctx context.Context, userID uint, content string) error

// BudgetProviderFn(SS#2)返回该用户此刻的单轮预算(**微元真实成本口径**,P5 成本制;
// hub 盖章前会经 catalog.CostPerToken(微元/token)换算成执行器可比的 token 预算再下发):
// soft = hard = 到窗口上限还剩(可为负;透支带已于 2026-07-30 取消,两个值保留是帧契约形状不动;
// payg 用户会叠加钱包容量)。unlimited=true(不限额/收费关)时 hub 不盖章 → 执行器无预算 →
// 行为不变。只读、不预扣;计费仍走后置 AddUsage 精确累加。
type BudgetProviderFn func(ctx context.Context, userID uint) (soft, hard int64, unlimited bool)

// SessionProfileFn(Phase 2, prism)返回该**会话**的项目级 in-band 注入块(如 prism 的写作画像)。
// 与 MemoryBlocks(user 级)不同:身份是 sessionID(项目级),故单开一条 provider——hub seed 时它有
// sessionID 而 buildCreateOptions 只有 userID。返回空串 = 不注入(该会话无项目/未定画像)。
// hub 在 seed_history 组装 opts 后、把它拼在 AppendSystemPrompt 之后(clone-before-mutate)。
type SessionProfileFn func(ctx context.Context, sessionID string) string

// SessionSkillsProviderFn(skill 市场)按 userID 返回该用户建会话时要物化的市场 skill(≤5 份内联内容)。
// 只有 userID(与 buildCreateOptions 同源);sid 由 executor 建会话时生成,物化在 executor 侧完成。
// 返回内容是不可信用户内容,只走 executor 的 guides 按需层。fail-open:err/空 = 无用户 skill。
type SessionSkillsProviderFn func(ctx context.Context, userID uint) ([]agent.SessionSkill, error)

// OnTitleResultFn 在 agent 生成会话标题(session_title_updated, aiGenerated)后异步调用。
// 供标题真源在 backend DB 的 feature(prism)落库;title 已是 agent 解析好的纯标题文本,
// 实现方仍应做一道清洗(clamp/junk)+ 幂等落库(仅默认占位时写)。
type OnTitleResultFn func(ctx context.Context, userID uint, sessionID, title string)

// OnMessageCompleteFn 在 agent 返回 message_complete 后异步调用 (safego 包起来不会阻塞 pipe)。
// 典型用途: 把 usage 写到日志或账单表, 做事后审计。失败仅打 warn, 不影响业务。
type OnMessageCompleteFn func(ctx context.Context, userID uint, usage AgentUsage)

// PermissionMode 是权限模型的「何时问人」轴 (C14, 2026-06)。
//
// 设计动机: 旧的单 bool AutoApprovePermission 语义分裂 —— 对 smart_search 表示「approve
// 一切只读 MCP」, 对 prism/claw 表示「路径感知 decidePermission 裁决」。但四个 feature
// 其实跑同一段 decidePermission, 真正的差异在能力轴 (specDeny/AllowBash), 不在这个 bool。
// 这个 bool 实际只有一个语义: permission_request 是否由 backend 自动裁决 (不转发前端)。
//
// 两轴权限模型:
//   - 能力轴 (用什么工具): SessionOptions.DisallowedTools + AllowBash → specDeny(), 已存在。
//   - 审批轴 (何时问人): 本 PermissionMode。
//
// 取值:
//   - PermissionAuto: backend 自动裁决 (现状) —— 走 decidePermission, MCP/Web/Skill 放行,
//     文件工具按会话 cwd 路径限定, denylist 命中拒。前端**不**参与, 无人审 UI。
//   - PermissionPassthrough: backend 不裁决, 把 permission_request 原样透传给前端 (= "ask")。
//     前端/测试客户端收到后回 permission_response, 经 pipe 原样转发回 agent 解锁工具。
//     ⚠️ passthrough 绕过 specDeny 二道防线 —— 仅给「能力轴本就放开/有 agent 端 --disallowed-tools
//     兜底」的 feature 用; 靠 cwd 围栏的 feature (smart_search/prism) **绝不**默认开 passthrough。
type PermissionMode string

const (
	// PermissionAuto: backend 自动裁决 permission_request, 不转发前端 (现状默认)。
	PermissionAuto PermissionMode = "auto"
	// PermissionPassthrough: 把 permission_request 透传给前端人审 (HITL / 测试)。
	PermissionPassthrough PermissionMode = "passthrough"
)

// FeatureSpec 描述一个 agent 消费者 feature 的全部定制信息。
//
// 这些字段在 bootstrap 阶段静态填好, 之后只读, 跨多个请求复用同一份。
//
// 重要演进 (v2 → v3):
//   - v2: SystemPrompt 是 Go const 字段, 编译期固化, 改 prompt 必须发版重启
//   - v3: 删除 SystemPrompt 字段, 改用 Picker (DB-backed promptregistry)。
//     运营在 admin 后台改 prompt 不必重启, 历史版本可审计可回滚。
//     单 prompt feature (smart_search/claw) 用 BySlugPicker;
//     多视角 feature (peerreview) 用 PersonaRandomPicker (一个 persona 一个 picker)。
type FeatureSpec struct {
	// Key 是 agent_sessions.feature_key 的取值, 全局唯一, 用于
	// (user_id, feature_key) 复合主键。简短的 snake_case, <= 64 字符。
	// 例: smart_search / peerreview / claw。
	// 同时也是 feature_prompts.feature_key 的取值, picker 据此过滤候选池。
	Key string

	// AgentName 是 agent 容器内 ~/.claude/agents/<name>.yaml 对应的 subagent 标识。
	// bootstrap 时通过 Bridge.UpsertSkill 把 (默认 prompt 的 default-persona slug)
	// 内容推到该名字, 让 agent 端持久化一份 subagent 定义。
	//
	// 即便目前主流路是 WS 前缀注入, 推送一份 agent yaml 仍有两个用途:
	//   1) 后续切到"创建 session 时指定 agentType"模式时无需改 bootstrap
	//   2) 在 agent 容器后台能直接看到当前 prompt 内容, 方便 debug
	AgentName string

	// Description 给 agent 端展示用 (POST /api/agents 的 description 字段)。
	Description string

	// Picker — 决定怎么从 promptregistry 选 prompt。
	//
	// nil → 仅当 InjectPromptOnFirstMsg=false 且业务自己管 prompt (不走 agentbridge
	// 注入) 时才允许; 比如 peerreview 走 ServerSideChatStreaming + 业务层逐轮自选,
	// 这时 FeatureSpec.Picker 可以为 nil。
	//
	// 其他情况 nil 会让 WS handler 在首条消息时 ErrPickerNotConfigured fail-fast。
	Picker PromptPicker

	// Color 仅给 agent 端 UI 配色用, 不影响行为; 留空即可。
	Color string

	// InjectPromptOnFirstMsg 控制是否在 WS 桥的首条 user_message 前注入 Picker.Pick()
	// 的结果作为 prefix。目前 smart_search / claw 必须开 (因为创建的是主 agent 不是
	// subagent, 默认带 Bash/Read 全工具集, 不强约束会陷入死循环); 等 agent 端支持
	// 创建 session 时指定 agentType 后, 这个开关就可以下掉。
	//
	// 注意: true 时 Picker 必填; false 时 Picker 可以是 nil (业务自管)。
	InjectPromptOnFirstMsg bool

	// Deprecated: 用 PermissionMode 取代 (C14)。这个单 bool 语义分裂, 见 PermissionMode 文档。
	// 仍读它做向后兼容: EffectivePermissionMode() 在 PermissionMode 空时把 AutoApprovePermission=true
	// 映射成 PermissionAuto。迁移完所有 feature 后可删本字段。
	// ⚠️ 不要同时设 PermissionMode 和 AutoApprovePermission —— 以 PermissionMode 为准。
	AutoApprovePermission bool

	// PermissionMode 是「何时问人」审批轴 (C14)。空 → EffectivePermissionMode() 回落到
	// AutoApprovePermission 兼容逻辑。四个现有 feature 显式置 PermissionAuto。详见 PermissionMode 文档。
	PermissionMode PermissionMode

	// PingInterval 应用层 keepalive 周期, 必须小于 agent 端 Bun.serve idleTimeout (60s)。
	// 0 时取默认值 (25s)。
	PingInterval time.Duration

	// TurnTimeout 轮级硬超时 (W3-2):hub beginTurn 时 arm,一轮超过该时长仍无终帧 → 向 agent 发
	// stop_generation + FailTurn + 广播 turn_timeout error 帧,防挂死轮占死执行器并发槽(全容器仅
	// 2 槽)+ 前端无限转圈。零值 = 默认 15 分钟(现有 feature 不改 spec 即生效);负值 = 显式禁用。
	// 经 TurnTimeoutOrDefault() 读取。peerreview 走 server-side 路(不经 hub),天然不受影响。
	TurnTimeout time.Duration

	// PreUserMessage 在每条 user_message 转发到 agent 前同步调用, 用于做配额 / 限流。
	// nil → 不做检查直接放行。详见 PreUserMessageFn 定义。
	PreUserMessage PreUserMessageFn

	// BudgetProvider(SS#2)非 nil 时,hub 每条 user_message 现算「单轮预算」并盖到帧上,
	// 执行器据此让 agent 自我配速 + 到界优雅收尾。nil = 不盖(peerreview 任务型,必须跑完)。
	BudgetProvider BudgetProviderFn

	// OnMessageComplete 在每轮 agent 回答完 (拿到 message_complete) 后异步调用。
	// nil → 不记账 (usage 仅在 agent 端 transcript 留底)。
	OnMessageComplete OnMessageCompleteFn

	// OnTitleResult 在 agent 回 session_title_updated 帧(且 aiGenerated=true)时异步调用,
	// 供「标题真源在 backend DB」的 feature 落库。claw/smart_search 的标题存 agent jsonl 自管 →
	// 留 nil;仅 prism(真源 prism_projects.title)设它 → 解析+清洗后 UpdateProjectTitleIfDefault。
	// sessionID 是 agent 会话 id;实现方据此反查归属对象(prism: project)。详见 OnTitleResultFn。
	OnTitleResult OnTitleResultFn

	// SessionProfile(Phase 2, prism)非 nil 时,hub seed_history 会用 sessionID 现算「项目级 in-band 注入块」
	// (prism 写作画像:base 文体/学科人格),拼在 AppendSystemPrompt 之后。nil = 不注入。详见 SessionProfileFn。
	SessionProfile SessionProfileFn

	// SessionSkillsProvider(skill 市场)非 nil 时,buildCreateOptions 在建会话 / seed 时按 userID 现算
	// 「该用户启用的市场 skill」,作为**内联内容**塞进 CreateSessionOptions.Skills → executor 物化到
	// <workDir>.skills/guides/(guides 按需层,不进常驻 system)。仅 claw 设它。内容是**不可信用户内容**,
	// 只走 guides 按需菜单;返回值已被 service 收窄为「自建 或 public+approved」的 skill,且 ≤5 份。
	// 失败 fail-open(返回空 / err)= 无用户 skill,不阻断建会话(skill 是增强非必需)。
	SessionSkillsProvider SessionSkillsProviderFn

	// (旧 DefaultTier 字段已删除 —— P2 模型目录化后,feature 默认模型由 chat_default.<key>
	//  能力绑定驱动(admin 可配,Bridge.SetModelCatalog 注入),hub sendInitialModel 下发具体
	//  modelId。铁律不变:绝不会话中途**自动**换模型,用户显式换经 handleRuntimeConfigFrame 校验。)

	// AllowBash 是「该 feature 是否允许 agent 跑 Bash/BashOutput/KillShell」的**单一真源**。
	// 默认零值 false = 禁 Bash(默认安全:新 feature 不显式置 true 就没有 shell)。
	// 目前仅 claw 置 true —— 它要 Bash 跑 pandoc/python 把 docx/xlsx 转成可读文本。
	// smart_search(只读检索)/ prism(只产 patch)/ peerreview(只读取 JSON)都不需要,保持 false。
	//
	// 这个 bool 同时驱动两层防线,二者读同一真源,杜绝硬编码 "claw" 散落:
	//   1. agent 容器层:BuildSpec 用 SessionDisallowedTools 据它决定 --disallowed-tools 是否含
	//      Bash 三件套(含 → agent 工具池硬移除 Bash)。
	//   2. backend 权限门:specDeny() 据它在二道防线 denylist 里补 Bash 三件套
	//      (permissionAllowed 顶部命中 denylist 直接拒,见 ws.go)。
	AllowBash bool

	// specDeny 见下:取 SessionOptions.DisallowedTools(并按 AllowBash 补 Bash)给后端 permission 二道防线用。
	//
	// SessionOptions 创建该 feature 的 agent session 时透传给 agent.CreateSession,
	// 用于 per-feature 收紧工具集 / 指定 work dir / add-dir。nil → 用 agent 默认(全工具)。
	// 例: Prism 写作设 DisallowedTools=[Bash,Write,Edit,MultiEdit] —— agent 只能产
	// [PRISM_PATCH] 文本, 永不直接落盘真源(文件真源在后端 DB)。
	SessionOptions *agent.CreateSessionOptions
}

// bashTools 是「跑 shell」相关的三件套。AllowBash=false 时,backend 在 agent --disallowed-tools
// 与 permission 二道防线里都把它们禁掉;true(仅 claw)时保留。集中一处避免散落硬编码。
var bashTools = []string{"Bash", "BashOutput", "KillShell"}

// specDeny 取该 feature 会话**实际禁用**的工具(给后端 permission 二道防线 permissionAllowed 用):
// SessionOptions.DisallowedTools ∪ (AllowBash ? ∅ : bashTools)。
// 这样 ws.go 不再硬编码 "Bash 一律放行";AllowBash=false 的 feature 的 Bash 调用会在
// permissionAllowed 顶部命中 denylist 被直接拒(即便 agent 端 --disallowed-tools 被绕过也兜得住)。
func specDeny(spec FeatureSpec) []string {
	var deny []string
	if spec.SessionOptions != nil {
		deny = append(deny, spec.SessionOptions.DisallowedTools...)
	}
	if !spec.AllowBash {
		deny = append(deny, bashTools...)
	}
	if len(deny) == 0 {
		return nil
	}
	return deny
}

// SessionDisallowedTools 是创建 agent session 时该 feature 应传给 --disallowed-tools 的工具集
// (= specDeny 的同一真源)。BuildSpec 用它拼 SessionOptions.DisallowedTools,保证「agent 端禁的」
// 与「backend 门禁的」完全一致,不漂移。导出供各 feature 的 BuildSpec 调用。
func SessionDisallowedTools(baseDisallowed []string, allowBash bool) []string {
	var deny []string
	deny = append(deny, baseDisallowed...)
	if !allowBash {
		deny = append(deny, bashTools...)
	}
	if len(deny) == 0 {
		return nil
	}
	return deny
}

// PingIntervalOrDefault 处理 0 → 25s 的默认值兜底。
func (s FeatureSpec) PingIntervalOrDefault() time.Duration {
	if s.PingInterval > 0 {
		return s.PingInterval
	}
	return 25 * time.Second
}

// TurnTimeoutOrDefault 解析轮级硬超时 (W3-2):零值 → 默认 15 分钟;负值 → 0(禁用,hub 不 arm)。
// 15min 对交互三件套足够宽(审计挂死轮 848s≈14min 是事故不是正常);须小于 eventlog_store
// ReconcileStaleRunning 的 30min 兜底阈值,保证正常轮绝不会被 reaper 误收。
func (s FeatureSpec) TurnTimeoutOrDefault() time.Duration {
	if s.TurnTimeout < 0 {
		return 0
	}
	if s.TurnTimeout > 0 {
		return s.TurnTimeout
	}
	return 15 * time.Minute
}

// EffectivePermissionMode 解析该 feature 实际生效的审批模式 (C14)。
//
// 解析优先级:
//  1. 显式设了 PermissionMode → 直接用 (auto / passthrough)。
//  2. PermissionMode 空 → 向后兼容旧 AutoApprovePermission:
//     true  → PermissionAuto (现状: backend 自动裁决)
//     false → PermissionPassthrough (旧代码 AutoApprovePermission=false 时根本不拦截
//             permission_request, 等价于让它流向前端; 这里显式表达成 passthrough, 行为等价)。
//
// 注: 历史上四个 feature 全是 AutoApprovePermission=true, 现已显式迁到 PermissionAuto。
func (s FeatureSpec) EffectivePermissionMode() PermissionMode {
	if s.PermissionMode != "" {
		return s.PermissionMode
	}
	if s.AutoApprovePermission {
		return PermissionAuto
	}
	return PermissionPassthrough
}
