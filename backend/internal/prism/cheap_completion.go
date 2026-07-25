// ============================================================================
// Prism 廉价单次补全注入点 —— 与整轮 agent 会话解耦的一次性 (system, user) → 文本补全,
// 供 prism 侧非会话小任务复用(当前:修改意见拆条 revision.go)。bootstrap 注入 ai 实现
// (方法值,免 prism 核心耦合 ai 类型);nil = 功能不可用,调用方须有确定性退化。
// 模型走 modelcatalog 能力绑定(project.revision),经 agent /api/complete 单次接口。
// ============================================================================

package prism

import "context"

// CheapCompletionFn —— 一次性廉价补全:(system, user) → 文本。
type CheapCompletionFn func(ctx context.Context, system, user string) (string, error)

var cheapCompletionFn CheapCompletionFn

// SetCheapCompletionFn 注入廉价补全实现(bootstrap 在有 ai.Service 处调)。允许 nil(功能不可用)。
func SetCheapCompletionFn(f CheapCompletionFn) { cheapCompletionFn = f }
