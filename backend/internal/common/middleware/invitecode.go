// ============================================================================
// Scholay学术 V1.0
// 邀请码透传中间件 —— 把 X-Invite-Code 请求头写进 request context。
//
// 归因通道(契约第 6 条):前端把落地页存下的邀请码放在请求头 X-Invite-Code,
// 后端仅在「新用户创建成功(事务提交后)」时消费它 —— 消费方是 internal/invite
// 的归因钩子(经 user.SetInviteAttributor 注入),用 InviteCodeFromContext 取值。
//
// 挂载点:整个 /api/v1 组(见 routes.go)。只透传不校验:码是否真实存在由
// invite.Service 判定;超长直接丢弃(header 可被任意伪造,先掐掉滥用面)。
// ============================================================================

package middleware

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
)

// InviteCodeHeader 前端携带邀请码的请求头名。
const InviteCodeHeader = "X-Invite-Code"

// inviteCodeMaxLen 超过该长度的 header 直接丢弃(合法码只有 8 位,列宽 16)。
const inviteCodeMaxLen = 16

// inviteCodeCtxKey 私有 ctx key 类型,避免与其他 WithValue 冲突。
type inviteCodeCtxKey struct{}

// InviteCodeMiddleware 把 X-Invite-Code 请求头(如有)写进 request context。
func InviteCodeMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		code := strings.TrimSpace(c.GetHeader(InviteCodeHeader))
		if code != "" && len(code) <= inviteCodeMaxLen {
			c.Request = c.Request.WithContext(
				context.WithValue(c.Request.Context(), inviteCodeCtxKey{}, code))
		}
		c.Next()
	}
}

// InviteCodeFromContext 取出请求头里带的邀请码;没带则返回空串。
func InviteCodeFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(inviteCodeCtxKey{}).(string); ok {
		return v
	}
	return ""
}
