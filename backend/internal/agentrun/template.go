package agentrun

import "errors"

// RunTemplate —— 一个剖面(feature)支持的一种 Run 形态。
//
// 🔴 **纯数据,过不了函数**。StepDef 里没有任何 func 字段,也不许加。
//
//	这是「claw 是内核、其余是聚焦剖面」这条框架在类型上的落点:
//	剖面只能**声明**要哪几步、每步多少轮、退出判据是什么;
//	「怎么执行一步」永远只有 engine 一份实现。
//	一旦允许模板带回调,剖面就能各写各的执行逻辑,
//	半年后内核变强时剖面**不会自动变强** —— 那正是今天六个 FeatureSpec 各自平行的病。
//
// 另一个后果同样重要:纯数据的模板可以被 JSON 序列化后进 journal / admin 后台 / 测试 fixture,
// 而带闭包的结构做不到。「这个 Run 当时按什么计划跑的」于是可复盘。
type RunTemplate struct {
	// Key 全局唯一(跨 feature),进 agent_runs.template_key。
	Key string `json:"key"`
	// Title 给用户看的一句话形态名(如「深度研究」)。
	Title string `json:"title"`
	// Steps 按序执行。**顺序即依赖**:Phase 1 不支持 DAG —— 串行是刻意的,见 model.go 边界 2。
	Steps []StepDef `json:"steps"`
}

// StepDef —— 一步的声明。
type StepDef struct {
	// Key 在 Run 内唯一,进 agent_saga_steps.step_key(与 saga_id 组成唯一键)。
	Key string `json:"key"`
	// Brief 注入给模型的「这一步要做什么」。会连同用户原始诉求一起进 prompt。
	Brief string `json:"brief"`
	// MaxRounds 下发给执行器的本步工具轮上限(turnLoop 的 `input.maxRounds ?? MAX_TOOL_ROUNDS`)。
	// 0 = 不下发 → 执行器用它自己的默认(24),行为与今天逐字等价。
	//
	// 🔴 为什么要比 24 小:Step 的价值就在于**轮尽不是失败,是分页**。
	//    给一步 24 轮等于退回单体行为;6~8 轮逼它频繁落产物、频繁交接,
	//    这样崩溃/重启只丢一小段,而不是丢 20 分钟。
	MaxRounds int `json:"max_rounds,omitempty"`
	// MaxRetry 本步最多认领几次(attempt >= MaxRetry → failed 进 DLQ)。0 = 用引擎默认。
	MaxRetry int `json:"max_retry,omitempty"`
	// ExitCriteria 完成判据(Phase 3 由 coverage.go 实装引擎算术)。
	// Phase 1 留空 = 「执行器正常收口即算完成」。
	ExitCriteria *ExitCriteria `json:"exit_criteria,omitempty"`
}

// ExitCriteria —— 「这一步做没做成」的**机器可判**条件。
// Phase 1 只定义契约、只实装最保守的一条(见 coverage.go);Phase 3 补齐 §4.2 全部判据。
//
// 存在的意义:今天「做没做成」是模型自报的 —— 而模型自报正是这整套改造要治的东西。
type ExitCriteria struct {
	// MinEvidence 本 Run 账本至少要有多少条题录。0 = 不检查。
	MinEvidence int `json:"min_evidence,omitempty"`
	// MinPassages 至少多少条**可引原文段落**(chunk 级接地)。0 = 不检查。
	MinPassages int `json:"min_passages,omitempty"`
	// RequireArtifact 本步必须产出 run/steps/<key>.md 且非空。
	RequireArtifact bool `json:"require_artifact,omitempty"`
}

var (
	ErrTemplateNoKey   = errors.New("agentrun: template key is empty")
	ErrTemplateNoSteps = errors.New("agentrun: template has no steps")
	ErrStepNoKey       = errors.New("agentrun: step key is empty")
	ErrStepDupKey      = errors.New("agentrun: duplicate step key")
)

// Validate 在**注册期**(bootstrap 装配 FeatureSpec 时)调用,不是运行期。
// 🔴 起服断言优于运行期兜底:一个 step_key 重复的模板会在 agent_saga_steps 的
// uk_saga_step(saga_id, step_key) 上撞唯一键,而那时错误发生在用户的一次真实请求里、
// 表现为「Run 卡住」而不是「模板写错了」。宁可起不来。
func (t RunTemplate) Validate() error {
	if t.Key == "" {
		return ErrTemplateNoKey
	}
	if len(t.Steps) == 0 {
		return ErrTemplateNoSteps
	}
	seen := make(map[string]struct{}, len(t.Steps))
	for _, s := range t.Steps {
		if s.Key == "" {
			return ErrStepNoKey
		}
		if _, dup := seen[s.Key]; dup {
			return ErrStepDupKey
		}
		seen[s.Key] = struct{}{}
	}
	return nil
}

// FindTemplate 从一组模板里按 key 取。找不到返回 false —— 调用方必须处理,
// 不给「找不到就用第一个」这种兜底:那会让一个拼错的 template_key 静默跑成别的形态。
func FindTemplate(list []RunTemplate, key string) (RunTemplate, bool) {
	for _, t := range list {
		if t.Key == key {
			return t, true
		}
	}
	return RunTemplate{}, false
}
