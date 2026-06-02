// ============================================================================
// aierr —— 把内部 AI/LLM/上游错误翻译成「给最终用户看」的友好中文文案。
//
// 背景: internal/ai 的 executeWithRetry 把失败包成
//   "all N AI retry attempts failed, last error: no more ai_model accounts available for level low (all tried)"
// 这种内部串, 直接 sse.WriteError / item.Error 漏给用户 —— 暴露账号池/熔断/模型配置等内部细节,
// 既不友好也不安全。这里统一收口: 分类(优先 errors.Is 上游 sentinel, 其次匹配内部稳定串)→ 友好文案。
//
// 只依赖 common/upstream(也是 common/, 叶子)+ 标准库, 不碰任何 domain 包 —— 这样
// internal/ai / internal/peerreview / 任何 handler 都能 import 它, 无环。
// ============================================================================

package aierr

import (
	"context"
	"errors"
	"strings"

	"scholar-backend/internal/common/upstream"
)

// 友好文案常量 —— 都不暴露内部细节(账号/熔断/模型配置), 统一引导"稍后重试"。
const (
	msgUnavailable   = "AI 服务暂时不可用,请稍后重试"
	msgBusy          = "AI 服务繁忙,请稍后再试"
	msgTimeout       = "AI 处理超时,请稍后重试"
	msgNotConfigured = "AI 服务尚未配置,请联系管理员"
)

// FriendlyMessage 把任意内部错误映射成给用户看的友好中文。
// err==nil 返回空串。无法识别时回退到「暂时不可用」(绝不回显原始 err.Error())。
func FriendlyMessage(err error) string {
	if err == nil {
		return ""
	}

	switch {
	// 超时 / 上层 ctx 截止 —— 让用户知道是"太久了", 重试通常有效。
	case errors.Is(err, upstream.ErrTimeout), errors.Is(err, context.DeadlineExceeded):
		return msgTimeout
	// 限流 / 配额 —— "繁忙", 稍后再来。
	case errors.Is(err, upstream.ErrRateLimit):
		return msgBusy
	// 熔断 / 鉴权 / 服务端 5xx / 网络 —— 统一"暂时不可用"。
	case errors.Is(err, upstream.ErrCircuit),
		errors.Is(err, upstream.ErrAuth),
		errors.Is(err, upstream.ErrServer),
		errors.Is(err, upstream.ErrNetwork):
		return msgUnavailable
	}

	// 内部稳定串兜底(这些错误没走 typed sentinel, 但字符串由我们自己产出、稳定可匹配)。
	lower := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lower, "no model configured"):
		// admin 没给该 level 配模型 —— 不是用户能解决的, 提示联系管理员。
		return msgNotConfigured
	case strings.Contains(lower, "no more") && strings.Contains(lower, "accounts available"):
		// thirdparty 账号池耗尽。
		return msgUnavailable
	case strings.Contains(lower, "circuit breaker open"):
		return msgUnavailable
	case strings.Contains(lower, "rate limit"), strings.Contains(lower, "quota"):
		return msgBusy
	case strings.Contains(lower, "timeout"), strings.Contains(lower, "deadline exceeded"):
		return msgTimeout
	}

	// 全部没命中 → 通用兜底, 不回显原始错误。
	return msgUnavailable
}
