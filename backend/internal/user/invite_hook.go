// ============================================================================
// Scholay学术 V1.0
// 邀请归因钩子 —— 「新用户创建成功」时把注册归因到邀请人(internal/invite)。
//
// 为什么是包级 setter 而不是直接 import internal/invite:
//   归因是 user 域之外的旁路关注点;依赖保持单向(main 装配时注入),user 包
//   对 invite 的存在零感知,invite 下线时只需删 bootstrap 里一行接线。
//
// 调用契约(所有调用点必须遵守):
//   1. 只在「本次请求真的新建了用户」的路径调 —— 已存在用户登录绝不归因;
//   2. 在创建事务 **提交之后** 调 —— 防事务回滚留下归因孤儿;
//   3. ctx 必须是贯穿自 gin 请求的 ctx(X-Invite-Code 由 InviteCodeMiddleware
//      写在里面;丢 ctx = 丢码,归因静默落空)。
// ============================================================================

package user

import (
	"context"
	"log/slog"
)

// inviteAttributor 归因回调(bootstrap 经 SetInviteAttributor 注入 invite.Service)。
var inviteAttributor func(ctx context.Context, invitedUserID uint, method string)

// SetInviteAttributor 注入邀请归因回调。nil 安全:未注入时所有归因调用都是 no-op。
func SetInviteAttributor(fn func(ctx context.Context, invitedUserID uint, method string)) {
	inviteAttributor = fn
}

// notifyInviteRegistered 各注册成功路径(事务提交后)统一走这里。
// 硬性要求:归因任何失败(未注入 / 内部错误 / 甚至 panic)都绝不影响注册返回 ——
// 回调自身只 slog 不上抛(见 invite.AttributeFromContext),这里再兜一层 recover。
// 同步调用:请求没带邀请码时回调零成本返回;带码也只有 1-2 条索引命中语句,不值得起 goroutine
// (异步反而引入「请求 ctx 已结束」的取值竞态)。
func notifyInviteRegistered(ctx context.Context, invitedUserID uint, method string) {
	if inviteAttributor == nil || invitedUserID == 0 {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			slog.Error("invite attribution panic (注册不受影响)",
				"invited_user_id", invitedUserID, "method", method, "panic", r)
		}
	}()
	inviteAttributor(ctx, invitedUserID, method)
}
