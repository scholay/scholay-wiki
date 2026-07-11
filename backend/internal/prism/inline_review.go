// ============================================================================
// Prism 快通道 · 评议类(V3-4.5-1)—— 与整轮 agent 会话解耦的廉价单次 LLM 补全。
//   「解释这段 / 找论证漏洞 / 审稿人视角」:结果只回 popover **不碰正文**(零 accept 流程、零风险),
//   不进 agent 会话(不违反「不中途换模型」铁律)。防滥用:每日额度闸 + 选区长度 cap。
//   走 ai.Service(ModelLow),经函数 sink 注入以免 prism 核心重新耦合 ai 类型。
// ============================================================================

package prism

import (
	"context"
	"errors"
	"strings"

	"scholar-backend/internal/llmusage"
)

// InlineReviewFn —— 一次性廉价补全:(system, user) → 文本。bootstrap 用 ai.ChatCompletionWithLevel(ModelLow) 实现。
type InlineReviewFn func(ctx context.Context, system, user string) (string, error)

var inlineReviewFn InlineReviewFn

// SetInlineReviewFn 注入快通道补全实现(bootstrap 在有 ai.Service 处调)。允许 nil(功能不可用)。
func SetInlineReviewFn(f InlineReviewFn) { inlineReviewFn = f }

// maxInlineReviewChars —— 选区长度 cap:超长选区会把「便宜快通道」变成刷额度面,截断。
const maxInlineReviewChars = 4000

// ErrEmptySelection —— 未选中文字。
var ErrEmptySelection = errors.New("请先选中一段文字再点评")

// inlineReviewModes —— 评议动作(纯只读点评,绝不产出对正文的编辑)。
var inlineReviewModes = map[string]struct{ system, task string }{
	"explain": {
		system: "你是一位耐心的学术写作导师。用户会给你论文里的一段文字,请用更通俗清楚的话讲清这段在说什么、想表达的核心论点是什么。只解释,不改写、不评判优劣。简洁,3-5 句。",
		task:   "请解释下面这段文字的意思与核心论点:",
	},
	"critique": {
		system: "你是一位犀利但建设性的同行。用户会给你论文里的一段文字,请指出其论证上的薄弱处:未被证据支撑的跳步(缺 warrant)、过强或过弱的措辞、可被审稿人攻击的漏洞、逻辑不连贯处。只诊断问题并说明为什么,不代写修改稿。分条列出,每条一句,最多 5 条。",
		task:   "请找出下面这段文字在论证上的漏洞与薄弱处:",
	},
	"reviewer": {
		system: "你是一位严格的期刊审稿人。用户会给你论文里的一段文字,请以审稿人视角快速点评:它是否清楚、严谨、有说服力?一个挑剔的审稿人会怎么质疑它?给 2-4 条具体意见,对事不对人、可执行。只点评,不代写。",
		task:   "请以审稿人视角点评下面这段文字:",
	},
}

// InlineReview 快通道评议:校验 mode/选区 → 额度闸 → ModelLow 单次补全。返回点评文本(前端进 popover)。
func (s *Service) InlineReview(ctx context.Context, userID uint, mode, selection string) (string, error) {
	if inlineReviewFn == nil {
		return "", errors.New("点评功能暂不可用")
	}
	m, ok := inlineReviewModes[mode]
	if !ok {
		return "", errors.New("不支持的点评类型")
	}
	sel := strings.TrimSpace(selection)
	if sel == "" {
		return "", ErrEmptySelection
	}
	if r := []rune(sel); len(r) > maxInlineReviewChars {
		sel = string(r[:maxInlineReviewChars]) + "…"
	}
	// 每日额度闸(快通道也计入用户额度,防白嫖刷 LLM)。
	if vipChecker != nil {
		if err := vipChecker.CheckDailyQuota(ctx, userID); err != nil {
			return "", err
		}
	}
	// 记账归属:走 ai.Service.executeWithRetry 的 CallFromCtx,标 prism + 真实用户 + 独立 kind 便于对账。
	uid := userID
	ctx = llmusage.WithCall(ctx, llmusage.Call{Feature: llmusage.FeaturePrism, UserID: &uid})
	out, err := inlineReviewFn(ctx, m.system, m.task+"\n\n"+sel)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}
